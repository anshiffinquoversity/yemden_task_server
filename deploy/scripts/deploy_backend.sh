#!/usr/bin/env bash

set -euo pipefail

aws_profile="${WORQI_AWS_PROFILE:-worqi-deploy}"
aws_region="${WORQI_AWS_REGION:-ap-south-1}"
stack_name="${WORQI_BACKEND_STACK:-worqi-backend-production}"
release_id="$(date -u +%Y%m%dT%H%M%SZ)"
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work_dir="$(mktemp -d)"

cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

stack_output() {
  local output_key="$1"
  aws cloudformation describe-stacks \
    --profile "$aws_profile" \
    --region "$aws_region" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue | [0]" \
    --output text
}

instance_id="$(stack_output InstanceId)"
deployment_bucket="$(stack_output DeploymentBucketName)"
backend_secret_arn="$(stack_output BackendSecretArn)"

if [[ -z "$instance_id" || "$instance_id" == "None" ]]; then
  echo "The backend stack does not expose an EC2 instance." >&2
  exit 1
fi

if [[ -z "$deployment_bucket" || "$deployment_bucket" == "None" ]]; then
  echo "The backend stack does not expose a deployment bucket." >&2
  exit 1
fi

if [[ -z "$backend_secret_arn" || "$backend_secret_arn" == "None" ]]; then
  echo "The backend stack does not expose a production secret." >&2
  exit 1
fi

echo "Packaging Worqi API release ${release_id}..."
COPYFILE_DISABLE=1 tar -czf "$work_dir/api.tar.gz" \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./uploads' \
  --exclude='./.env' \
  --exclude='./.env.atlas' \
  --exclude='./npm-debug.log' \
  -C "$source_dir" .

COPYFILE_DISABLE=1 tar -czf "$work_dir/uploads.tar.gz" -C "$source_dir/uploads" .

artifact_prefix="releases/${release_id}"
aws s3 cp "$work_dir/api.tar.gz" \
  "s3://${deployment_bucket}/${artifact_prefix}/api.tar.gz" \
  --profile "$aws_profile" \
  --region "$aws_region" \
  --only-show-errors
aws s3 cp "$work_dir/uploads.tar.gz" \
  "s3://${deployment_bucket}/${artifact_prefix}/uploads.tar.gz" \
  --profile "$aws_profile" \
  --region "$aws_region" \
  --only-show-errors

api_url="$(aws s3 presign \
  "s3://${deployment_bucket}/${artifact_prefix}/api.tar.gz" \
  --profile "$aws_profile" \
  --region "$aws_region" \
  --expires-in 1800)"
uploads_url="$(aws s3 presign \
  "s3://${deployment_bucket}/${artifact_prefix}/uploads.tar.gz" \
  --profile "$aws_profile" \
  --region "$aws_region" \
  --expires-in 1800)"

