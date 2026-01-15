import { Hono } from 'hono';
import { Env, APIKeyData, EngagementSettings } from '../types';
import { generateApiKey } from '../utils/crypto';
import { PoolCoordinator } from '../durable-objects/pool-coordinator';

const app = new Hono<{ Bindings: Env }>();

// Middleware: API Key Authentication
app.use('/api/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401);
  }

  const apiKey = authHeader.substring(7);
  const keyData = await c.env.API_KEYS.get(apiKey);

  if (!keyData) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  const apiKeyData: APIKeyData = JSON.parse(keyData);
  c.set('clientId', apiKeyData.clientId);
  
  await next();
});

// Health check endpoint
app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'email-warmup-api' });
});

// Register a new client
app.post('/api/clients', async (c) => {
  const { name, email } = await c.req.json();

  if (!name || !email) {
    return c.json({ error: 'Name and email are required' }, 400);
  }

  try {
    // Insert client into database
    const result = await c.env.DB.prepare(
      'INSERT INTO clients (name, email) VALUES (?, ?)'
    ).bind(name, email).run();

    const clientId = result.meta.last_row_id;

    // Generate API key
    const apiKey = generateApiKey();
    
    // Store API key in KV
    const apiKeyData: APIKeyData = {
      clientId: clientId as number,
      createdAt: new Date().toISOString()
    };
    
    await c.env.API_KEYS.put(apiKey, JSON.stringify(apiKeyData));

    return c.json({
      clientId,
      apiKey,
      message: 'Client registered successfully'
    }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create a new campaign
app.post('/api/campaigns', async (c) => {
  const clientId = c.get('clientId');
  const { senderEmail, poolSize, engagementSettings } = await c.req.json();

  if (!senderEmail || !poolSize) {
    return c.json({ error: 'senderEmail and poolSize are required' }, 400);
  }

  // Default engagement settings
  const defaultSettings: EngagementSettings = {
    open_rate: 0.8,
    click_rate: 0.2,
    reply_rate: 0.05,
    move_to_inbox_rate: 0.9
  };

  const settings = { ...defaultSettings, ...engagementSettings };

  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO campaigns (client_id, sender_email, pool_size, engagement_settings, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      clientId,
      senderEmail,
      poolSize,
      JSON.stringify(settings),
      'active'
    ).run();

    return c.json({
      campaignId: result.meta.last_row_id,
      status: 'active',
      message: 'Campaign created successfully'
    }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get campaign details
app.get('/api/campaigns/:id', async (c) => {
  const clientId = c.get('clientId');
  const campaignId = c.req.param('id');

  try {
    const campaign = await c.env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ? AND client_id = ?'
    ).bind(campaignId, clientId).first();

    if (!campaign) {
      return c.json({ error: 'Campaign not found' }, 404);
    }

    return c.json(campaign);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// List all campaigns for a client
app.get('/api/campaigns', async (c) => {
  const clientId = c.get('clientId');

  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC'
    ).bind(clientId).all();

    return c.json({ campaigns: results });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Update campaign
app.put('/api/campaigns/:id', async (c) => {
  const clientId = c.get('clientId');
  const campaignId = c.req.param('id');
  const { poolSize, engagementSettings, status } = await c.req.json();

  try {
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];

    if (poolSize !== undefined) {
      updates.push('pool_size = ?');
      values.push(poolSize);
    }
    if (engagementSettings !== undefined) {
      updates.push('engagement_settings = ?');
      values.push(JSON.stringify(engagementSettings));
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(campaignId, clientId);

    await c.env.DB.prepare(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`
    ).bind(...values).run();

    return c.json({ message: 'Campaign updated successfully' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete campaign
app.delete('/api/campaigns/:id', async (c) => {
  const clientId = c.get('clientId');
  const campaignId = c.req.param('id');

  try {
    await c.env.DB.prepare(
      'UPDATE campaigns SET status = ? WHERE id = ? AND client_id = ?'
    ).bind('completed', campaignId, clientId).run();

    return c.json({ message: 'Campaign deleted successfully' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get campaign report
app.get('/api/reports/:campaignId', async (c) => {
  const clientId = c.get('clientId');
  const campaignId = c.req.param('campaignId');

  try {
    // Verify campaign belongs to client
    const campaign = await c.env.DB.prepare(
      'SELECT * FROM campaigns WHERE id = ? AND client_id = ?'
    ).bind(campaignId, clientId).first();

    if (!campaign) {
      return c.json({ error: 'Campaign not found' }, 404);
    }

    // Get engagement statistics
    const stats = await c.env.DB.prepare(`
      SELECT 
        action_type,
        status,
        COUNT(*) as count
      FROM engagement_logs
      WHERE campaign_id = ?
      GROUP BY action_type, status
    `).bind(campaignId).all();

    // Calculate rates
    const totalActions = stats.results.reduce((sum: number, row: any) => sum + row.count, 0);
    const successfulActions = stats.results
      .filter((row: any) => row.status === 'success')
      .reduce((sum: number, row: any) => sum + row.count, 0);

    const actionBreakdown: any = {};
    stats.results.forEach((row: any) => {
      if (!actionBreakdown[row.action_type]) {
        actionBreakdown[row.action_type] = { success: 0, failed: 0 };
      }
      actionBreakdown[row.action_type][row.status] = row.count;
    });

    return c.json({
      campaignId,
      totalActions,
      successRate: totalActions > 0 ? successfulActions / totalActions : 0,
      actionBreakdown
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Export Durable Object
export { PoolCoordinator };

export default app;
