import { Env, CampaignQueueMessage, EngagementQueueMessage, EngagementSettings } from '../types';

export default {
  async queue(batch: MessageBatch<CampaignQueueMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Processing batch of ${batch.messages.length} campaign messages`);

    for (const message of batch.messages) {
      try {
        const { campaignId } = message.body;

        // Fetch campaign details
        const campaign = await env.DB.prepare(
          'SELECT * FROM campaigns WHERE id = ? AND status = ?'
        ).bind(campaignId, 'active').first();

        if (!campaign) {
          console.log(`Campaign ${campaignId} not found or not active`);
          message.ack();
          continue;
        }

        const senderEmail = campaign.sender_email as string;
        const poolSize = campaign.pool_size as number;
        const engagementSettings: EngagementSettings = JSON.parse(campaign.engagement_settings as string);

        // Get Durable Object for this campaign
        const doId = env.POOL_COORDINATOR.idFromName(`campaign-${campaignId}`);
        const doStub = env.POOL_COORDINATOR.get(doId);

        // Request pool accounts from Durable Object
        const response = await doStub.fetch('http://internal/select-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poolSize, campaignId })
        });

        const { accountIds } = await response.json() as { accountIds: number[] };

        if (accountIds.length === 0) {
          console.log(`No available accounts for campaign ${campaignId}`);
          message.ack();
          continue;
        }

        console.log(`Selected ${accountIds.length} accounts for campaign ${campaignId}`);

        // For each selected account, determine actions and enqueue
        for (const accountId of accountIds) {
          const actions: Array<'open' | 'click' | 'reply' | 'move_to_inbox'> = [];

          // Determine which actions to perform based on engagement settings
          if (Math.random() < engagementSettings.move_to_inbox_rate) {
            actions.push('move_to_inbox');
          }
          if (Math.random() < engagementSettings.open_rate) {
            actions.push('open');
          }
          if (Math.random() < engagementSettings.click_rate) {
            actions.push('click');
          }
          if (Math.random() < engagementSettings.reply_rate) {
            actions.push('reply');
          }

          // Enqueue each action with a random delay (0-300 seconds)
          for (const actionType of actions) {
            const engagementMessage: EngagementQueueMessage = {
              campaignId,
              gmailAccountId: accountId,
              senderEmail,
              actionType
            };

            const delaySeconds = Math.floor(Math.random() * 300);
            await env.ENGAGEMENT_QUEUE.send(engagementMessage, { delaySeconds });
          }
        }

        message.ack();
        console.log(`Successfully processed campaign ${campaignId}`);
      } catch (error) {
        console.error(`Error processing campaign message:`, error);
        message.retry();
      }
    }
  }
};
