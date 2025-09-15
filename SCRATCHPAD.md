# Vibe DJ - Development Scratchpad

## PLAN

### Fix Monetization System - Database & Integration

**Problem**: The entire monetization system is non-functional because the required database tables (`subscriptions`, `usage_quotas`, `usage_logs`) don't exist. All frontend code and edge functions are implemented but fail silently.

---

### Phase 1: Database Schema Creation (CRITICAL - Day 1)

1. **Create Subscriptions Table Migration**
   ```sql
   -- Table for user subscription data
   CREATE TABLE subscriptions (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
     stripe_customer_id TEXT UNIQUE,
     stripe_subscription_id TEXT UNIQUE,
     tier TEXT CHECK (tier IN ('free', 'pro', 'ultra')) DEFAULT 'free',
     status TEXT CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')) DEFAULT 'active',
     current_period_start TIMESTAMPTZ,
     current_period_end TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Indexes for performance
   CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
   CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
   CREATE UNIQUE INDEX idx_subscriptions_one_per_user ON subscriptions(user_id);
   ```

2. **Create Usage Quotas Table Migration**
   ```sql
   -- Table for tracking monthly usage quotas
   CREATE TABLE usage_quotas (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
     period_start TIMESTAMPTZ NOT NULL,
     gpt5_mini_count INTEGER DEFAULT 0,
     gpt5_count INTEGER DEFAULT 0,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Ensure one quota per user
   CREATE UNIQUE INDEX idx_usage_quotas_user_id ON usage_quotas(user_id);
   CREATE INDEX idx_usage_quotas_period ON usage_quotas(period_start);
   ```

3. **Create Usage Logs Table Migration**
   ```sql
   -- Table for detailed usage logging
   CREATE TABLE usage_logs (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
     model TEXT NOT NULL,
     tokens_used INTEGER DEFAULT 0,
     request_prompt TEXT,
     response_summary TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Indexes for analytics
   CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
   CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at DESC);
   CREATE INDEX idx_usage_logs_model ON usage_logs(model);
   ```

4. **Set Up RLS (Row Level Security) Policies**
   ```sql
   -- Enable RLS on all tables
   ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
   ALTER TABLE usage_quotas ENABLE ROW LEVEL SECURITY;
   ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

   -- Subscriptions policies
   CREATE POLICY "Users can view own subscription" ON subscriptions
     FOR SELECT USING (auth.uid() = user_id);

   CREATE POLICY "Service role can manage subscriptions" ON subscriptions
     FOR ALL USING (auth.jwt()->>'role' = 'service_role');

   -- Usage quotas policies
   CREATE POLICY "Users can view own quotas" ON usage_quotas
     FOR SELECT USING (auth.uid() = user_id);

   CREATE POLICY "Service role can manage quotas" ON usage_quotas
     FOR ALL USING (auth.jwt()->>'role' = 'service_role');

   -- Usage logs policies
   CREATE POLICY "Users can view own logs" ON usage_logs
     FOR SELECT USING (auth.uid() = user_id);

   CREATE POLICY "Service role can insert logs" ON usage_logs
     FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');
   ```

5. **Create Database Functions for Atomic Operations**
   ```sql
   -- Function to increment usage atomically
   CREATE OR REPLACE FUNCTION increment_usage(
     p_user_id UUID,
     p_model TEXT
   ) RETURNS void AS $$
   BEGIN
     UPDATE usage_quotas
     SET
       gpt5_mini_count = CASE WHEN p_model = 'gpt-5-mini'
         THEN gpt5_mini_count + 1 ELSE gpt5_mini_count END,
       gpt5_count = CASE WHEN p_model = 'gpt-5'
         THEN gpt5_count + 1 ELSE gpt5_count END,
       updated_at = NOW()
     WHERE user_id = p_user_id;
   END;
   $$ LANGUAGE plpgsql;
   ```

---

### Phase 2: Migration Execution & Initial Data (Day 1)

6. **Create Migration Files**
   - Create `supabase/migrations/001_create_subscription_tables.sql`
   - Include all table definitions, indexes, and RLS policies
   - Add helpful comments explaining each table's purpose

7. **Initialize Existing Users**
   ```sql
   -- Create free tier subscriptions for all existing users
   INSERT INTO subscriptions (user_id, tier, status)
   SELECT id, 'free', 'active'
   FROM auth.users
   ON CONFLICT (user_id) DO NOTHING;

   -- Initialize usage quotas for current month
   INSERT INTO usage_quotas (user_id, period_start, gpt5_mini_count, gpt5_count)
   SELECT
     id,
     date_trunc('month', CURRENT_DATE),
     0,
     0
   FROM auth.users
   ON CONFLICT (user_id) DO NOTHING;
   ```

