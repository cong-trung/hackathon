# Quality Matrix Mail Setup (for IT)

## Prerequisites

- The test command and the startup warning require branch `pre-release` at the latest commit (`latest pre-release`). They are not in older builds.
- Server access: Docker and Docker Compose on the host, and a shell in the folder that contains `docker-compose.yaml`.

## 1. Purpose

Quality Matrix (web app at http://quality-matrix-vnat.intel.com) emails product-group DLs and PdO owners when a product is final-submitted.

Emails use the internal relay `SMTP.intel.com`, port 25. The relay is plain SMTP: no STARTTLS and no login. `docker-compose.yaml` sets this relay by default. IT only needs to confirm the items in section 2.

## 2. What we need from IT

Relay: `SMTP.intel.com`, port 25, no STARTTLS, no login (internal Intel network).

| # | Item | Details | Value (IT to fill in) |
|---|------|---------|-----------------------|
| 1 | Firewall | Outbound TCP 25 from the Docker host to `SMTP.intel.com` | `<rule approved: yes/no>` |
| 2 | Relay allow-list | The relay accepts mail from the Docker host IP, without login | `<docker-host-ip>` |
| 3 | Allowed sender | The relay accepts `quality-matrix-vnat@intel.com` as sender | `<yes/no>` |
| 4 | Recipient scope | Internal intel.com DLs and users only | `<confirm>` |

The app uses the submitter's email as From when it is known, with the submitter as Reply-To. If the relay refuses that sender, the app retries once with `quality-matrix-vnat@intel.com`. So item 3 is required, and the submitter address does not need to be allowed.

## 3. Server details

- Frontend container: `hackathon-frontend`, port 8005.
- Backend container: `hackathon-backend`, port 8004.
- Env file: `.env.production` next to `docker-compose.yaml` on the Docker host. It is not in git.
- Compose loads this file into the backend container with `env_file`. The backend reads the variables from the container environment.

## 4. Configuration

| Variable | Example | Default in code | Notes |
|----------|---------|-----------------|-------|
| `QUALITY_MATRIX_MAIL_ENABLED` | `true` | `true` | `false` forces log-only mode. |
| `QUALITY_MATRIX_MAIL_TRANSPORT` | `smtp` | unset (resolved, see notes) | `smtp`, `outlook`, or `log`. If unset: `smtp` when `QUALITY_MATRIX_SMTP_HOST` is set, otherwise `outlook` on Windows, otherwise `log`. An explicit value wins. `outlook` needs desktop Outlook on Windows and does not work in Docker (it falls back to log). |
| `QUALITY_MATRIX_SMTP_HOST` | `SMTP.intel.com` | empty in code; `SMTP.intel.com` in Compose | Relay host. Empty with `smtp` transport means log only. |
| `QUALITY_MATRIX_SMTP_PORT` | `25` | `25` | `25` or `587`. Invalid values fall back to `25`. |
| `QUALITY_MATRIX_SMTP_STARTTLS` | `false` | `false` | Set `true` for 587 or when the relay requires TLS. The relay must offer STARTTLS. |
| `QUALITY_MATRIX_SMTP_USERNAME` | `<service-account>` | empty | Leave empty if the relay does not require login. If set, the app logs in. |
| `QUALITY_MATRIX_SMTP_PASSWORD` | `<secret>` | empty | Secret. Never commit or paste in chat or tickets. |
| `QUALITY_MATRIX_MAIL_FROM` | `quality-matrix-vnat@intel.com` | `quality-matrix-vnat@intel.com` | Sender used when the submitter's email is unknown, and the retry sender. Also the From of the test command. |
| `QUALITY_MATRIX_PUBLIC_URL` | `http://quality-matrix-vnat.intel.com` | `http://localhost:5173` in code; Compose defaults to `http://quality-matrix-vnat.intel.com` | Base URL for review links in emails. |
| `QUALITY_MATRIX_LOG_LEVEL` | `INFO` | `INFO` | Log level for the app logger. |

Example block (placeholders only; replace them with values from IT):

```
QUALITY_MATRIX_MAIL_ENABLED=true
QUALITY_MATRIX_MAIL_TRANSPORT=smtp
QUALITY_MATRIX_SMTP_HOST=SMTP.intel.com
QUALITY_MATRIX_SMTP_PORT=25
QUALITY_MATRIX_SMTP_STARTTLS=false
QUALITY_MATRIX_SMTP_USERNAME=
QUALITY_MATRIX_SMTP_PASSWORD=
QUALITY_MATRIX_MAIL_FROM=quality-matrix-vnat@intel.com
QUALITY_MATRIX_PUBLIC_URL=http://quality-matrix-vnat.intel.com
QUALITY_MATRIX_LOG_LEVEL=INFO
```

## 5. Steps

Run all `docker compose` commands from the folder that contains `docker-compose.yaml`. Always pass `--env-file .env.production` (see the note in step 4).

1. Check the network from the Docker host.
   - Linux: `nc -vz SMTP.intel.com 25`
   - Windows PowerShell: `Test-NetConnection SMTP.intel.com -Port 25`

2. Check the network from inside the backend container (the container must be running).

   ```
   docker exec hackathon-backend python -c "import socket; socket.create_connection(('SMTP.intel.com', 25), 10); print('reachable')"
   ```

   Expected output: `reachable`.

3. Edit `.env.production` and set the variables from section 4. On Linux, restrict the file: `chmod 600 .env.production`.

4. Apply the change. The backend container must be recreated to read new variables.
   - Environment change only:

     ```
     docker compose --env-file .env.production up -d --force-recreate hackathon-backend
     ```

   - Code or image change too:

     ```
     docker compose --env-file .env.production up -d --build
     ```

   Note: `docker-compose.yaml` also sets `QUALITY_MATRIX_PUBLIC_URL` and the proxy variables with `${...}` substitution. Compose reads that substitution from `--env-file` or the shell, not from `env_file`. Without `--env-file .env.production`, those values fall back to their defaults.

5. Check the startup log. Look for the transport line.

   ```
   docker logs hackathon-backend 2>&1 | grep -i "mail transport"
   ```

   - Expected: `Mail transport is 'smtp' (SMTP host:port SMTP.intel.com:25).`
   - Problem: `Mail transport is 'log': final-submit emails will NOT be sent.`

6. Send a test email through the configured transport. Replace the address with your own.

   ```
   docker exec -it hackathon-backend python -m app.services.notification_service --test-to <your.name>@intel.com
   ```

   Check the exit code after the command (`echo $?` in bash, `$LASTEXITCODE` in PowerShell).

   - Success (exit code `0`):

     ```
     Transport: smtp
     SMTP host:port: SMTP.intel.com:25
     Result: sent to <your.name>@intel.com via smtp.
     ```

   - Failure (exit code `1`): `Result: FAILED to send to <address>: <ExceptionType>: <message>`
   - Log only (exit code `1`): `Result: NOT sent to <address>; transport is log (see log output above).`
   - Invalid address (exit code `1`): `Result: invalid recipient address: <value>`

   The test email always uses `QUALITY_MATRIX_MAIL_FROM` as the sender. It does not test the submitter-address From (see the troubleshooting table).

## 6. Proxy note

`.env.production` sets `HTTP_PROXY` and `HTTPS_PROXY` for web traffic. SMTP does not use them: the app uses Python `smtplib`, which connects directly to the relay and does not read proxy variables. The relay must be reachable directly from the Docker host, with no proxy.

## 7. Troubleshooting

Mail failures are logged by the backend and do not fail the final submit. Check them with `docker logs hackathon-backend 2>&1 | grep -i "final-submission"`.

| Symptom | Cause | Fix |
|---------|-------|-----|
| Startup warning: `Mail transport is 'log' ... will NOT be sent` | `QUALITY_MATRIX_SMTP_HOST` is empty, or `QUALITY_MATRIX_MAIL_ENABLED=false` | Set the SMTP host in `.env.production`, then recreate the container (step 4). |
| `ConnectionRefusedError`, or `TimeoutError` after 10 seconds | Firewall blocks the port, or wrong host or port | Repeat the network checks (steps 1 and 2). Ask IT to open the firewall rule. |
| SSL or STARTTLS error, or `SMTPServerDisconnected` | `QUALITY_MATRIX_SMTP_STARTTLS` does not match the relay | Use port 587 with STARTTLS `true`, or port 25 with STARTTLS `false` as IT specified. Port 465 is not supported. |
| `SMTPNotSupportedError` (STARTTLS not supported) | STARTTLS is `true` but the relay does not offer it | Set STARTTLS to `false` or confirm the port with IT. |
| `SMTPAuthenticationError` | Wrong username or password, or the relay does not use login | Verify the service account with IT. If the relay needs no login, leave `QUALITY_MATRIX_SMTP_USERNAME` and `QUALITY_MATRIX_SMTP_PASSWORD` empty. |
| `SMTPRecipientsRefused` or `550 relay denied` | Docker host IP is not allow-listed, or the recipient is external or not allowed | Ask IT to allow-list the Docker host IP. Use internal recipients only. |
| `SMTPSenderRefused`, or log WARNING `SMTP relay refused sender ... retrying with` | The relay rejected the submitter's email as From | Automatic: the app retries once with `quality-matrix-vnat@intel.com` as From and keeps the submitter as Reply-To. If the retry also fails, the relay does not allow `quality-matrix-vnat@intel.com`: ask IT to allow it. |
| Email arrives but the review link is wrong | `QUALITY_MATRIX_PUBLIC_URL` is wrong, or was not applied | Check the value. Recreate with `--env-file .env.production` (step 4). |
| Log shows `no valid PdO owner or product group emails` | No valid recipient addresses in the submitted data | Ask the app owner to check the PdO owner and product group email fields. |
| Emails go to spam | SPF, DKIM, or DMARC is missing for the sender domain | Ask IT to publish SPF and DKIM for the sending domain. |

## 8. Security

- Secrets live only in `.env.production` on the Docker host. Restrict access (`chmod 600` on Linux, owner-only ACL on Windows).
- `.env.production` is ignored by git (`.env.*` in `.gitignore`). Never commit it.
- If the password is exposed, rotate it with IT and update `.env.production`, then recreate the container.
- Use a least-privilege service account that can only send mail through the relay.
- If a username is set and STARTTLS is `false`, the password is sent unencrypted. Use STARTTLS whenever login is used.

## 9. Rollback

To stop sending mail and keep the app running (emails are logged only):

1. Set `QUALITY_MATRIX_MAIL_ENABLED=false` in `.env.production`. Clearing `QUALITY_MATRIX_SMTP_HOST` alone does not stop mail: Compose falls back to `SMTP.intel.com`.
2. Recreate the backend container:

   ```
   docker compose --env-file .env.production up -d --force-recreate hackathon-backend
   ```

## 10. Contact

App owner: Anh Minh Phan (anh.minh.phan@intel.com)
