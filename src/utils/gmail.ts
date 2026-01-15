// Gmail API utility functions
import { OAuthCredentials } from '../types';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

/**
 * Refresh OAuth access token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthCredentials> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expiry_date: Date.now() + (data.expires_in * 1000)
  };
}

/**
 * List messages from a specific sender
 */
export async function listMessages(
  accessToken: string,
  senderEmail: string,
  maxResults: number = 5
): Promise<any[]> {
  const query = `from:${senderEmail} is:unread`;
  const url = `${GMAIL_API_BASE}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to list messages: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.messages || [];
}

/**
 * Get full message details
 */
export async function getMessage(accessToken: string, messageId: string): Promise<any> {
  const url = `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to get message: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Modify message labels (mark as read, move to inbox, etc.)
 */
export async function modifyMessage(
  accessToken: string,
  messageId: string,
  addLabels: string[] = [],
  removeLabels: string[] = []
): Promise<void> {
  const url = `${GMAIL_API_BASE}/users/me/messages/${messageId}/modify`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      addLabelIds: addLabels,
      removeLabelIds: removeLabels
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to modify message: ${response.statusText}`);
  }
}

/**
 * Send a reply to an email
 */
export async function sendReply(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  threadId: string,
  messageId: string
): Promise<void> {
  const email = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${messageId}`,
    '',
    body
  ].join('\r\n');

  const encodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const url = `${GMAIL_API_BASE}/users/me/messages/send`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw: encodedEmail,
      threadId: threadId
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send reply: ${response.statusText}`);
  }
}

/**
 * Extract links from email HTML content
 */
export function extractLinks(htmlContent: string): string[] {
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/gi;
  const links: string[] = [];
  let match;

  while ((match = linkRegex.exec(htmlContent)) !== null) {
    links.push(match[1]);
  }

  return links;
}

/**
 * Filter out unsubscribe links
 */
export function filterUnsubscribeLinks(links: string[]): string[] {
  const unsubscribeKeywords = ['unsubscribe', 'opt-out', 'optout', 'remove', 'manage-preferences'];
  
  return links.filter(link => {
    const lowerLink = link.toLowerCase();
    return !unsubscribeKeywords.some(keyword => lowerLink.includes(keyword));
  });
}
