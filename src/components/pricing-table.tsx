import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, Sparkles } from "lucide-react";
import { useSubscriptionStore, useSubscriptionTier } from "@/stores/subscription-store";
import { toast } from "sonner";

interface PricingTier {
  name: string;
  tier: "free" | "pro" | "ultra";
  price: string;
  priceId?: string;
  description: string;
  features: {
    text: string;
    included: boolean;
  }[];
  highlighted?: boolean;
}

const tiers: PricingTier[] = [
  {
    name: "Free",
    tier: "free",
    price: "$0",
    description: "Get started with basic features",
    features: [
      { text: "10 GPT-5-mini requests/month", included: true },
      { text: "Basic song recommendations", included: true },
      { text: "Spotify integration", included: true },
      { text: "GPT-5 access", included: false },
      { text: "Priority support", included: false },
    ],
  },
  {
    name: "Pro",
    tier: "pro",
    price: "$9.99",
    priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID,
    description: "Perfect for music enthusiasts",
    features: [
      { text: "Unlimited GPT-5-mini requests", included: true },
      { text: "Advanced recommendations", included: true },
      { text: "Spotify integration", included: true },
      { text: "GPT-5 access", included: false },
      { text: "Email support", included: true },
    ],
    highlighted: true,
  },
  {
    name: "Ultra",
    tier: "ultra",
    price: "$29.99",
    priceId: import.meta.env.VITE_STRIPE_ULTRA_PRICE_ID,
    description: "The ultimate music AI experience",
    features: [
      { text: "Unlimited GPT-5-mini requests", included: true },
      { text: "Unlimited GPT-5 requests", included: true },
      { text: "Premium recommendations", included: true },
      { text: "Spotify integration", included: true },
      { text: "Priority support", included: true },
    ],
  },
];

export function PricingTable() {
  const currentTier = useSubscriptionTier();
  const { createCheckoutSession, createPortalSession } = useSubscriptionStore();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSubscribe = async (tier: PricingTier) => {
    if (tier.tier === "free") {
      // Downgrade through portal
      setIsLoading(tier.tier);
      const url = await createPortalSession();
      if (url) {
        window.location.href = url;
      } else {
        toast.error("Failed to open billing portal");
      }
      setIsLoading(null);
      return;
    }

    if (!tier.priceId) {
      toast.error("Price ID not configured");
      return;
    }

    setIsLoading(tier.tier);
    const url = await createCheckoutSession(tier.priceId);
    if (url) {
      window.location.href = url;
    } else {
      toast.error("Failed to create checkout session");
    }
    setIsLoading(null);
  };

  const getButtonText = (tier: PricingTier) => {
    if (currentTier === tier.tier) return "Current Plan";
    if (currentTier === "free") return "Upgrade";
    if (tier.tier === "free") return "Downgrade";
    if (currentTier === "pro" && tier.tier === "ultra") return "Upgrade";
    if (currentTier === "ultra" && tier.tier === "pro") return "Downgrade";
    return "Switch Plan";
  };

  const isButtonDisabled = (tier: PricingTier) => {
    return currentTier === tier.tier || isLoading !== null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto p-6">
      {tiers.map((tier) => (
        <Card
          key={tier.tier}
          className={`relative ${
            tier.highlighted
              ? "border-primary shadow-lg scale-105"
              : ""
          } ${currentTier === tier.tier ? "ring-2 ring-primary" : ""}`}
        >
          {tier.highlighted && (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
              <Sparkles className="w-3 h-3 mr-1" />
              Most Popular
            </Badge>
          )}
          {currentTier === tier.tier && (
            <Badge className="absolute -top-3 right-4 bg-green-600 text-white">
              Current Plan
            </Badge>
          )}

          <CardHeader>
            <CardTitle className="text-2xl">{tier.name}</CardTitle>
            <CardDescription>{tier.description}</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">{tier.price}</span>
              {tier.tier !== "free" && (
                <span className="text-muted-foreground">/month</span>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <ul className="space-y-3">
              {tier.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  {feature.included ? (
                    <Check className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <X className="w-5 h-5 text-muted-foreground/50 mt-0.5 shrink-0" />
                  )}
                  <span
                    className={
                      feature.included
                        ? "text-foreground"
                        : "text-muted-foreground line-through"
                    }
                  >
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>

          <CardFooter>
            <Button
              className="w-full"
              variant={tier.highlighted ? "default" : "outline"}
              disabled={isButtonDisabled(tier)}
              onClick={() => handleSubscribe(tier)}
            >
              {isLoading === tier.tier ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                getButtonText(tier)
              )}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}