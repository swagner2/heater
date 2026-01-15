import { Env, CampaignQueueMessage } from '../types';

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Scheduler triggered at:', new Date(event.scheduledTime).toISOString());

    try {
      // Fetch all active campaigns
      const { results: campaigns } = await env.DB.prepare(
        'SELECT id, sender_email, pool_size FROM campaigns WHERE status = ?'
      ).bind('active').all();

      console.log(`Found ${campaigns.length} active campaigns`);

      // Enqueue a task for each active campaign
      for (const campaign of campaigns) {
        const message: CampaignQueueMessage = {
          campaignId: campaign.id as number
        };

        await env.CAMPAIGN_QUEUE.send(message);
        console.log(`Enqueued campaign ${campaign.id}`);
      }

      console.log('Scheduler completed successfully');
    } catch (error) {
      console.error('Scheduler error:', error);
      throw error;
    }
  }
};
