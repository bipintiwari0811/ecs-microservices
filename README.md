# ECS Microservices — multiple Node.js services on one ECS cluster (GitHub Actions)

Several microservices share **one VPC, one ALB and one ECS Fargate cluster**. Each service is its own
CloudFormation stack (`svc-<name>`) created from one generic template, with its own ECR repo, secret,
IAM roles, target group and ALB path.

```
                    Internet
                       │
             ALB (public subnets, HTTP 80)
          /users/*  ───┼───  /orders/*          (path-based listener rules)
             │                   │
     ┌───────▼──────┐    ┌───────▼──────┐
     │ svc-users    │◄───│ svc-orders   │       private subnets, no public IP
     │ 2 tasks      │    │ 2 tasks      │       orders calls http://users:3000
     └──────┬───────┘    └──────┬───────┘       (ECS Service Connect)
            │                   │
   users/app secret     orders/app secret       Secrets Manager (one per service)
            └──── NAT Gateway ──┘               ECR, Secrets Manager, CloudWatch Logs
```

Example services included:

| Service | Path | Priority | Endpoints |
|---|---|---|---|
| `users` | `/users` | 10 | `/users/health`, `/users`, `/users/list`, `/users/:id` |
| `orders` | `/orders` | 20 | `/orders/health`, `/orders`, `/orders/list`, `/orders/:id` (calls `users`) |

---

## Contents

