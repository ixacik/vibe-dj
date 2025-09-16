export type SubscriptionTier = "free" | "pro" | "ultra";

export interface TierFeature {
  text: string;
  included: boolean;
}

export interface PricingTier {
  name: string;
  tier: SubscriptionTier;
  priceId?: string;
  features: TierFeature[];
}

export const formatPrice = (amount: number | null, currency: string = "usd"): string => {
  if (amount === null || amount === undefined) {
    return "Loading...";
  }

  // Convert cents to dollars
  const dollars = amount / 100;

  // Format based on currency
  if (currency === "usd") {
    // Format as $X.XX, removing .00 if it's a whole dollar amount
    const formatted = dollars.toFixed(2);
    return `$${formatted.replace(/\.00$/, "")}`;
  }

  // Default formatting for other currencies
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(dollars);
};

export const getTierDefinitions = () => {
  const tiers: PricingTier[] = [
    {
      name: "Free",
      tier: "free",
      features: [
        { text: "10 GPT-5-mini requests/month", included: true },
        { text: "No GPT-5 access", included: false },
        { text: "Limited thinking budget", included: false },
        { text: "Basic recommendations", included: false },
      ],
    },
    {
      name: "Pro",
      tier: "pro",
      priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID,
      features: [
        { text: "Unlimited GPT-5-mini", included: true },
        { text: "20 GPT-5 requests/month", included: true },
        { text: "Higher thinking budget", included: true },
        { text: "Better recommendations", included: true },
      ],
    },
    {
      name: "Ultra",
      tier: "ultra",
      priceId: import.meta.env.VITE_STRIPE_ULTRA_PRICE_ID,
      features: [
        { text: "Everything in Pro", included: true },
        { text: "Unlimited GPT-5", included: true },
        { text: "Max thinking budget", included: true },
        { text: "Ultra recommendations", included: true },
      ],
    },
  ];

  return tiers;
};