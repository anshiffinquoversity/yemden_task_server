#!/usr/bin/env bash

set -euo pipefail

aws_profile="${WORQI_AWS_PROFILE:-worqi-deploy}"
aws_region="${WORQI_AWS_REGION:-ap-south-1}"
stack_name="${WORQI_BACKEND_STACK:-worqi-backend-production}"
api_domain="${WORQI_API_DOMAIN:-api.worqi.yemden.com}"

instance_id="$(aws cloudformation describe-stacks \
  --profile "$aws_profile" \
  --region "$aws_region" \
  --stack-name "$stack_name" \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue | [0]" \
  --output text)"

if [[ -z "$instance_id" || "$instance_id" == "None" ]]; then
  echo "The backend stack does not expose an EC2 instance." >&2
  exit 1
fi

ssm_parameters="$(jq -cn --arg domain "$api_domain" '{commands: [
  "set -euo pipefail",
  "dnf install -y python3",
  "test -x /opt/certbot/bin/python || python3 -m venv /opt/certbot",
  "/opt/certbot/bin/pip install --quiet --upgrade pip certbot certbot-nginx",
  "ln -sfn /opt/certbot/bin/certbot /usr/local/bin/certbot",
  "admin_email=$(sed -n \"s/^ADMIN_EMAIL=//p\" /opt/worqi/current/.env | head -n 1 | tr -d \"\\r\")",
  "test -n \"$admin_email\"",
  ("certbot --nginx --domains " + ($domain | @sh) + " --non-interactive --agree-tos --email \"$admin_email\" --redirect >/tmp/worqi-certbot.log 2>&1 || { tail -n 80 /tmp/worqi-certbot.log >&2; exit 1; }"),
  "systemctl enable --now worqi-certbot-renew.timer",
  "nginx -t",
  "systemctl reload nginx",
  "echo Worqi API TLS configured"
]}')"

command_id="$(aws ssm send-command \
  --profile "$aws_profile" \
  --region "$aws_region" \
  --instance-ids "$instance_id" \
  --document-name AWS-RunShellScript \
  --comment "Configure Worqi API TLS" \
  --parameters "$ssm_parameters" \
  --query 'Command.CommandId' \
  --output text)"

set +e
aws ssm wait command-executed \
  --profile "$aws_profile" \
  --region "$aws_region" \
  --command-id "$command_id" \
  --instance-id "$instance_id"
wait_status=$?
set -e

command_status="$(aws ssm get-command-invocation \
  --profile "$aws_profile" \
  --region "$aws_region" \
  --command-id "$command_id" \
  --instance-id "$instance_id" \
  --query Status \
  --output text)"

if [[ "$wait_status" -ne 0 || "$command_status" != "Success" ]]; then
  echo "TLS configuration failed with status ${command_status}." >&2
  aws ssm get-command-invocation \
    --profile "$aws_profile" \
    --region "$aws_region" \
    --command-id "$command_id" \
    --instance-id "$instance_id" \
    --query '{Output:StandardOutputContent,Error:StandardErrorContent}' \
    --output text >&2
  exit 1
fi

echo "HTTPS is configured for ${api_domain}."
