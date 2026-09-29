#!/usr/bin/env bash
# Prints the values to paste into GitHub -> Settings -> Secrets and variables -> Actions -> Variables
set -euo pipefail
REGION="${AWS_REGION:?export AWS_REGION first}"
BASE_STACK="${BASE_STACK:-ms-base}"
OIDC_STACK="${OIDC_STACK:-ms-github-oidc}"
out() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$1" \
  --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text; }

printf '%-24s %s\n' AWS_REGION             "$REGION"
printf '%-24s %s\n' AWS_DEPLOY_ROLE_ARN    "$(out "$OIDC_STACK" GitHubDeployRoleArn)"
printf '%-24s %s\n' CFN_EXECUTION_ROLE_ARN "$(out "$OIDC_STACK" CfnExecutionRoleArn)"
printf '%-24s %s\n' ECS_CLUSTER_NAME       "$(out "$BASE_STACK" ClusterName)"
printf '%-24s %s\n' VPC_ID                 "$(out "$BASE_STACK" VpcId)"
printf '%-24s %s\n' TASK_SUBNETS           "$(out "$BASE_STACK" TaskSubnets)"
printf '%-24s %s\n' ASSIGN_PUBLIC_IP       "$(out "$BASE_STACK" AssignPublicIp)"
printf '%-24s %s\n' ALB_LISTENER_ARN       "$(out "$BASE_STACK" AlbListenerArn)"
printf '%-24s %s\n' ALB_SG_ID              "$(out "$BASE_STACK" AlbSecurityGroupId)"
printf '%-24s %s\n' SERVICES_SG_ID         "$(out "$BASE_STACK" ServicesSecurityGroupId)"
printf '%-24s %s\n' SC_NAMESPACE_ARN       "$(out "$BASE_STACK" ServiceConnectNamespaceArn)"
echo
echo "ALB URL: http://$(out "$BASE_STACK" AlbDnsName)"