8. **Apply Migrations**
   - Use Supabase dashboard or CLI to apply migrations
   - Verify all tables created successfully
   - Test RLS policies with sample queries

---

### Phase 3: Fix Error Handling & State Management (Day 2)

9. **Update Subscription Store Error Handling**
   - Add proper error states for failed database queries
   - Implement retry logic with exponential backoff
   - Add toast notifications for user-facing errors
   - Cache successful responses for 5 minutes
   - Add loading skeletons while data fetches

10. **Update Edge Function Error Handling**
    - Add database connection error handling
    - Implement proper transaction rollback on failures
    - Add detailed error logging for debugging
    - Return specific error codes for different failure types

11. **Add Frontend Fallbacks**
    - Show "Unable to load subscription" state
    - Disable monetized features when data unavailable
    - Add "Retry" button for failed fetches
    - Implement offline mode detection

---

### Phase 4: Usage Tracking Improvements (Day 2)

12. **Fix Atomic Usage Updates**
    - Use database function for atomic increments
    - Add optimistic updates in frontend
    - Implement proper race condition handling
    - Add usage sync on page refresh

13. **Add Monthly Reset Automation**
    - Create Supabase cron job for monthly resets
    - Archive previous month's usage before reset
    - Send email notifications about reset
    - Add grace period for timezone differences

14. **Implement Usage Analytics**
    - Create admin dashboard for usage stats
    - Add charts for daily/weekly/monthly trends
    - Track conversion rates by cohort
    - Monitor API cost vs revenue

---

### Phase 5: Stripe Integration Testing (Day 3)

15. **Test Webhook Processing**
    - Use Stripe CLI to send test webhooks
    - Verify subscription creation flow
    - Test upgrade/downgrade scenarios
    - Validate payment failure handling
    - Check idempotency for duplicate events

16. **Test Checkout Flow**
    - Create test Stripe products/prices
    - Test checkout session creation
    - Verify success/cancel redirects
    - Test metadata passing
    - Validate customer portal access

17. **Add Stripe Error Recovery**
    - Implement webhook retry queue
    - Add manual sync button for admins
    - Create reconciliation reports
    - Add alerting for webhook failures

---

### Phase 6: End-to-End Testing (Day 3)

18. **User Journey Testing**
    - Test new user signup → free tier
    - Test free tier → quota exceeded → upgrade
    - Test successful payment → tier change
    - Test subscription cancellation
    - Test re-subscription after cancel

19. **Load Testing**
    - Simulate 100 concurrent users
    - Test quota check performance
    - Validate database connection pooling
    - Monitor edge function cold starts
    - Check for memory leaks

20. **Integration Testing**
    - Write Playwright tests for critical paths
    - Add API integration tests
    - Test Stripe webhook processing
    - Validate email notifications
    - Check mobile responsiveness

---

### Phase 7: Monitoring & Observability (Day 4)

21. **Add Monitoring**
    - Set up Sentry for error tracking
    - Add custom metrics for business KPIs
    - Create dashboards for key metrics
    - Set up alerting for anomalies
    - Add performance monitoring

22. **Add Admin Tools**
    - Create admin panel for subscription management
    - Add ability to manually adjust quotas
    - Create refund processing workflow
    - Add user impersonation for debugging
    - Create audit logs for all changes

---

### Implementation Checklist

#### Day 1: Foundation
- [ ] Create all database migrations
- [ ] Apply migrations to production
- [ ] Initialize existing user data
- [ ] Verify RLS policies work
- [ ] Test basic CRUD operations

#### Day 2: Robustness
- [ ] Fix all error handling
- [ ] Add retry logic everywhere
- [ ] Implement usage tracking fixes
- [ ] Set up monthly reset automation
- [ ] Add frontend loading states

#### Day 3: Integration
- [ ] Test all Stripe webhooks
- [ ] Validate checkout flow
- [ ] Run end-to-end tests
- [ ] Perform load testing
- [ ] Fix any discovered issues

#### Day 4: Polish
- [ ] Set up monitoring
- [ ] Create admin tools
- [ ] Document everything
- [ ] Train support team
- [ ] Launch to users

---

### Success Metrics

