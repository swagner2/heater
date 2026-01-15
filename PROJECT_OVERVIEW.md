# Email Warm-up Service - Project Overview

## Introduction

This is a complete, production-ready email warm-up API service built on Cloudflare Workers. The service helps improve email deliverability by automating engagement actions (opens, clicks, replies, moving from spam to inbox) from a pool of Gmail accounts.

## Project Structure

```
email-warmup-service/
├── src/
│   ├── api/
│   │   └── index.ts                 # Main API Worker (Hono framework)
│   ├── scheduler/
│   │   └── index.ts                 # Cron-triggered Scheduler Worker
│   ├── consumer/
│   │   └── index.ts                 # Campaign Consumer Worker
│   ├── engagement/
│   │   └── index.ts                 # Engagement Action Worker
│   ├── durable-objects/
│   │   └── pool-coordinator.ts      # Durable Object for state management
│   ├── utils/
│   │   ├── crypto.ts                # Encryption and API key utilities
│   │   └── gmail.ts                 # Gmail API helper functions
│   └── types/
│       └── index.ts                 # TypeScript type definitions
├── schema.sql                       # D1 database schema
├── wrangler.toml                    # Cloudflare Workers configuration
├── package.json                     # Node.js dependencies
├── tsconfig.json                    # TypeScript configuration
├── README.md                        # User documentation
├── DEPLOYMENT.md                    # Deployment guide
└── .gitignore                       # Git ignore rules
```

## Key Components

### 1. API Worker (`src/api/index.ts`)

The main API endpoint built with Hono framework. Handles:

- Client registration and API key generation
- Campaign creation, retrieval, update, and deletion
- Campaign reporting and analytics
- API key authentication middleware

