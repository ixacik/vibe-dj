import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2 } from "lucide-react";
import {
  useSubscriptionStore,
  useSubscriptionTier,
} from "@/stores/subscription-store";
import { toast } from "sonner";
import { getTierDefinitions, formatPrice } from "@/lib/pricing-constants";

export function PricingTable() {
  const currentTier = useSubscriptionTier();
  const { createCheckoutSession, createPortalSession, fetchPrices, prices } =
    useSubscriptionStore();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!prices) {
      fetchPrices();
    }
  }, [prices, fetchPrices]);

  const tiers = getTierDefinitions();

  const handleSubscribe = async (tier: any) => {
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

  const getButtonText = (tier: any) => {
    if (currentTier === tier.tier) return "Current Plan";
    if (currentTier === "free") return "Upgrade";
    if (tier.tier === "free") return "Downgrade";
    if (currentTier === "pro" && tier.tier === "ultra") return "Upgrade";
    if (currentTier === "ultra" && tier.tier === "pro") return "Downgrade";
    return "Switch Plan";
  };

  const isButtonDisabled = (tier: any) => {
    return currentTier === tier.tier || isLoading !== null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto p-6">
      {tiers.map((tier) => (
        <Card
          key={tier.tier}
          className={`relative flex flex-col h-full ${
            tier.tier === "pro" ? "ring-2 ring-primary shadow-lg scale-105" : ""
          }`}
        >
          {tier.tier === "pro" && (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
              Most Popular
            </Badge>
          )}

          <CardHeader>
            <CardTitle className="text-lg">{tier.name}</CardTitle>
            <div className="mt-2">
              <span className="text-2xl font-bold">
                {tier.tier === "free"
                  ? "$0"
                  : tier.tier === "pro"
                  ? formatPrice(
                      prices?.pro?.amount || 999,
                      prices?.pro?.currency
                    )
                  : formatPrice(
                      prices?.ultra?.amount || 1999,
                      prices?.ultra?.currency
                    )}
              </span>
              {tier.tier !== "free" && (
                <span className="text-muted-foreground text-sm">/month</span>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex-1">
            <ul className="space-y-2">
              {tier.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  {feature.included ? (
                    <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground/50 mt-0.5 shrink-0" />
                  )}
                  <span
                    className={`text-sm ${
                      !feature.included ? "text-muted-foreground" : ""
                    }`}
                  >
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>

          <CardFooter className="mt-auto">
            <Button
              className="w-full"
              variant={tier.tier === "pro" ? "default" : "outline"}
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
