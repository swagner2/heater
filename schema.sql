-- Email Warm-up Service Database Schema for Cloudflare D1

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Gmail accounts pool
CREATE TABLE IF NOT EXISTS gmail_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_address TEXT NOT NULL UNIQUE,
    oauth_credentials TEXT NOT NULL, -- Encrypted JSON string
    status TEXT NOT NULL CHECK(status IN ('active', 'needs_reauth', 'disabled')) DEFAULT 'active',
    last_used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    sender_email TEXT NOT NULL,
    pool_size INTEGER NOT NULL DEFAULT 250,
    engagement_settings TEXT NOT NULL, -- JSON string
    status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'completed')) DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Engagement logs
CREATE TABLE IF NOT EXISTS engagement_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    gmail_account_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('open', 'click', 'reply', 'move_to_inbox')),
    target_email_subject TEXT,
    status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_campaigns_client_id ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_engagement_logs_campaign_id ON engagement_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_engagement_logs_created_at ON engagement_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_status ON gmail_accounts(status);
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_last_used ON gmail_accounts(last_used_at);
