import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "No signature" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!stripeSecretKey || !stripeWebhookSecret) {
      throw new Error("Missing Stripe configuration");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        stripeWebhookSecret
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "subscription") {
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          const userEmail = session.customer_email;

          // Get user by email
          const { data: userData, error: userError } = await supabase.auth.admin
            .listUsers();

          const user = userData?.users.find(u => u.email === userEmail);

          if (!user) {
            console.error("User not found for email:", userEmail);
            break;
          }

          // Get subscription details from Stripe
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);

          // Determine tier based on price
          let tier = "free";
          const priceId = subscription.items.data[0]?.price.id;

          if (priceId === Deno.env.get("STRIPE_PRO_PRICE_ID")) {
            tier = "pro";
          } else if (priceId === Deno.env.get("STRIPE_ULTRA_PRICE_ID")) {
            tier = "ultra";
          }

          // Upsert subscription record
          const { error: subError } = await supabase
            .from("subscriptions")
            .upsert({
              user_id: user.id,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              tier: tier,
              status: subscription.status,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "user_id"
            });

          if (subError) {
            console.error("Error upserting subscription:", subError);
          }

          // Initialize or reset usage quotas for new subscription
          const { error: quotaError } = await supabase
            .from("usage_quotas")
            .upsert({
              user_id: user.id,
              period_start: new Date().toISOString(),
              gpt5_mini_count: 0,
              gpt5_count: 0,
            }, {
              onConflict: "user_id"
            });

          if (quotaError) {
            console.error("Error upserting usage quota:", quotaError);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Get current subscription from database
        const { data: existingSub, error: fetchError } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("stripe_customer_id", customerId)
          .single();

        if (fetchError || !existingSub) {
          console.error("Subscription not found for customer:", customerId);
          break;
        }

        // Determine tier based on price
        let tier = "free";
        const priceId = subscription.items.data[0]?.price.id;

        if (priceId === Deno.env.get("STRIPE_PRO_PRICE_ID")) {
          tier = "pro";
        } else if (priceId === Deno.env.get("STRIPE_ULTRA_PRICE_ID")) {
          tier = "ultra";
        }

        // Update subscription
        const { error: updateError } = await supabase
          .from("subscriptions")
          .update({
            tier: tier,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        if (updateError) {
          console.error("Error updating subscription:", updateError);
        }

        // If downgrading from ultra to pro, we might want to track this
        if (existingSub.tier === "ultra" && tier === "pro") {
          console.log(`User downgraded from ultra to pro: ${existingSub.user_id}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Update subscription status to canceled
        const { error: updateError } = await supabase
          .from("subscriptions")
          .update({
            status: "canceled",
            tier: "free",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        if (updateError) {
          console.error("Error canceling subscription:", updateError);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Update subscription status
        const { error: updateError } = await supabase
          .from("subscriptions")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        if (updateError) {
          console.error("Error updating subscription to past_due:", updateError);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});