**Endpoints:**
- `POST /api/clients` - Register a new client
- `POST /api/campaigns` - Create a campaign
- `GET /api/campaigns` - List campaigns
- `GET /api/campaigns/:id` - Get campaign details
- `PUT /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete campaign
- `GET /api/reports/:campaignId` - Get campaign report

### 2. Scheduler Worker (`src/scheduler/index.ts`)

Triggered by Cron every 15 minutes. Responsibilities:

- Query all active campaigns from D1 database
- Enqueue a message to the Campaign Queue for each active campaign
- Initiate the warm-up cycle

### 3. Campaign Consumer Worker (`src/consumer/index.ts`)

Consumes messages from the Campaign Queue. Responsibilities:

- Fetch campaign details and engagement settings
- Interact with Durable Object to select available pool accounts
- Determine which engagement actions to perform based on probability settings
- Enqueue individual engagement actions to the Engagement Queue with random delays

### 4. Engagement Worker (`src/engagement/index.ts`)

Consumes messages from the Engagement Queue. Responsibilities:

- Retrieve and decrypt Gmail account OAuth credentials
- Refresh access tokens if expired
- Execute engagement actions via Gmail API:
  - **Open**: Remove UNREAD label
  - **Move to Inbox**: Remove SPAM/PROMOTIONS labels, add INBOX label
  - **Click**: Extract and visit safe links (avoiding unsubscribe)
  - **Reply**: Send a generic reply
- Log all actions to the database

### 5. Durable Object (`src/durable-objects/pool-coordinator.ts`)

Manages stateful coordination for pool accounts. Responsibilities:

- Track last usage time for each pool account
- Enforce rate limiting (minimum 1 hour between uses)
- Select available accounts for campaigns
- Persist state across invocations

### 6. Utility Functions

**Crypto (`src/utils/crypto.ts`):**
- Generate random API keys
- Hash API keys for storage
- Encrypt/decrypt OAuth credentials using AES-GCM

**Gmail (`src/utils/gmail.ts`):**
- Refresh OAuth access tokens
- List messages from specific senders
- Get full message details
- Modify message labels
- Send replies
- Extract and filter links

## Database Schema

### Tables

1. **clients**: Stores client information
2. **gmail_accounts**: Pool of Gmail accounts with encrypted OAuth credentials
3. **campaigns**: Campaign configurations and settings
4. **engagement_logs**: Logs of all engagement actions

### Relationships

- `campaigns.client_id` → `clients.id`
- `engagement_logs.campaign_id` → `campaigns.id`
- `engagement_logs.gmail_account_id` → `gmail_accounts.id`

## Data Flow

1. **Scheduling Phase**:
   - Cron Trigger → Scheduler Worker
   - Scheduler queries active campaigns
   - Enqueues to Campaign Queue

2. **Campaign Processing Phase**:
   - Campaign Queue → Consumer Worker
   - Consumer fetches campaign details
   - Consumer requests accounts from Durable Object
   - Consumer determines actions based on engagement settings
   - Enqueues to Engagement Queue with delays

3. **Engagement Execution Phase**:
   - Engagement Queue → Engagement Worker
   - Worker retrieves Gmail credentials
   - Worker executes action via Gmail API
   - Worker logs result to database

## Configuration

### Engagement Settings

Each campaign has customizable engagement settings:

```json
{
  "open_rate": 0.8,           // 80% chance to open
  "click_rate": 0.2,          // 20% chance to click
  "reply_rate": 0.05,         // 5% chance to reply
  "move_to_inbox_rate": 0.9   // 90% chance to move to inbox
}
```

### Rate Limiting

- Minimum 1 hour between uses of the same pool account
- Configurable in `pool-coordinator.ts` (`minTimeBetweenUses`)

### Scheduling

- Default: Every 15 minutes (`*/15 * * * *`)
- Configurable in `wrangler.toml`

## Security Features

1. **API Key Authentication**: All API endpoints require Bearer token authentication
2. **Client Isolation**: Each client's data is isolated by `client_id`
3. **Encrypted Credentials**: OAuth tokens encrypted with AES-GCM
4. **Secure Key Storage**: API keys stored in Workers KV, credentials in D1
5. **HTTPS Only**: All communication over TLS

## Scalability

### Current Capacity

- **250 pool accounts**: ~7,500 engagements/day
- **500 pool accounts**: ~15,000 engagements/day
- **1000 pool accounts**: ~30,000 engagements/day

### Cloudflare Limits

- Workers CPU time: 30 seconds (paid plan)
- D1 database size: 10 GB (paid plan)
- Queue batch size: Configurable (default 10)
- Subrequests: 1000 per invocation (paid plan)

## Cost Estimation

Based on 1000 pool accounts with 10 engagements per day:

- **Workers Paid Plan**: $5/month
- **Requests**: 300,000/month = $0.09
- **Total**: ~$5-10/month

## Dependencies

### Runtime Dependencies

- `hono`: ^4.0.0 - Fast web framework for Cloudflare Workers

### Development Dependencies

- `@cloudflare/workers-types`: ^4.20241218.0 - TypeScript types
- `typescript`: ^5.3.3 - TypeScript compiler
- `wrangler`: ^3.85.0 - Cloudflare Workers CLI

## Environment Variables

Required secrets (set via `wrangler secret put`):

- `GOOGLE_CLIENT_ID`: OAuth 2.0 client ID
- `GOOGLE_CLIENT_SECRET`: OAuth 2.0 client secret
- `ENCRYPTION_KEY`: 32-byte hex string for credential encryption

## Testing Strategy

### Local Development

```bash
npm run dev
```

### Integration Testing

1. Deploy to staging environment
2. Create test client and campaign
3. Monitor logs with `wrangler tail`
4. Verify engagement logs in database

### Production Testing

1. Start with small pool size (10-50 accounts)
2. Monitor for 24-48 hours
3. Check success rates in reports
4. Gradually increase pool size

## Monitoring and Observability

### Logs

- Real-time: `wrangler tail`
- Historical: Cloudflare Dashboard → Workers → Logs

### Metrics

- Request count and error rate (Cloudflare Dashboard)
- Engagement success rate (via API reports)
- Queue depth and processing time

### Alerts

Set up alerts for:
- High error rates
- Queue backlog
- Failed OAuth refreshes
- Database errors

## Maintenance Tasks

### Daily

- Monitor error logs
- Check queue processing

### Weekly

- Review engagement success rates
- Analyze campaign performance
- Check for failed Gmail accounts

### Monthly

- Rotate encryption keys (if policy requires)
- Update OAuth tokens for accounts
- Review and optimize engagement settings
- Database cleanup (old logs)

## Future Enhancements

### Planned Features

1. **Multi-provider Support**: Outlook, Yahoo, Hotmail
2. **Advanced Reporting**: Dashboard with charts and analytics
3. **Webhook Notifications**: Real-time campaign updates
4. **Auto-scaling**: Dynamic pool size adjustment
5. **A/B Testing**: Test different engagement strategies
6. **Reply Templates**: Customizable reply messages
7. **Spam Score Tracking**: Monitor sender reputation
8. **Account Health Monitoring**: Detect and handle suspended accounts

### Technical Improvements

1. **OAuth Flow Automation**: Self-service account addition
2. **Batch Operations**: Bulk campaign creation
3. **Rate Limit Optimization**: Per-sender rate limiting
4. **Caching Layer**: Cache campaign settings in KV
5. **Dead Letter Queue**: Handle permanently failed tasks
6. **Metrics Export**: Prometheus/Grafana integration

## Known Limitations

1. **Gmail API Quotas**: 250 quota units per user per second
2. **Worker CPU Time**: 30 seconds maximum per invocation
3. **OAuth Token Expiry**: Requires manual refresh if refresh token expires
4. **No Real Browser**: Link clicks are HEAD requests, not full browser simulation
5. **Single Provider**: Currently only supports Gmail

## Troubleshooting

See `DEPLOYMENT.md` for common issues and solutions.

## License

MIT License - See LICENSE file for details.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Submit a pull request

## Support

For questions and support:
- GitHub Issues: [Repository URL]
- Documentation: See README.md and DEPLOYMENT.md
- Email: support@yourdomain.com

## Changelog

### Version 1.0.0 (Initial Release)

- Complete email warm-up service implementation
- Support for Gmail accounts
- API for campaign management
- Automated scheduling and engagement
- Durable Object for state management
- Comprehensive documentation
