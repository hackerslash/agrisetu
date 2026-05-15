# Deployment

agrisetu deploys to two AWS Lightsail VMs hosted by the **AimpathyMinds platform
team**. Deploys are **keyless** — they run from this repo's GitHub Actions using a
short-lived OIDC token, no SSH key, no AWS access key.

The deploy workflow (`.github/workflows/deploy-main.yml`) is **already wired**. You
only have to do **§1 once**. Everything after that is automatic on push to `main`.

---

## 1. One-time setup — add one repo secret (you do this)

**🔑 Ask the AimpathyMinds platform team for one value:** the **`ci_deploy_role_arn`**
(it looks like `arn:aws:iam::<account>:role/ampy-agri-prod-iam-ci-deploy`).

Then in GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|-------------|-------|
| `AWS_ROLE_ARN` | the `ci_deploy_role_arn` you were given |

That is the **only** secret needed. You can delete the old `DEPLOY_HOST`,
`DEPLOY_USER`, `DEPLOY_SSH_KEY` secrets — they are no longer used.

> This is an ARN (an identifier), not a credential. It is safe to store as a
> repo secret. If anyone offers you an AWS access key or SSH key, decline — this
> setup is intentionally keyless and that would be a security regression.

---

## 2. Deploying (automatic)

Push to `main` (or run the workflow manually via **Actions → Deploy To Server →
Run workflow**). The workflow:

1. Gets a short-lived AWS token via OIDC (trust is pinned to this repo + `main`).
2. Tells AWS SSM to run the deploy on the app box (`ampy-agri-prod-ls-app`).
3. The deploy command is the **same one you used before**:
   `git pull → npm ci → npm run db:migrate → build api+web → restart services → reload nginx`.
4. Waits, prints the deploy stdout/stderr, and fails the run if the deploy failed.

No SSH, nothing to maintain. To change deploy steps, edit the `Commands=[...]`
array in `.github/workflows/deploy-main.yml`.

---

## 3. First deploy — one dependency on AimpathyMinds

The VMs are bare. **Before the very first deploy**, your runtime stack (Node,
nginx, Postgres, systemd units `agrisetu-api` / `agrisetu-web`, the `/opt/agrisetu`
checkout) must be installed once. You cannot SSH in (port 22 is closed by design).

**🔑 Ask the AimpathyMinds platform team to run a one-time bootstrap.** Give them a
`scripts/bootstrap.sh` in this repo (install your stack + clone into `/opt/agrisetu`
+ create the two systemd units). They run it once on each box and confirm both
boxes are **`PingStatus=Online`** in AWS SSM Fleet Manager. After that, **every
deploy is fully self-service** — you never need them again unless a box is rebuilt.

---

## 4. Logs

Deploy output is printed in the GitHub Actions run (the "Wait for deploy" step
shows stdout/stderr).

For deeper/historical reads there is a separate **read-only** AWS role.
**🔑 Ask AimpathyMinds for `log_reader_role_arn`** if you need it, then:

```bash
aws sts assume-role --role-arn <log_reader_role_arn> \
  --role-session-name agri-logs --region ap-south-1
# export the returned creds, then:
aws ssm list-command-invocations --details --region ap-south-1
```

This role can only read SSM command output. Live application log streaming
(CloudWatch) is **planned for a later phase** — for now, have your deploy/restart
steps echo what you need into the SSM command output.

---

## 5. DNS (you do this, in your DNS provider)

**🔑 Ask AimpathyMinds for `app_public_ip` and `db_public_ip`** (static, won't
change unless a box is rebuilt), then set:

| Record | Type | Value |
|--------|------|-------|
| `api.agrisetu.in` | A | `app_public_ip` |
| `ui-vendor.agrisetu.in` | A | `db_public_ip` |

---

## What AimpathyMinds owns vs. what you own

| AimpathyMinds platform team | agrisetu team (you) |
|------------------------------|---------------------|
| The 2 VMs, IPs, AWS IAM roles, SSM setup | The `AWS_ROLE_ARN` repo secret (§1) |
| One-time box bootstrap; re-register a box if it's rebuilt | `scripts/bootstrap.sh` + your real deploy steps |
| Keeping the deploy/log roles valid | Your DNS records (§5) |
| | App code, Postgres data, **your own backups** |

---

## Troubleshooting

| Symptom | Cause → Fix |
|---------|-------------|
| `Could not assume role ... sts:AssumeRoleWithWebIdentity` | Not on `main`, or `AWS_ROLE_ARN` wrong/missing, or you removed `permissions: id-token: write`. Trust is pinned to this repo on `main`. |
| Workflow fails at "Resolve app instance id" with the SSM-not-Online error | The box isn't registered with SSM. **🔑 Ask AimpathyMinds** to confirm `PingStatus=Online`. Don't retry blindly. |
| `AccessDenied` on `ssm:SendCommand` | You set `AWS_ROLE_ARN` to the log-reader ARN. Use the **ci-deploy** ARN. |
| Deploy runs but app unchanged | Your deploy steps / app issue, not infra. Read the printed stdout/stderr in the Actions run. |
| After a box was rebuilt, deploys fail | **🔑 Ask AimpathyMinds** — instance recreate needs a one-time SSM re-registration by them. |

---

## Rollback (old SSH method — reference only)

The previous SSH workflow ran this on the host (kept here in case of emergency
fallback; requires the old `DEPLOY_*` secrets and an open SSH port, which is
**no longer the supported path**):

```
cd /opt/agrisetu && git checkout main && git pull --ff-only origin main && npm ci \
  && npm run db:migrate && npm run build --workspace=apps/api \
  && npm run build --workspace=apps/web \
  && sudo -n systemctl restart agrisetu-api agrisetu-web && sudo -n systemctl reload nginx
```

---

*Provisioned by the AimpathyMinds platform team — PI14-plt-aip Track 9
(CF-1 + CF-3). Deeper technical reference (AimpathyMinds side):
`portfolio/infrastructure/docs/agrisetu-deploy-workflow.md`. Security/architecture
rationale: ADR `PI14-agri-0001 §Addendum 2026-05-15`.*
