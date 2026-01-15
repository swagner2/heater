import { Env, EngagementQueueMessage, OAuthCredentials } from '../types';
import {
  listMessages,
  getMessage,
  modifyMessage,
  sendReply,
  extractLinks,
  filterUnsubscribeLinks,
  refreshAccessToken
} from '../utils/gmail';
import { decryptCredentials } from '../utils/crypto';

// Environment variables for OAuth (should be set in wrangler.toml or dashboard)
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
const GOOGLE_CLIENT_SECRET = 'YOUR_GOOGLE_CLIENT_SECRET';
const ENCRYPTION_KEY = 'YOUR_ENCRYPTION_KEY'; // Should be stored securely

export default {
  async queue(batch: MessageBatch<EngagementQueueMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Processing batch of ${batch.messages.length} engagement messages`);

    for (const message of batch.messages) {
      try {
        const { campaignId, gmailAccountId, senderEmail, actionType } = message.body;

        // Fetch Gmail account credentials
        const account = await env.DB.prepare(
          'SELECT * FROM gmail_accounts WHERE id = ? AND status = ?'
        ).bind(gmailAccountId, 'active').first();

        if (!account) {
          console.log(`Gmail account ${gmailAccountId} not found or not active`);
          await logEngagement(env, campaignId, gmailAccountId, actionType, 'failed', 'Account not available');
          message.ack();
          continue;
        }

        // Decrypt OAuth credentials
        let credentials = await decryptCredentials(
          account.oauth_credentials as string,
          ENCRYPTION_KEY
        ) as OAuthCredentials;

        // Check if token needs refresh
        if (credentials.expiry_date < Date.now()) {
          console.log(`Refreshing access token for account ${gmailAccountId}`);
          credentials = await refreshAccessToken(
            credentials.refresh_token,
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET
          );
          
          // Update credentials in database
          const { encryptCredentials } = await import('../utils/crypto');
          const encryptedCreds = await encryptCredentials(credentials, ENCRYPTION_KEY);
          await env.DB.prepare(
            'UPDATE gmail_accounts SET oauth_credentials = ? WHERE id = ?'
          ).bind(encryptedCreds, gmailAccountId).run();
        }

        // Perform the engagement action
        await performEngagementAction(
          env,
          credentials.access_token,
          campaignId,
          gmailAccountId,
          senderEmail,
          actionType
        );

        // Update last_used_at
        await env.DB.prepare(
          'UPDATE gmail_accounts SET last_used_at = ? WHERE id = ?'
        ).bind(new Date().toISOString(), gmailAccountId).run();

        message.ack();
        console.log(`Successfully processed ${actionType} for campaign ${campaignId}`);
      } catch (error: any) {
        console.error(`Error processing engagement message:`, error);
        await logEngagement(
          env,
          message.body.campaignId,
          message.body.gmailAccountId,
          message.body.actionType,
          'failed',
          error.message
        );
        message.retry();
      }
    }
  }
};

async function performEngagementAction(
  env: Env,
  accessToken: string,
  campaignId: number,
  gmailAccountId: number,
  senderEmail: string,
  actionType: 'open' | 'click' | 'reply' | 'move_to_inbox'
): Promise<void> {
  try {
    // List messages from sender
    const messages = await listMessages(accessToken, senderEmail, 5);

    if (messages.length === 0) {
      console.log(`No messages found from ${senderEmail}`);
      await logEngagement(env, campaignId, gmailAccountId, actionType, 'failed', 'No messages found');
      return;
    }

    // Pick a random message
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    const messageId = randomMessage.id;

    // Get full message details
    const fullMessage = await getMessage(accessToken, messageId);
    const subject = fullMessage.payload.headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';

    switch (actionType) {
      case 'move_to_inbox':
        // Remove SPAM label and add INBOX label
        await modifyMessage(accessToken, messageId, ['INBOX'], ['SPAM', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES']);
        await logEngagement(env, campaignId, gmailAccountId, actionType, 'success', null, subject);
        break;

      case 'open':
        // Mark as read by removing UNREAD label
        await modifyMessage(accessToken, messageId, [], ['UNREAD']);
        await logEngagement(env, campaignId, gmailAccountId, actionType, 'success', null, subject);
        break;

      case 'click':
        // Extract and click a safe link
        const htmlContent = getHtmlContent(fullMessage);
        if (htmlContent) {
          const links = extractLinks(htmlContent);
          const safeLinks = filterUnsubscribeLinks(links);

          if (safeLinks.length > 0) {
            const randomLink = safeLinks[Math.floor(Math.random() * safeLinks.length)];
            
            // Simulate click by making a HEAD request
            try {
              await fetch(randomLink, { method: 'HEAD', redirect: 'follow' });
              await logEngagement(env, campaignId, gmailAccountId, actionType, 'success', null, subject);
            } catch (fetchError) {
              console.error(`Failed to click link: ${randomLink}`, fetchError);
              await logEngagement(env, campaignId, gmailAccountId, actionType, 'failed', 'Link click failed', subject);
            }
          } else {
            await logEngagement(env, campaignId, gmailAccountId, actionType, 'failed', 'No safe links found', subject);
          }
        } else {
          await logEngagement(env, campaignId, gmailAccountId, actionType, 'failed', 'No HTML content', subject);
        }
        break;

      case 'reply':
        // Send a generic reply
        const replyBody = generateReply();
        await sendReply(
          accessToken,
          senderEmail,
          subject,
          replyBody,
          fullMessage.threadId,
          messageId
        );
        await logEngagement(env, campaignId, gmailAccountId, actionType, 'success', null, subject);
        break;
    }
  } catch (error: any) {
    throw error;
  }
}

function getHtmlContent(message: any): string | null {
  if (message.payload.mimeType === 'text/html') {
    return Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
  }

  if (message.payload.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === 'text/html') {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          if (subPart.mimeType === 'text/html') {
            return Buffer.from(subPart.body.data, 'base64').toString('utf-8');
          }
        }
      }
    }
  }

  return null;
}

function generateReply(): string {
  const replies = [
    'Thank you for reaching out!',
    'Thanks for the information.',
    'Appreciate the update!',
    'Got it, thanks!',
    'Thanks for sharing this.',
    'This is helpful, thank you!'
  ];

  return replies[Math.floor(Math.random() * replies.length)];
}

async function logEngagement(
  env: Env,
  campaignId: number,
  gmailAccountId: number,
  actionType: string,
  status: 'success' | 'failed',
  errorMessage: string | null = null,
  subject: string | null = null
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO engagement_logs (campaign_id, gmail_account_id, action_type, target_email_subject, status, error_message) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(campaignId, gmailAccountId, actionType, subject, status, errorMessage).run();
}
