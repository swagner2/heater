// Type definitions for the Email Warm-up Service

export interface Env {
  DB: D1Database;
  API_KEYS: KVNamespace;
  CAMPAIGN_QUEUE: Queue;
  ENGAGEMENT_QUEUE: Queue;
  POOL_COORDINATOR: DurableObjectNamespace;
}

export interface Client {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export interface GmailAccount {
  id: number;
  email_address: string;
  oauth_credentials: string; // Encrypted JSON
  status: 'active' | 'needs_reauth' | 'disabled';
  last_used_at: string | null;
  created_at: string;
}

export interface Campaign {
  id: number;
  client_id: number;
  sender_email: string;
  pool_size: number;
  engagement_settings: string; // JSON string
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface EngagementSettings {
  open_rate: number; // 0-1
  click_rate: number; // 0-1
  reply_rate: number; // 0-1
  move_to_inbox_rate: number; // 0-1
}

export interface EngagementLog {
  id: number;
  campaign_id: number;
  gmail_account_id: number;
  action_type: 'open' | 'click' | 'reply' | 'move_to_inbox';
  target_email_subject: string | null;
  status: 'success' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface CampaignQueueMessage {
  campaignId: number;
}

export interface EngagementQueueMessage {
  campaignId: number;
  gmailAccountId: number;
  senderEmail: string;
  actionType: 'open' | 'click' | 'reply' | 'move_to_inbox';
}

export interface APIKeyData {
  clientId: number;
  createdAt: string;
}

export interface OAuthCredentials {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}
