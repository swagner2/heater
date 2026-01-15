#!/bin/bash

echo "=== Email Warm-up Service Quick Start ==="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

echo "✅ Wrangler CLI found"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo ""

# Create D1 database
echo "🗄️  Creating D1 database..."
echo "Run: wrangler d1 create email-warmup-db"
echo "Then update wrangler.toml with the database_id"
echo ""

# Create KV namespace
echo "🔑 Creating KV namespace..."
echo "Run: wrangler kv:namespace create API_KEYS"
echo "Then update wrangler.toml with the namespace id"
echo ""

# Create queues
echo "📬 Creating queues..."
echo "Run: wrangler queues create campaign-queue"
echo "Run: wrangler queues create engagement-queue"
echo ""

# Initialize database
echo "🔧 After updating wrangler.toml, initialize the database:"
echo "Run: npm run db:init"
echo ""

# Set secrets
echo "🔐 Set environment secrets:"
echo "Run: wrangler secret put GOOGLE_CLIENT_ID"
echo "Run: wrangler secret put GOOGLE_CLIENT_SECRET"
echo "Run: wrangler secret put ENCRYPTION_KEY"
echo ""

# Deploy
echo "🚀 Deploy all workers:"
echo "Run: wrangler deploy"
echo "Run: wrangler deploy --env scheduler"
echo "Run: wrangler deploy --env consumer"
echo "Run: wrangler deploy --env engagement"
echo ""

echo "📚 For detailed instructions, see DEPLOYMENT.md"
