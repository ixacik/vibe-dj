import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Loader2, Sparkles, Crown, Zap, HelpCircle } from "lucide-react";
import { useSubscriptionStore, useSubscriptionTier } from "@/stores/subscription-store";
import { toast } from "sonner";

interface PricingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

const faqs = [
  {
    question: "Can I change my plan anytime?",
    answer: "Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately."
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards through our secure payment processor, Stripe."
  },
  {
    question: "Is there a free trial?",
    answer: "Our Free tier gives you 10 requests per month to try the service. You can upgrade anytime to unlock unlimited access."
  },
  {
    question: "How do I cancel my subscription?",
    answer: "You can cancel your subscription anytime from your billing portal. You'll retain access until the end of your billing period."
  }
];

export function PricingModal({ open, onOpenChange }: PricingModalProps) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl">Choose Your Perfect Plan</DialogTitle>
          <DialogDescription>
            Unlock the full potential of AI-powered music recommendations
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="pricing" className="w-full">
          <TabsList className="mx-6">
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
            <TabsTrigger value="faq">FAQ</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[calc(90vh-200px)]">
            <TabsContent value="pricing" className="px-6 pb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
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
                      <div className="flex items-center gap-2">
                        {tier.tier === "pro" && <Crown className="w-5 h-5 text-blue-600" />}
                        {tier.tier === "ultra" && <Zap className="w-5 h-5 text-purple-600" />}
                        <CardTitle className="text-xl">{tier.name}</CardTitle>
                      </div>
                      <CardDescription>{tier.description}</CardDescription>
                      <div className="mt-4">
                        <span className="text-3xl font-bold">{tier.price}</span>
                        {tier.tier !== "free" && (
                          <span className="text-muted-foreground">/month</span>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent>
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
                                feature.included
                                  ? "text-foreground"
                                  : "text-muted-foreground line-through"
                              }`}
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
            </TabsContent>

            <TabsContent value="compare" className="px-6 pb-6">
              <div className="bg-card rounded-lg border overflow-hidden mt-4">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4">Feature</th>
                      <th className="text-center p-4">Free</th>
                      <th className="text-center p-4">
                        <div className="flex items-center justify-center gap-1">
                          <Crown className="w-4 h-4 text-blue-600" />
                          Pro
                        </div>
                      </th>
                      <th className="text-center p-4">
                        <div className="flex items-center justify-center gap-1">
                          <Zap className="w-4 h-4 text-purple-600" />
                          Ultra
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="p-4">GPT-5-mini Requests</td>
                      <td className="text-center p-4">10/month</td>
                      <td className="text-center p-4 text-green-600 font-medium">Unlimited</td>
                      <td className="text-center p-4 text-green-600 font-medium">Unlimited</td>
                    </tr>
                    <tr>
                      <td className="p-4">GPT-5 Access</td>
                      <td className="text-center p-4">
                        <X className="w-4 h-4 text-muted-foreground inline" />
                      </td>
                      <td className="text-center p-4">
                        <X className="w-4 h-4 text-muted-foreground inline" />
                      </td>
                      <td className="text-center p-4">
                        <Check className="w-4 h-4 text-green-600 inline" />
                      </td>
                    </tr>
                    <tr>
                      <td className="p-4">Spotify Integration</td>
                      <td className="text-center p-4">
                        <Check className="w-4 h-4 text-green-600 inline" />
                      </td>
                      <td className="text-center p-4">
                        <Check className="w-4 h-4 text-green-600 inline" />
                      </td>
                      <td className="text-center p-4">
                        <Check className="w-4 h-4 text-green-600 inline" />
                      </td>
                    </tr>
                    <tr>
                      <td className="p-4">Recommendation Quality</td>
                      <td className="text-center p-4 text-muted-foreground">Basic</td>
                      <td className="text-center p-4 text-blue-600">Advanced</td>
                      <td className="text-center p-4 text-purple-600 font-medium">Premium</td>
                    </tr>
                    <tr>
                      <td className="p-4">Support</td>
                      <td className="text-center p-4 text-muted-foreground">Community</td>
                      <td className="text-center p-4">Email</td>
                      <td className="text-center p-4 text-purple-600">Priority</td>
                    </tr>
                    <tr>
                      <td className="p-4">Usage Analytics</td>
                      <td className="text-center p-4">Basic</td>
                      <td className="text-center p-4">Detailed</td>
                      <td className="text-center p-4">Advanced</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="faq" className="px-6 pb-6">
              <div className="space-y-4 mt-4">
                {faqs.map((faq, index) => (
                  <Card key={index}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-start gap-2">
                        <HelpCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        {faq.question}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {faq.answer}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}