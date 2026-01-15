import { Env } from '../types';

/**
 * PoolCoordinator Durable Object
 * Manages the state of pool account selection and rate limiting for campaigns
 */
export class PoolCoordinator {
  private state: DurableObjectState;
  private env: Env;
  private lastUsedAccounts: Map<number, number>; // accountId -> timestamp

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.lastUsedAccounts = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/select-accounts' && request.method === 'POST') {
      return await this.selectAccounts(request);
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Select available accounts from the pool for a campaign
   */
  private async selectAccounts(request: Request): Promise<Response> {
    try {
      const { poolSize, campaignId } = await request.json() as { poolSize: number; campaignId: number };

      // Load state from storage
      await this.loadState();

      // Fetch all active accounts from database
      const { results: allAccounts } = await this.env.DB.prepare(
        'SELECT id, last_used_at FROM gmail_accounts WHERE status = ? ORDER BY last_used_at ASC NULLS FIRST LIMIT ?'
      ).bind('active', poolSize * 2).all();

      if (allAccounts.length === 0) {
        return Response.json({ accountIds: [] });
      }

      // Filter accounts based on rate limiting
      const now = Date.now();
      const minTimeBetweenUses = 3600000; // 1 hour in milliseconds
      const availableAccounts = allAccounts.filter((account: any) => {
        const accountId = account.id;
        const lastUsed = this.lastUsedAccounts.get(accountId);

        if (!lastUsed) {
          return true; // Never used
        }

        return (now - lastUsed) >= minTimeBetweenUses;
      });

      // Select up to poolSize accounts
      const selectedAccounts = availableAccounts.slice(0, Math.min(poolSize, availableAccounts.length));
      const accountIds = selectedAccounts.map((account: any) => account.id as number);

      // Update last used timestamps in state
      accountIds.forEach(id => {
        this.lastUsedAccounts.set(id, now);
      });

      // Persist state
      await this.saveState();

      return Response.json({ accountIds });
    } catch (error: any) {
      console.error('Error selecting accounts:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  /**
   * Load state from Durable Object storage
   */
  private async loadState(): Promise<void> {
    const stored = await this.state.storage.get<Record<string, number>>('lastUsedAccounts');
    if (stored) {
      this.lastUsedAccounts = new Map(Object.entries(stored).map(([k, v]) => [parseInt(k), v]));
    }
  }

  /**
   * Save state to Durable Object storage
   */
  private async saveState(): Promise<void> {
    const toStore: Record<string, number> = {};
    this.lastUsedAccounts.forEach((timestamp, accountId) => {
      toStore[accountId.toString()] = timestamp;
    });
    await this.state.storage.put('lastUsedAccounts', toStore);
  }

  /**
   * Alarm handler for cleanup (optional)
   */
  async alarm(): Promise<void> {
    // Clean up old entries (older than 24 hours)
    await this.loadState();
    const now = Date.now();
    const dayInMs = 86400000;

    for (const [accountId, timestamp] of this.lastUsedAccounts.entries()) {
      if (now - timestamp > dayInMs) {
        this.lastUsedAccounts.delete(accountId);
      }
    }

    await this.saveState();

    // Schedule next cleanup in 1 hour
    await this.state.storage.setAlarm(Date.now() + 3600000);
  }
}
