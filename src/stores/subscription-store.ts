import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { SupabaseAuth } from "@/lib/supabase-auth";

export type SubscriptionTier = "free" | "pro" | "ultra";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing";

interface Usage {
  gpt5_mini_count: number;
  gpt5_count: number;
  period_start: string;
}

interface Subscription {
  id?: string;
  user_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  current_period_start?: string;
  current_period_end?: string;
}

interface PriceInfo {
  id: string;
  amount: number | null;
  currency: string;
  recurring?: {
    interval: string;
    interval_count: number;
  } | null;
}

interface SubscriptionState {
  subscription: Subscription | null;
  usage: Usage | null;
  prices: {
    pro: PriceInfo | null;
    ultra: PriceInfo | null;
  } | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchSubscription: () => Promise<void>;
  fetchUsage: () => Promise<void>;
  fetchPrices: () => Promise<void>;
  createCheckoutSession: (priceId: string) => Promise<string | null>;
  createPortalSession: () => Promise<string | null>;
  clearCache: () => void;
}

// Selectors for performance
export const useSubscription = () => useSubscriptionStore((state) => state.subscription);
export const useSubscriptionTier = () => useSubscriptionStore((state) => state.subscription?.tier || "free");
export const useSubscriptionUsage = () => useSubscriptionStore((state) => state.usage);
export const useIsSubscriptionLoading = () => useSubscriptionStore((state) => state.isLoading);

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  subscription: null,
  usage: null,
  prices: null,
  isLoading: false,
  error: null,

  fetchSubscription: async () => {
    set({ isLoading: true, error: null });

    try {
      const user = await SupabaseAuth.getUser();
      if (!user) {
        set({ subscription: null, isLoading: false });
        return;
      }

      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .single();

      // If table doesn't exist or no record found, default to free
      if (error) {
        console.log("Subscription fetch error (defaulting to free):", error.code);
      }

      // Default to free tier if no subscription found or error
      const subscription = data || {
        user_id: user.id,
        tier: "free" as SubscriptionTier,
        status: "active" as SubscriptionStatus,
      };

      set({ subscription, isLoading: false });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      set({
        error: error instanceof Error ? error.message : "Failed to fetch subscription",
        isLoading: false
      });
    }
  },

  fetchUsage: async () => {
    try {
      const user = await SupabaseAuth.getUser();
      if (!user) return;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data, error } = await supabase
        .from("usage_quotas")
        .select("*")
        .eq("user_id", user.id)
        .single();

      // If table doesn't exist or no record found, create default
      if (error) {
        console.log("Usage quota fetch error (initializing):", error.code);
      }

      // Initialize if doesn't exist or is from previous month
      if (!data || (data && new Date((data as any).period_start) < startOfMonth)) {
        const { data: newQuota } = await supabase
          .from("usage_quotas")
          .upsert({
            user_id: user.id,
            period_start: startOfMonth.toISOString(),
            gpt5_mini_count: 0,
            gpt5_count: 0,
          } as any, {
            onConflict: "user_id"
          })
          .select()
          .single();

        set({ usage: newQuota });
      } else {
        set({ usage: data });
      }
    } catch (error) {
      console.error("Error fetching usage:", error);
    }
  },


  createCheckoutSession: async (priceId: string) => {
    try {
      const session = await SupabaseAuth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            priceId,
            successUrl: `${window.location.origin}/account?success=true`,
            cancelUrl: `${window.location.origin}/pricing?canceled=true`,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create checkout session");
      }

      const { url } = await response.json();
      return url;
    } catch (error) {
      console.error("Error creating checkout session:", error);
      set({ error: error instanceof Error ? error.message : "Failed to create checkout session" });
      return null;
    }
  },

  createPortalSession: async () => {
    try {
      const session = await SupabaseAuth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            returnUrl: `${window.location.origin}/account`,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create portal session");
      }

      const { url } = await response.json();
      return url;
    } catch (error) {
      console.error("Error creating portal session:", error);
      set({ error: error instanceof Error ? error.message : "Failed to create portal session" });
      return null;
    }
  },

  fetchPrices: async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-prices`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch prices");
      }

      const prices = await response.json();
      set({ prices });
    } catch (error) {
      console.error("Error fetching prices:", error);
      // Set fallback prices if fetch fails - $9.99 and $19.99
      set({
        prices: {
          pro: { id: "pro", amount: 999, currency: "usd" }, // $9.99
          ultra: { id: "ultra", amount: 1999, currency: "usd" }, // $19.99
        },
      });
    }
  },

  clearCache: () => {
    set({ subscription: null, usage: null, prices: null, error: null });
  },
}));