- **Technical**
  - Zero database errors in production
  - < 100ms quota check latency
  - 99.9% webhook processing success
  - Zero revenue leakage

- **Business**
  - 10% free → paid conversion
  - < 5% monthly churn
  - 50% reduction in API costs
  - < 2% support tickets

---

### Risk Mitigation

1. **Database Migration Failure**
   - Test on staging first
   - Have rollback plan ready
   - Take database backup before migration
   - Run during low-traffic window

2. **Stripe Webhook Issues**
   - Implement idempotency
   - Add manual reconciliation
   - Log all raw webhook data
   - Set up duplicate detection

3. **Performance Degradation**
   - Add database indexes
   - Implement caching layer
   - Use connection pooling
   - Monitor query performance

4. **User Data Loss**
   - Backup before any changes
   - Test migrations thoroughly
   - Keep audit trail of changes
   - Have recovery procedures

---

### Post-Launch Monitoring (Week 1)

- Monitor error rates hourly
- Check conversion funnel daily
- Review support tickets
- Analyze usage patterns
- Optimize slow queries
- Gather user feedback
- Plan iteration improvements

---

## PLAN

### Spotify OAuth Token Refresh Implementation

**Problem**: Spotify OAuth tokens expire after 1 hour, causing the app to hang on "Loading profile..." with no mechanism to refresh them. The current retry logic incorrectly refreshes the Supabase JWT instead of the Spotify provider token.

---

### Phase 1: Immediate Fix - Stop the Hanging (Critical)

1. **Fix the broken retry interceptor in spotify-service.ts**

   - Remove the current retry logic (lines 35-53) that causes infinite loop
   - Add proper error handling that surfaces auth failures
   - Prevent silent failures that leave UI stuck

2. **Add error boundaries to SpotifyAuthButton**
   - Show clear error message when token expires
   - Add "Reconnect Spotify" button as fallback
   - Stop showing "Loading profile..." indefinitely

---

### Phase 2: Capture Provider Tokens

3. **Modify AuthProvider to capture provider tokens**

   - Extract `provider_token` from session
   - Extract `provider_refresh_token` from session (critical!)
   - Calculate and store token expiry time (now + 3600 seconds)
   - Store these in SpotifyStore **for** access across app

4. **Update SpotifyStore structure**
   - Add fields:
     - `providerToken: string | null`
     - `providerRefreshToken: string | null`
     - `tokenExpiresAt: number | null`
   - Add methods:
     - `setProviderTokens(token, refreshToken, expiresAt)`
     - `isTokenExpired(): boolean`
     - `isTokenExpiringSoon(): boolean` (5 min buffer)

---

### Phase 3: Implement Spotify Token Refresh

5. **Create Edge Function for Spotify token refresh**

   - Path: `supabase/functions/refresh-spotify-token/index.ts`
   - Accepts: `provider_refresh_token` in request body
   - Process:
     ```
     1. Validate user session (JWT)
     2. Call Spotify's OAuth endpoint:
        POST https://accounts.spotify.com/api/token
        - grant_type: refresh_token
        - refresh_token: [provider_refresh_token]
        - client_id & client_secret from env
     3. Return new access_token and expiry
     ```
   - Security: Only accessible to authenticated users

6. **Create client-side refresh helper**
   - Path: `src/lib/spotify-token-refresh.ts`
   - Function: `refreshSpotifyToken(refreshToken: string)`
   - Calls edge function
   - Updates SpotifyStore with new token
   - Returns new token for immediate use

---

### Phase 4: Integrate Token Refresh

7. **Update SpotifyService interceptor**

   - On 401 response:
     ```
     1. Check if we have provider_refresh_token
     2. If yes: Call refreshSpotifyToken()
     3. Update store with new token
     4. Retry request with new token
     5. If refresh fails: Clear session, redirect to login
     ```

8. **Add proactive token refresh**

   - In SpotifyService before each API call:
     ```
     if (isTokenExpiringSoon()) {
       await refreshSpotifyToken();
     }
     ```
   - Refresh when < 5 minutes remaining

9. **Update SupabaseAuth helper**
   - Modify `getSpotifyToken()` to:
     1. Check if token is expired/expiring
     2. Auto-refresh if needed
     3. Return fresh token
   - Add `getSpotifyRefreshToken()` method

---

### Phase 5: Session Management

10. **Handle token refresh failures**

    - Clear all auth state
    - Show user-friendly error message
    - Redirect to re-authentication
    - Log error for debugging

