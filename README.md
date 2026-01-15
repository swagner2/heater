# Email Warm-up Service

A serverless email warm-up API service built on Cloudflare Workers that helps improve email deliverability by automating engagement actions (opens, clicks, replies) from a pool of Gmail accounts.

## Architecture

The service consists of multiple Cloudflare Workers:

- **API Worker**: Handles client requests, campaign management, and reporting
- **Scheduler Worker**: Triggered by Cron to initiate warm-up cycles
- **Campaign Consumer Worker**: Processes campaign tasks and selects pool accounts
- **Engagement Worker**: Executes individual engagement actions via Gmail API
- **Durable Object**: Manages pool account state and rate limiting

## Prerequisites

- Node.js 18+ and npm/pnpm
- Cloudflare account with Workers paid plan
- Wrangler CLI installed (`npm install -g wrangler`)
- Google Cloud project with Gmail API enabled
- OAuth 2.0 credentials for Gmail API

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Wrangler

Update `wrangler.toml` with your Cloudflare account details:

- Replace `your-database-id` with your D1 database ID
- Replace `your-kv-namespace-id` with your KV namespace ID
- Update the route pattern with your domain

### 3. Create Cloudflare Resources

```bash
# Create D1 database
wrangler d1 create email-warmup-db

# Create KV namespace
wrangler kv:namespace create "API_KEYS"

# Create queues
wrangler queues create campaign-queue
wrangler queues create engagement-queue
```

### 4. Initialize Database

```bash
npm run db:init
```

### 5. Configure Environment Variables

Set the following in your Cloudflare Workers dashboard or via `wrangler secret`:

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put ENCRYPTION_KEY
```

### 6. Add Gmail Pool Accounts

You'll need to manually add Gmail accounts to the pool. First, obtain OAuth tokens for each account, then encrypt and store them:

```sql
INSERT INTO gmail_accounts (email_address, oauth_credentials, status) 
VALUES ('pool-account@gmail.com', 'encrypted_oauth_json', 'active');
```

## Deployment

### Deploy All Workers

```bash
# Deploy API Worker
wrangler deploy

# Deploy Scheduler Worker
wrangler deploy --env scheduler

# Deploy Consumer Worker
wrangler deploy --env consumer

# Deploy Engagement Worker
wrangler deploy --env engagement
```

### Development Mode

```bash
npm run dev
```

## API Usage

### 1. Register a Client

```bash
curl -X POST https://api.yourdomain.com/api/clients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Client Name",
    "email": "client@example.com"
  }'
```

Response:
```json
{
  "clientId": 1,
  "apiKey": "your-api-key-here",
  "message": "Client registered successfully"
}
```

### 2. Create a Campaign

```bash
curl -X POST https://api.yourdomain.com/api/campaigns \
  -H "Authorization: Bearer your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "senderEmail": "sender@example.com",
    "poolSize": 250,
    "engagementSettings": {
      "open_rate": 0.8,
      "click_rate": 0.2,
      "reply_rate": 0.05,
      "move_to_inbox_rate": 0.9
    }
  }'
```

### 3. Get Campaign Report

```bash
curl https://api.yourdomain.com/api/reports/1 \
  -H "Authorization: Bearer your-api-key-here"
```

### 4. List Campaigns

```bash
curl https://api.yourdomain.com/api/campaigns \
  -H "Authorization: Bearer your-api-key-here"
```

### 5. Update Campaign

```bash
curl -X PUT https://api.yourdomain.com/api/campaigns/1 \
  -H "Authorization: Bearer your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "paused"
  }'
```

## Configuration

### Engagement Settings

- `open_rate`: Probability (0-1) that an email will be opened
- `click_rate`: Probability (0-1) that a link will be clicked
- `reply_rate`: Probability (0-1) that a reply will be sent
- `move_to_inbox_rate`: Probability (0-1) that an email will be moved from spam to inbox

### Scheduler Frequency

The default cron schedule is every 15 minutes (`*/15 * * * *`). You can adjust this in `wrangler.toml`:

```toml
[env.scheduler.triggers]
crons = ["*/30 * * * *"]  # Every 30 minutes
```

## Gmail API Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Gmail API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URIs

### 2. OAuth Flow

You'll need to implement an OAuth flow to obtain tokens for each Gmail pool account. A simple approach:

1. Create a Cloudflare Pages site for the OAuth callback
2. Use the authorization code flow to obtain tokens
3. Encrypt and store tokens in the database

## Monitoring

### View Logs

```bash
npm run tail
```

### Check Queue Status

```bash
wrangler queues list
```

### Database Queries

```bash
wrangler d1 execute email-warmup-db --command "SELECT COUNT(*) FROM engagement_logs"
```

## Security Considerations

1. **API Keys**: Stored in KV with client isolation
2. **OAuth Tokens**: Encrypted in D1 database using AES-GCM
3. **Rate Limiting**: Managed by Durable Objects to prevent abuse
4. **HTTPS Only**: All communication over TLS

## Scaling

The service automatically scales with Cloudflare's global network:

- **250 pool accounts**: ~7,500 engagements/day
- **500 pool accounts**: ~15,000 engagements/day
- **1000 pool accounts**: ~30,000 engagements/day

## Cost Estimation

Based on Cloudflare Workers pricing ($5/month + $0.30/million requests):

- 1000 pool accounts
- 10 engagements per account per day
- 300,000 requests/month
- **Estimated cost**: ~$5-10/month

## Troubleshooting

### Common Issues

1. **"Account not available"**: Check that Gmail accounts are marked as 'active' in the database
2. **"Failed to refresh token"**: Verify OAuth credentials and ensure refresh tokens are valid
3. **"No messages found"**: The sender hasn't sent emails to the pool accounts yet

### Debug Mode

Enable verbose logging by adding console.log statements in the Workers.

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