1. [Project structure](#1-project-structure)
2. [Prerequisites](#2-prerequisites)
3. [Connect AWS CLI](#3-connect-aws-cli)
4. [Deploy shared AWS infrastructure](#4-deploy-shared-aws-infrastructure)
5. [Configure GitHub](#5-configure-github)
6. [First deployment and verification](#6-first-deployment-and-verification)
7. [How the pipeline decides what to deploy](#7-how-the-pipeline-decides-what-to-deploy)
8. [Add a new service (e.g. a third one)](#8-add-a-new-service)
9. [Secrets](#9-secrets)
10. [Service-to-service calls](#10-service-to-service-calls)
11. [Task size and scaling](#11-task-size-and-scaling)
12. [Troubleshooting](#12-troubleshooting)
13. [Cleanup](#13-cleanup)

---

## 1. Project structure

```
.github/workflows/deploy.yml      detect changed services -> test -> validate -> build/push -> deploy (matrix)
infra/
  base-network.yaml               VPC, subnets, NAT, ALB, ECS cluster, Service Connect namespace, shared SG
  github-oidc-role.yaml           GitHub OIDC provider + deploy roles
  service.yaml                    Generic service: secret, IAM, task def, service, target group, ALB rule, autoscaling
services/
  users/                          src/ test/ Dockerfile package.json service.conf
  orders/                         src/ test/ Dockerfile package.json service.conf
scripts/
  set-github-vars.sh              stack outputs -> GitHub variables (needs gh CLI)
  print-vars.sh                   prints the variable values to paste manually
  new-service.sh                  scaffolds a new service folder
```

A **service** = any folder under `services/` containing a `service.conf`:

```bash
# services/orders/service.conf
PATH_PATTERN=/orders   # ALB path
PRIORITY=20            # ALB listener rule priority - must be unique
PORT=3000
CPU=256                # Fargate CPU units
MEMORY=512             # MB
DESIRED=2              # tasks at start
MIN=2                  # autoscaling min
MAX=4                  # autoscaling max
```

AWS resources per stack:

| Stack | Deployed by | Contains |
|---|---|---|
| `ms-base` | laptop, once | VPC, subnets, IGW, NAT, ALB + listener, ECS cluster, Service Connect namespace, shared services SG |
| `ms-github-oidc` | laptop, once | OIDC provider, `GitHubDeployRole`, `CfnExecutionRole` |
| `svc-users`, `svc-orders`, ... | pipeline | per-service secret, roles, log group, task def, service, target group, listener rule, autoscaling |

ECR repos (`users`, `orders`, ...) are created automatically by the pipeline.

---

## 2. Prerequisites

- AWS account, AWS CLI v2, Git, `jq`
- GitHub repository (push this project to its root — make sure the `.github` folder is included)
- Optional: GitHub CLI `gh` for `set-github-vars.sh`
- Windows: use Git Bash or WSL

---

## 3. Connect AWS CLI

Create an IAM user (e.g. `ms-cli`) with `AdministratorAccess` (testing) and an access key for CLI use.

```bash
aws configure --profile ms          # keys, region ap-south-1, output json

# every new terminal:
export AWS_PROFILE=ms
export AWS_REGION=ap-south-1
export GH_USER=<github-username>    # exactly as in github.com/<user>/<repo>
export GH_REPO=<repo-name>

aws sts get-caller-identity
```

---

## 4. Deploy shared AWS infrastructure

From the repo root.

### 4.1 Base (~4 min)

```bash
aws cloudformation deploy --stack-name ms-base \
  --template-file infra/base-network.yaml \
  --parameter-overrides UseNatGateway=true
```

`UseNatGateway=true` → tasks in private subnets (recommended).
`UseNatGateway=false` → tasks in public subnets with a public IP (no NAT cost, testing only).

### 4.2 GitHub OIDC

```bash
# Numeric IDs (needed for repos created after 15 July 2026)
curl -s https://api.github.com/repos/$GH_USER/$GH_REPO | jq '{owner_id: .owner.id, repo_id: .id}'
# private repo: gh api repos/$GH_USER/$GH_REPO --jq '{owner_id: .owner.id, repo_id: .id}'

# If token.actions.githubusercontent.com is already listed, add CreateOidcProvider=false below
aws iam list-open-id-connect-providers

aws cloudformation deploy --stack-name ms-github-oidc \
  --template-file infra/github-oidc-role.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides GitHubOrg=$GH_USER GitHubRepo=$GH_REPO \
    GitHubOwnerId=<owner_id> GitHubRepoId=<repo_id>
```

---

## 5. Configure GitHub

### 5.1 Variables

Settings → **Secrets and variables → Actions → Variables tab**. Use the **actual values**, not the output names.

```bash
./scripts/set-github-vars.sh     # automatic (gh CLI)
./scripts/print-vars.sh          # or print and paste manually
```

| Variable | From |
|---|---|
| `AWS_REGION` | your region |
| `AWS_DEPLOY_ROLE_ARN` | `ms-github-oidc` → `GitHubDeployRoleArn` |
| `CFN_EXECUTION_ROLE_ARN` | `ms-github-oidc` → `CfnExecutionRoleArn` |
| `ECS_CLUSTER_NAME` | `ms-base` → `ClusterName` |
| `VPC_ID` | `ms-base` → `VpcId` |
| `TASK_SUBNETS` | `ms-base` → `TaskSubnets` (both IDs, comma-separated) |
| `ASSIGN_PUBLIC_IP` | `ms-base` → `AssignPublicIp` |
| `ALB_LISTENER_ARN` | `ms-base` → `AlbListenerArn` |
| `ALB_SG_ID` | `ms-base` → `AlbSecurityGroupId` |
| `SERVICES_SG_ID` | `ms-base` → `ServicesSecurityGroupId` |
| `SC_NAMESPACE_ARN` | `ms-base` → `ServiceConnectNamespaceArn` |

### 5.2 Environment

Settings → **Environments → New environment** → `production` → Configure environment.

---

## 6. First deployment and verification

Actions → **Microservices CI/CD** → **Run workflow** → service `all` → Run.
You'll see one Test job and one Deploy job per service (`Deploy users`, `Deploy orders`). ~6–8 minutes.

```bash
ALB=$(aws cloudformation describe-stacks --stack-name ms-base \
  --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" --output text)

curl http://$ALB/users/health
curl http://$ALB/users            # "secretLoaded": true, "secretKeys": ["db_user","db_password"]
curl http://$ALB/orders/health
curl http://$ALB/orders/101       # order + "user": {...} fetched from the users service
```

If `/orders/101` returns `"users service unavailable"`, see [section 10](#10-service-to-service-calls).

---

## 7. How the pipeline decides what to deploy

| Event | Services processed |
|---|---|
| Push to `main` changing `services/orders/**` | only `orders` |
| Push to `main` changing `infra/service.yaml` or the workflow | all services |
| Pull request into `main` | changed services: **test + validate only**, no deploy |
| Run workflow manually | the one you type, or `all` |
| Push changing only README / other infra files | nothing |

Each service deploys in its own job; one failing does not stop the others (`fail-fast: false`).
Deploys are rolling with the ECS circuit breaker (auto rollback on failed health checks).

---

## 8. Add a new service

Example: a third service `payments` at `/payments`.

```bash
# 1. Scaffold (copies services/users, picks a unique priority)
./scripts/new-service.sh payments /payments 30

# 2. Write your code in services/payments/src/app.js, then
cd services/payments && npm install && npm test && cd ../..

# 3. Push
git add services/payments
git commit -m "Add payments service"
git push
```

That's all. The pipeline detects the new folder, creates the `payments` ECR repo, the `payments/app`
secret and the `svc-payments` stack. No template, workflow or GitHub variable changes are needed.

Rules:
- `PRIORITY` must be unique (the script checks). Leave gaps: 10, 20, 30...
- The app must answer `GET <PATH_PATTERN>/health` with 200 (ALB health check).
- Other services can call it at `http://payments:3000` (Service Connect).
- One ALB listener supports up to 100 rules.

Manual alternative: copy any service folder, change `service.conf`, the defaults in `src/config.js`, and `package.json` name.

---

## 9. Secrets

Each service has its own secret `<service>/app`, created on first deploy with a generated password:

```json
{ "db_user": "orders_user", "db_password": "<generated>" }
```

The **whole JSON** is injected as one env var `APP_SECRETS` and parsed in `src/config.js`.
Each service's execution role can read **only its own** secret.

### Change a value or add a new key — console only, no code/template change

1. Secrets Manager → `orders/app` → **Retrieve secret value** → **Edit** → change a value or **Add row**
   (e.g. `api_key`) → **Save**.
2. ECS → Clusters → `ms-test-cluster` → Services → `orders` → **Update service** →
   tick **Force new deployment** → **Update**.

CLI:

```bash
S=orders/app
CUR=$(aws secretsmanager get-secret-value --secret-id $S --query SecretString --output text)
aws secretsmanager put-secret-value --secret-id $S --secret-string "$(echo "$CUR" | jq '. + {"api_key":"abc123"}')"
aws ecs update-service --cluster ms-test-cluster --service orders --force-new-deployment
```

Check: `curl http://$ALB/orders` → `secretKeys` now includes `api_key`.

### Use it in code

`src/config.js` is the only file that reads secrets:

```js
const secrets = parseSecrets(env.APP_SECRETS);
// ...
apiKey: secrets.api_key,
```

Then use `config.apiKey` elsewhere. Never log or return secret values.

---

## 10. Service-to-service calls

Every service is registered in ECS **Service Connect** under its own name, so inside the cluster:

```
http://users:3000/users/1
http://orders:3000/orders/101
```

`orders` uses this in `src/usersClient.js`. Traffic stays inside the VPC and is allowed by the shared
`ServicesSecurityGroup`.

**Important:** a service only discovers services that already existed when its tasks started. If `orders`
was deployed before `users` (e.g. first run in parallel), restart `orders` once:

```bash
aws ecs update-service --cluster ms-test-cluster --service orders --force-new-deployment
```

---

## 11. Task size and scaling

Per service, in `services/<name>/service.conf` (`CPU`, `MEMORY`, `DESIRED`, `MIN`, `MAX`). Push to apply.
Autoscaling target (60% average CPU) is `CpuTarget` in `infra/service.yaml`.

| CPU | vCPU | MEMORY options (MB) |
|---|---|---|
| 256 | 0.25 | 512, 1024, 2048 |
| 512 | 0.5 | 1024–4096 |
| 1024 | 1 | 2048–8192 |
| 2048 | 2 | 4096–16384 |
| 4096 | 4 | 8192–30720 |

---

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| Actions page says "Get started with GitHub Actions" | `.github/workflows/deploy.yml` not pushed — check the Code tab |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | `GH_USER`/`GH_REPO` exact case; redeploy `ms-github-oidc` with correct `GitHubOwnerId`/`GitHubRepoId`; check `AWS_DEPLOY_ROLE_ARN` |
| `unable to pull secrets ... connection issue ... Secrets Manager` | `TASK_SUBNETS` must equal `TaskSubnets` (both IDs); `ASSIGN_PUBLIC_IP` must equal `AssignPublicIp` |
| `Priority 'N' is currently in use` | Change `PRIORITY` in that service's `service.conf` |
| Stack `ROLLBACK_COMPLETE` | Delete `svc-<name>` and the `<name>/app` secret, re-run (see Cleanup) |
| `<name>/app already exists` | `aws secretsmanager delete-secret --secret-id <name>/app --force-delete-without-recovery` |
| `/orders/:id` → `users service unavailable` | Restart orders (section 10); check `aws logs tail /ecs/users --follow` |
| Deploy job skipped | No service folder changed — use Run workflow with `all` |

```bash
aws cloudformation describe-stack-events --stack-name svc-orders \
  --query "StackEvents[?contains(ResourceStatus,'FAILED')].[LogicalResourceId,ResourceStatusReason] | [0:5]" --output text
aws ecs describe-services --cluster ms-test-cluster --services users orders \
  --query 'services[].[serviceName,runningCount,events[0].message]' --output table
aws logs tail /ecs/orders --follow
```

---

## 13. Cleanup

```bash
export AWS_PROFILE=ms AWS_REGION=ap-south-1
SERVICES=$(for d in services/*/; do [ -f "$d/service.conf" ] && basename "$d"; done)

# 1. Service stacks
for s in $SERVICES; do aws cloudformation delete-stack --stack-name svc-$s; done
for s in $SERVICES; do aws cloudformation wait stack-delete-complete --stack-name svc-$s; done

# 2. Secrets (retained) and ECR repos
for s in $SERVICES; do
  aws secretsmanager delete-secret --secret-id $s/app --force-delete-without-recovery
  aws ecr delete-repository --repository-name $s --force
done

# 3. Base (NAT, ALB, cluster, VPC) and OIDC
aws cloudformation delete-stack --stack-name ms-base
aws cloudformation wait stack-delete-complete --stack-name ms-base
aws cloudformation delete-stack --stack-name ms-github-oidc
aws cloudformation wait stack-delete-complete --stack-name ms-github-oidc
```

Verify (all should be empty):

```bash
aws ec2 describe-nat-gateways --filter Name=state,Values=available,pending --query 'NatGateways[].NatGatewayId'
aws ec2 describe-addresses --query 'Addresses[].PublicIp'
aws elbv2 describe-load-balancers --query "LoadBalancers[?contains(LoadBalancerName,'ms-test')].LoadBalancerName"
aws secretsmanager list-secrets --query "SecretList[].Name"
aws ecr describe-repositories --query 'repositories[].repositoryName'
```

Finally: disable the workflow in GitHub (Actions → Microservices CI/CD → ⋯ → Disable workflow) and delete the
`ms-cli` access key in IAM.
