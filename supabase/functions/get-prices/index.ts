import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Stripe
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new Error("Stripe secret key not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Get price IDs - these should match what's in the .env file
    const proPriceId = "price_1S7g14DrEvmNOvsaNqkwb9zK";
    const ultraPriceId = "price_1S7g20DrEvmNOvsaMRMUF65K";

    if (!proPriceId || !ultraPriceId) {
      throw new Error("Price IDs not configured");
    }

    // Fetch prices from Stripe
    const [proPrice, ultraPrice] = await Promise.all([
      stripe.prices.retrieve(proPriceId),
      stripe.prices.retrieve(ultraPriceId),
    ]);

    // Format response
    const prices = {
      pro: {
        id: proPrice.id,
        amount: proPrice.unit_amount,
        currency: proPrice.currency,
        recurring: proPrice.recurring,
      },
      ultra: {
        id: ultraPrice.id,
        amount: ultraPrice.unit_amount,
        currency: ultraPrice.currency,
        recurring: ultraPrice.recurring,
      },
    };

    return new Response(JSON.stringify(prices), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching prices:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
