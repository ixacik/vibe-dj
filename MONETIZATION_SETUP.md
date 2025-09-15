# Monetization Setup - Quick Guide

## 1. Database Setup (One-time)

Run the SQL migration in Supabase:
1. Go to [SQL Editor](https://supabase.com/dashboard/project/bfyryqnuafzutsaxjvql/sql/new)
2. Copy contents from `supabase/migrations/001_create_monetization_tables.sql`
3. Click "Run"

## 2. Stripe Setup

Add these environment variables to your `.env.local`:
```
VITE_STRIPE_PRO_PRICE_ID=price_xxx
VITE_STRIPE_ULTRA_PRICE_ID=price_xxx
```

For Supabase Edge Functions, add these secrets:
```
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

## 3. How It Works

### Tiers
- **Free**: 10 GPT-5-mini requests/month, no GPT-5
- **Pro** ($9.99): Unlimited GPT-5-mini, no GPT-5
- **Ultra** ($29.99): Unlimited everything

### Usage Tracking
- Quotas reset automatically on the 1st of each month
- Frontend shows "X/10 requests left" for free users
- Edge function enforces limits and returns 402 status when exceeded

### Error Handling
- If database tables don't exist, defaults to free tier
- Graceful degradation - app works even if monetization fails
- Clear upgrade prompts when limits hit

## 4. Testing

1. Create a test user
2. Make 10 requests with GPT-5-mini
3. 11th request should trigger upgrade modal
4. Test Stripe checkout flow
5. Verify tier updates after payment

## Common Issues

**"Table not found" errors**: Run the SQL migration
**Stripe webhooks failing**: Check webhook secret is correct
**Usage not tracking**: Check edge function logs in Supabase

That's it! Simple monetization for a hobby project.