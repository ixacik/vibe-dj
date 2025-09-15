-- Simple monetization tables for hobby project
-- Run this in Supabase SQL editor

-- Drop everything first to start fresh
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Users can view own quotas" ON usage_quotas;
DROP POLICY IF EXISTS "Users can view own logs" ON usage_logs;
DROP POLICY IF EXISTS "Service role manages subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Service role manages quotas" ON usage_quotas;
DROP POLICY IF EXISTS "Service role manages logs" ON usage_logs;

DROP TABLE IF EXISTS usage_logs CASCADE;
DROP TABLE IF EXISTS usage_quotas CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;

-- 1. Subscription tracking
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'ultra')),
  status TEXT DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Usage tracking (resets monthly)
CREATE TABLE usage_quotas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
  gpt5_mini_count INTEGER DEFAULT 0,
  gpt5_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Usage logs for simple analytics
CREATE TABLE usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  model TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Basic indexes for performance
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_usage_quotas_user_id ON usage_quotas(user_id);
CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at DESC);

-- 5. Enable RLS (Row Level Security)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies - Users can only see their own data
CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own quotas" ON usage_quotas
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own logs" ON usage_logs
  FOR SELECT USING (auth.uid() = user_id);

-- 7. Service role policies for edge functions
CREATE POLICY "Service role manages subscriptions" ON subscriptions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role manages quotas" ON usage_quotas
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role manages logs" ON usage_logs
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- 8. Initialize existing users with free tier
INSERT INTO subscriptions (user_id, tier, status)
SELECT id, 'free', 'active'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- 9. Initialize usage quotas for current month
INSERT INTO usage_quotas (user_id, period_start, gpt5_mini_count, gpt5_count)
SELECT id, date_trunc('month', CURRENT_DATE), 0, 0
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;