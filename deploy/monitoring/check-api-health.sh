#!/usr/bin/env bash

set -euo pipefail

aws_region="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-south-1}}"
api_url="${WORQI_API_HEALTH_URL:-https://api.worqi.yemden.com/api/health}"
metric_value=0

if curl --fail --silent --show-error --max-time 15 "$api_url" \
  | jq -e '.status == "ok"' >/dev/null; then
  metric_value=1
fi

aws cloudwatch put-metric-data \
  --region "$aws_region" \
  --namespace Worqi/Production \
  --metric-name APIHealth \
  --dimensions Service=API \
  --unit Count \
  --value "$metric_value"