11. **Persist token lifecycle data**

    - Store expiry time in localStorage/sessionStorage
    - Restore on page reload
    - Clear on logout

12. **Add token status indicator**
    - Visual indicator when token is refreshing
    - Show remaining time until expiry (dev mode)
    - Add manual refresh button (dev/debug)

---

### Phase 6: Testing & Error Handling

13. **Test scenarios**

    - Fresh login flow
    - Token expiry after 1 hour
    - Refresh token success
    - Refresh token failure
    - Multiple API calls during refresh
    - Page reload with expired token

14. **Error handling improvements**
    - Specific error messages for different failures
    - Retry logic with exponential backoff
    - Circuit breaker for repeated failures
    - Telemetry/logging for monitoring

---

### Implementation Order & Priority

**Day 1 - Critical Fixes** (Stop the bleeding)

- Steps 1-2: Fix hanging issue
- Step 3-4: Capture tokens properly

**Day 2 - Core Refresh Logic**

- Steps 5-6: Edge function & client helper
- Steps 7-8: Integrate refresh

**Day 3 - Polish & Testing**

- Steps 9-12: Session management
- Steps 13-14: Testing & error handling

---

### Key Technical Details

1. **Spotify Token Refresh Endpoint**:

   ```
   POST https://accounts.spotify.com/api/token
   Content-Type: application/x-www-form-urlencoded
   Authorization: Basic [base64(client_id:client_secret)]

   Body:
   grant_type=refresh_token
   refresh_token=[REFRESH_TOKEN]
   ```

2. **Token Lifecycle**:

   - Access token: Valid for 1 hour (3600 seconds)
   - Refresh token: Does not expire (until revoked)
   - Refresh buffer: 5 minutes before expiry

3. **Error Codes to Handle**:
   - 401: Token expired or invalid
   - 400: Invalid refresh token
   - 429: Rate limited
   - 503: Service unavailable

---

### Success Criteria

- [ ] App no longer hangs on "Loading profile..."
- [ ] Tokens auto-refresh before expiry
- [ ] User stays logged in indefinitely (with valid refresh token)
- [ ] Clear error messages when auth fails
- [ ] Graceful fallback to re-authentication
- [ ] No infinite retry loops
- [ ] Token refresh is transparent to user

---

### Risks & Mitigations

1. **Risk**: Storing refresh token in browser

   - **Mitigation**: Only store in memory, use secure edge function

2. **Risk**: Multiple simultaneous refresh attempts

   - **Mitigation**: Implement refresh mutex/lock

3. **Risk**: Spotify API rate limits

   - **Mitigation**: Cache tokens, avoid unnecessary refreshes

4. **Risk**: Edge function cold starts
   - **Mitigation**: Proactive refresh with 5-min buffer

## PLAN

### Monetization Implementation Plan

**Assumptions**: Database tables (subscriptions, usage_logs, usage_quotas) are already created with proper RLS policies.

---

### Phase 1: Stripe Setup & Configuration

1. **Create Stripe Account & Products**

   - Create 3 products in Stripe Dashboard:
     - Free Tier: $0/mo (for tracking purposes)
     - Pro Tier: $9.99/mo (unlimited GPT-5-mini)
     - Ultra Tier: $29.99/mo (unlimited GPT-5 + GPT-5-mini)
   - Note the Price IDs for each product

2. **Environment Variables**
   - Add to `.env.local`:
     ```
     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
     STRIPE_SECRET_KEY=sk_...
     STRIPE_WEBHOOK_SECRET=whsec_...
     NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_...
     NEXT_PUBLIC_STRIPE_ULTRA_PRICE_ID=price_...
     ```
   - Add to Supabase Edge Function secrets

---

### Phase 2: Backend Infrastructure

3. **Create Webhook Handler Edge Function**

   - `supabase/functions/stripe-webhook/index.ts`
   - Handle events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Update subscription table based on events

4. **Create Subscription Management Edge Function**

   - `supabase/functions/create-checkout-session/index.ts`
   - Creates Stripe checkout session for upgrades
   - Returns checkout URL to frontend

5. **Create Portal Session Edge Function**

   - `supabase/functions/create-portal-session/index.ts`
   - Creates Stripe Customer Portal session
   - Allows users to manage billing

