# Deployment Guide

This guide provides step-by-step instructions for deploying the Email Warm-up Service to Cloudflare Workers.

## Prerequisites Checklist

- [ ] Cloudflare account with Workers Paid plan ($5/month)
- [ ] Domain configured in Cloudflare (optional, for custom domain)
- [ ] Google Cloud project with Gmail API enabled
- [ ] OAuth 2.0 credentials obtained
- [ ] Node.js 18+ installed
- [ ] Wrangler CLI installed globally

## Step 1: Initial Setup

### Install Wrangler

```bash
npm install -g wrangler@latest
```

### Authenticate with Cloudflare

```bash
wrangler login
```

This will open a browser window for authentication.

## Step 2: Create Cloudflare Resources

### Create D1 Database

```bash
wrangler d1 create email-warmup-db
```

Copy the `database_id` from the output and update `wrangler.toml`.

### Create KV Namespace

```bash
wrangler kv:namespace create "API_KEYS"
```

Copy the `id` from the output and update `wrangler.toml`.

### Create Queues

```bash
wrangler queues create campaign-queue
wrangler queues create engagement-queue
```

## Step 3: Update Configuration

### Edit wrangler.toml

Replace the following placeholders:

```toml
# Replace these values
database_id = "your-database-id"  # From Step 2
id = "your-kv-namespace-id"       # From Step 2

# Optional: Update domain routing
route = { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
```

## Step 4: Initialize Database

### Run Schema Migration

```bash
wrangler d1 execute email-warmup-db --file=./schema.sql
```

Verify the tables were created:

```bash
wrangler d1 execute email-warmup-db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

## Step 5: Set Environment Secrets

### Set Google OAuth Credentials

```bash
wrangler secret put GOOGLE_CLIENT_ID
# Enter your Google Client ID when prompted

wrangler secret put GOOGLE_CLIENT_SECRET
# Enter your Google Client Secret when prompted
```

### Set Encryption Key

Generate a secure random key:

```bash
openssl rand -hex 32
```

Then set it:

```bash
wrangler secret put ENCRYPTION_KEY
# Paste the generated key
```

## Step 6: Deploy Workers

### Deploy API Worker (Main)

```bash
wrangler deploy
```

### Deploy Scheduler Worker

```bash
wrangler deploy --env scheduler
```

### Deploy Consumer Worker

```bash
wrangler deploy --env consumer
```

### Deploy Engagement Worker

```bash
wrangler deploy --env engagement
```

## Step 7: Verify Deployment

### Check Worker Status

```bash
wrangler deployments list
```

### Test API Endpoint

```bash
curl https://email-warmup-api.your-subdomain.workers.dev/
```

Expected response:
```json
{"status":"ok","service":"email-warmup-api"}
```

## Step 8: Add Gmail Pool Accounts

### Option A: Manual SQL Insertion

First, obtain OAuth tokens for each Gmail account through the OAuth flow. Then encrypt and insert:

```bash
wrangler d1 execute email-warmup-db --command "
INSERT INTO gmail_accounts (email_address, oauth_credentials, status) 
VALUES ('pool1@gmail.com', 'encrypted_oauth_json_here', 'active')
"
```

### Option B: Create Admin Script

Create a separate admin script to:
1. Run OAuth flow for each account
2. Encrypt credentials
3. Insert into database

## Step 9: Configure Cron Trigger

The cron trigger is automatically configured in `wrangler.toml`. Verify it's active:

```bash
wrangler deployments list --env scheduler
```

## Step 10: Monitor Deployment

### View Real-time Logs

```bash
wrangler tail
```

### Check Queue Activity

```bash
wrangler queues list
```

### Query Engagement Logs

```bash
wrangler d1 execute email-warmup-db --command "
SELECT 
  action_type, 
  status, 
  COUNT(*) as count 
FROM engagement_logs 
GROUP BY action_type, status
"
```

## Production Checklist

- [ ] All workers deployed successfully
- [ ] Database schema initialized
- [ ] Environment secrets configured
- [ ] Gmail pool accounts added (at least 10 for testing)
- [ ] Cron trigger active
- [ ] Custom domain configured (optional)
- [ ] Monitoring and alerts set up
- [ ] Rate limits tested
- [ ] API authentication working
- [ ] First campaign created and running

## Updating the Service

### Deploy Code Changes

```bash
# Update specific worker
wrangler deploy --env scheduler

# Update all workers
./deploy-all.sh  # Create this script
```

### Database Migrations

```bash
# Create migration file
wrangler d1 execute email-warmup-db --file=./migrations/001_add_column.sql
```

### Rollback

```bash
wrangler rollback
```

## Custom Domain Setup

### Add Route in wrangler.toml

```toml
[env.production]
route = { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
```

### Deploy with Custom Domain

```bash
wrangler deploy --env production
```

## CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## Troubleshooting

### Issue: "Database not found"

Solution: Ensure the database ID in `wrangler.toml` matches the created database.

### Issue: "Queue not found"

Solution: Create the queues using `wrangler queues create`.

### Issue: "Durable Object not found"

Solution: Ensure the migration is defined in `wrangler.toml` and deploy the main worker first.

### Issue: "Secrets not available"

Solution: Set secrets using `wrangler secret put` for each environment if needed.

## Cost Monitoring

Monitor your Cloudflare Workers usage:

1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages
3. Check usage metrics
4. Set up billing alerts

Expected costs:
- Workers Paid: $5/month base
- Requests: $0.30 per million
- D1: Included in Workers Paid
- KV: Included in Workers Paid
- Queues: Included in Workers Paid

## Support and Maintenance

### Regular Tasks

- Monitor engagement logs weekly
- Rotate Gmail account credentials monthly
- Review and optimize engagement rates
- Update OAuth tokens before expiration
- Clean up old logs (implement retention policy)

### Backup Strategy

```bash
# Backup database
wrangler d1 backup create email-warmup-db

# List backups
wrangler d1 backup list email-warmup-db
```

## Next Steps

1. Create your first client and campaign
2. Monitor engagement logs
3. Adjust engagement settings based on results
4. Scale pool size as needed
5. Implement additional features (e.g., reporting dashboard)
