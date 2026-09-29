#!/usr/bin/env bash
# Copies stack outputs into GitHub Actions variables.
# Requires: aws CLI, gh CLI (gh auth login). Run from inside the repo folder.
set -euo pipefail

REGION="${AWS_REGION:?export AWS_REGION first}"
BASE_STACK="${BASE_STACK:-ms-base}"
OIDC_STACK="${OIDC_STACK:-ms-github-oidc}"

out() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}
set_var() { printf '  %-24s %s\n' "$1" "$2"; gh variable set "$1" --body "$2"; }

echo "Setting GitHub variables:"
set_var AWS_REGION             "$REGION"
set_var AWS_DEPLOY_ROLE_ARN    "$(out "$OIDC_STACK" GitHubDeployRoleArn)"
set_var CFN_EXECUTION_ROLE_ARN "$(out "$OIDC_STACK" CfnExecutionRoleArn)"
set_var ECS_CLUSTER_NAME       "$(out "$BASE_STACK" ClusterName)"
set_var VPC_ID                 "$(out "$BASE_STACK" VpcId)"
set_var TASK_SUBNETS           "$(out "$BASE_STACK" TaskSubnets)"
set_var ASSIGN_PUBLIC_IP       "$(out "$BASE_STACK" AssignPublicIp)"
set_var ALB_LISTENER_ARN       "$(out "$BASE_STACK" AlbListenerArn)"
set_var ALB_SG_ID              "$(out "$BASE_STACK" AlbSecurityGroupId)"
set_var SERVICES_SG_ID         "$(out "$BASE_STACK" ServicesSecurityGroupId)"
set_var SC_NAMESPACE_ARN       "$(out "$BASE_STACK" ServiceConnectNamespaceArn)"
echo "Done. ALB: http://$(out "$BASE_STACK" AlbDnsName)"