6. **Modify get-recommendations Function**

   - Add tier checking before OpenAI call:

     ```typescript
     // Check user's subscription tier
     const { data: subscription } = await supabase
       .from("subscriptions")
       .select("tier, status")
       .eq("user_id", user.id)
       .single();

     // Check current usage
     const { data: quota } = await supabase
       .from("usage_quotas")
       .select("gpt5_mini_count, gpt5_count, period_start")
       .eq("user_id", user.id)
       .single();

     // Enforce limits based on tier
     if (!subscription || subscription.tier === "free") {
       if (model === "gpt-5-mini" && quota.gpt5_mini_count >= 10) {
         return new Response(
           JSON.stringify({
             error: "Free tier limit reached",
             code: "QUOTA_EXCEEDED",
           }),
           { status: 402 }
         );
       }
       if (model === "gpt-5") {
         return new Response(
           JSON.stringify({
             error: "GPT-5 requires Pro or Ultra tier",
             code: "TIER_REQUIRED",
           }),
           { status: 402 }
         );
       }
     }

     // Log usage after successful OpenAI call
     await supabase.from("usage_logs").insert({
       user_id: user.id,
       model: model,
       tokens_used: completion.usage.total_tokens,
     });
     ```

7. **Create Usage Reset Cron Function**
   - `supabase/functions/reset-usage-quotas/index.ts`
   - Runs monthly to reset free tier quotas
   - Updates `period_start` and resets counts

---

### Phase 3: Frontend Components

8. **Install Stripe Dependencies**

   ```bash
   npm install @stripe/stripe-js stripe
   ```

9. **Create Subscription Store**

   - `src/stores/subscription-store.ts`
   - Track current tier, usage, limits
   - Fetch and cache subscription status

10. **Create Pricing Component**

    - `src/components/pricing-table.tsx`
    - Display 3 tiers with feature comparison
    - "Current Plan" badge for active tier
    - Upgrade/Downgrade buttons

11. **Create Usage Tracker Component**

    - `src/components/usage-tracker.tsx`
    - Show usage bar (X/10 requests for free tier)
    - Real-time updates after each request
    - Warning at 80% usage

12. **Create Upgrade Modal**

    - `src/components/upgrade-modal.tsx`
    - Triggered when hitting limits
    - Shows benefits of upgrading
    - Direct checkout button

13. **Modify Home.tsx**

    - Add subscription check before API calls
    - Show upgrade prompt on 402 errors
    - Display current tier in header
    - Add billing portal link

14. **Create Account/Billing Page**
    - `src/pages/account.tsx`
    - Current plan details
    - Usage statistics
    - Manage subscription button (opens Stripe Portal)
    - Usage history table

---

### Phase 4: Integration & Error Handling

15. **Update OpenAI Service**

    - `src/lib/openai-service.ts`
    - Handle 402 status codes
    - Return quota errors to UI
    - Add retry logic for rate limits

16. **Add Loading States**

    - Skeleton loaders for pricing
    - Pending states during checkout
    - Success/error toasts

17. **Add Analytics Events**
    - Track upgrade clicks
    - Monitor quota hits
    - Measure conversion funnel

---

### Phase 5: Testing & Launch

18. **Test Scenarios**

    - Free user hitting limits
    - Upgrade flow (free → pro → ultra)
    - Downgrade flow (ultra → pro → free)
    - Payment failure handling
    - Webhook processing
    - Portal access

19. **Migration for Existing Users**

    - Create free tier subscriptions for all existing users
    - Initialize usage quotas
    - Send email about new tiers

20. **Documentation**
    - Update README with tier information
    - Create FAQ for billing questions
    - Document webhook setup

---

### Implementation Order

**Week 1**: Backend (Steps 3-7)

- Set up Stripe products
- Create webhook handlers
- Modify edge functions
- Test with Stripe CLI

**Week 2**: Frontend Core (Steps 8-12)

- Subscription store
- Pricing table
- Usage tracking
- Upgrade flows

**Week 3**: Polish & Testing (Steps 13-20)

- Account page
- Error handling
- Testing all scenarios
- Documentation

---

### Key Considerations

1. **Graceful Degradation**: Free users should see clear upgrade prompts, not hard blocks
2. **Usage Transparency**: Always show users their current usage
3. **Self-Service**: Use Stripe Portal for billing management
4. **Webhook Reliability**: Implement idempotency and retry logic
5. **Cache Strategy**: Cache subscription status for 5 minutes to reduce DB calls

---

### Success Metrics

- Conversion rate: Free → Paid
- Churn rate < 5% monthly
- Support tickets < 2% of paid users
- API cost reduction of 70%+ from free tier limits
