# Email Setup for CareerClaw

## Install msmtp

```bash
brew install msmtp
```

## Configure ~/.msmtprc

```
defaults
auth           on
tls            on
tls_trust_file /etc/ssl/cert.pem
logfile        ~/.msmtp.log

account        levee
host           smtp.gmail.com
port           587
from           Guillermo@Levee.Biz
user           Guillermo@Levee.Biz
password       YOUR_APP_PASSWORD

account default : levee
```

Then secure it:

```bash
chmod 600 ~/.msmtprc
```

## Gmail App Password

1. Go to https://myaccount.google.com/apppasswords
2. Generate an app password for "Mail"
3. Paste it in ~/.msmtprc as the password

## Test

```bash
echo "Test from CareerClaw" | msmtp --from="Guillermo@Levee.Biz" your-test@email.com
```

## How it works

- Scripts queue emails to `~/.careerclaw/email-queue.jsonl`
- `process-emails.sh` reads the queue and sends via `send-email.sh`
- Same pattern as the DB write queue (queue locally, process externally)
- Logs go to `~/.careerclaw/email-log.jsonl`