ssm_parameters="$(jq -cn \
  --arg release_id "$release_id" \
  --arg api_url "$api_url" \
  --arg uploads_url "$uploads_url" \
  --arg secret_arn "$backend_secret_arn" \
  --arg region "$aws_region" \
  '{commands: [
    "set -euo pipefail",
    ("release_id=" + ($release_id | @sh)),
    "release_dir=/opt/worqi/releases/$release_id",
    "install -d -o ec2-user -g ec2-user \"$release_dir\" /opt/worqi/shared/uploads",
    ("curl -fsSL " + ($api_url | @sh) + " -o /tmp/worqi-api.tar.gz"),
    ("curl -fsSL " + ($uploads_url | @sh) + " -o /tmp/worqi-uploads.tar.gz"),
    "tar -xzf /tmp/worqi-api.tar.gz -C \"$release_dir\"",
    "tar -xzf /tmp/worqi-uploads.tar.gz -C /opt/worqi/shared/uploads",
    "rm -f /tmp/worqi-api.tar.gz /tmp/worqi-uploads.tar.gz",
    "rm -rf \"$release_dir/uploads\"",
    "ln -s /opt/worqi/shared/uploads \"$release_dir/uploads\"",
    "chown -R ec2-user:ec2-user \"$release_dir\" /opt/worqi/shared/uploads",
    "runuser -u ec2-user -- env HOME=/home/ec2-user bash -lc \"cd \\\"$release_dir\\\" && npm ci --omit=dev\"",
    ("aws secretsmanager get-secret-value --secret-id " + ($secret_arn | @sh) + " --region " + ($region | @sh) + " --query SecretString --output text > \"$release_dir/.env\""),
    "chown ec2-user:ec2-user \"$release_dir/.env\"",
    "chmod 600 \"$release_dir/.env\"",
    "runuser -u ec2-user -- env HOME=/home/ec2-user NODE_ENV=production node -e \"require(\\\"$release_dir/src/config/env\\\")\"",
    "ln -sfn \"$release_dir\" /opt/worqi/current",
    "if [[ ! -f /etc/letsencrypt/live/api.worqi.yemden.com/fullchain.pem ]]; then install -m 0644 /opt/worqi/current/deploy/nginx/worqi-api.conf /etc/nginx/conf.d/worqi-api.conf; fi",
    "install -m 0644 /opt/worqi/current/deploy/systemd/worqi-api.service /etc/systemd/system/worqi-api.service",
    "install -m 0644 /opt/worqi/current/deploy/systemd/worqi-certbot-renew.service /etc/systemd/system/worqi-certbot-renew.service",
    "install -m 0644 /opt/worqi/current/deploy/systemd/worqi-certbot-renew.timer /etc/systemd/system/worqi-certbot-renew.timer",
    "install -m 0755 /opt/worqi/current/deploy/monitoring/check-api-health.sh /usr/local/bin/worqi-api-healthcheck",
    "install -m 0644 /opt/worqi/current/deploy/systemd/worqi-api-healthcheck.service /etc/systemd/system/worqi-api-healthcheck.service",
    "install -m 0644 /opt/worqi/current/deploy/systemd/worqi-api-healthcheck.timer /etc/systemd/system/worqi-api-healthcheck.timer",
    "systemctl daemon-reload",
    "systemctl enable --now worqi-certbot-renew.timer",
    "systemctl enable --now worqi-api-healthcheck.timer",
    "nginx -t",
    "systemctl reload nginx",
    "runuser -u ec2-user -- env HOME=/home/ec2-user PATH=/usr/local/bin:/usr/bin:/bin pm2 delete worqi-api >/dev/null 2>&1 || true",
    "runuser -u ec2-user -- env HOME=/home/ec2-user PATH=/usr/local/bin:/usr/bin:/bin pm2 save --force >/dev/null 2>&1 || true",
    "runuser -u ec2-user -- env HOME=/home/ec2-user PATH=/usr/local/bin:/usr/bin:/bin pm2 kill >/dev/null 2>&1 || true",
    "systemctl disable --now pm2-ec2-user >/dev/null 2>&1 || true",
    "systemctl enable worqi-api.service",
    "systemctl restart worqi-api.service",
    "systemctl is-active worqi-api.service",
    "echo Worqi API release installed"
  ]}')"

command_id="$(aws ssm send-command \
  --profile "$aws_profile" \
  --region "$aws_region" \
  --instance-ids "$instance_id" \
  --document-name AWS-RunShellScript \
  --comment "Deploy Worqi API ${release_id}" \
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
  echo "Backend deployment failed with status ${command_status}." >&2
  aws ssm get-command-invocation \
    --profile "$aws_profile" \
    --region "$aws_region" \
    --command-id "$command_id" \
    --instance-id "$instance_id" \
    --query '{Output:StandardOutputContent,Error:StandardErrorContent}' \
    --output text >&2
  exit 1
fi

echo "Worqi API release ${release_id} was installed successfully."
