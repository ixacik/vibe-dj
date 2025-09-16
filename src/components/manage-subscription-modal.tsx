import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard,
  Calendar,
  ExternalLink,
  Loader2,
  AlertCircle,
  Crown,
} from "lucide-react";
import { VinylDisc } from "@/components/vinyl-disc";
import {
  useSubscriptionStore,
  useSubscriptionTier,
  useSubscriptionUsage,
  type SubscriptionTier,
} from "@/stores/subscription-store";
import { PricingModal } from "./pricing-modal";
import { toast } from "sonner";
import { formatPrice } from "@/lib/pricing-constants";

interface ManageSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageSubscriptionModal({
  open,
  onOpenChange,
}: ManageSubscriptionModalProps) {
  const tier = useSubscriptionTier();
  const usage = useSubscriptionUsage();
  const { subscription, prices, fetchSubscription, fetchUsage, fetchPrices, createPortalSession } =
    useSubscriptionStore();
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);

  useEffect(() => {
    if (open) {
      fetchSubscription();
      fetchUsage();
      if (!prices) {
        fetchPrices();
      }
    }
  }, [open, fetchSubscription, fetchUsage, fetchPrices, prices]);

  const handleOpenPortal = async () => {
    setIsLoadingPortal(true);
    const url = await createPortalSession();
    if (url) {
      window.location.href = url;
    } else {
      toast.error("Failed to open billing portal");
    }
    setIsLoadingPortal(false);
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0; // Unlimited
    return Math.min((used / limit) * 100, 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 75) return "text-yellow-600";
    return "text-green-600";
  };

  const getPlanPrice = () => {
    if (tier === "free") return "$0";
    if (tier === "pro") {
      return formatPrice(prices?.pro?.amount || 999, prices?.pro?.currency);
    }
    if (tier === "ultra") {
      return formatPrice(prices?.ultra?.amount || 1999, prices?.ultra?.currency);
    }
    return "$0";
  };

  const getNextBillingDate = () => {
    if (tier === "free") return null;
    if (subscription?.current_period_end) {
      return new Date(subscription.current_period_end).toLocaleDateString();
    }
    return null;
  };

  const getTierBadgeColor = (planTier: SubscriptionTier) => {
    if (planTier === "ultra") return "bg-purple-600 text-white";
    if (planTier === "pro") return "bg-primary text-primary-foreground";
    return "bg-muted text-muted-foreground";
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Manage Subscription
            </DialogTitle>
          </DialogHeader>

          {/* Current Plan Section */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <VinylDisc size={24} />
                  <div>
                    <CardTitle className="text-base">Current Plan</CardTitle>
                    <CardDescription className="text-xs">
                      Your active subscription
                    </CardDescription>
                  </div>
                </div>
                <Badge className={getTierBadgeColor(tier)}>
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-2xl font-bold">{getPlanPrice()}</p>
                  {tier !== "free" && (
                    <p className="text-sm text-muted-foreground">/month</p>
                  )}
                </div>
                {getNextBillingDate() && (
                  <div className="text-right space-y-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Next billing
                    </p>
                    <p className="text-sm font-medium">{getNextBillingDate()}</p>
                  </div>
                )}
              </div>

              {subscription?.status === "canceled" && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-900 dark:text-yellow-100">
                      Subscription ending
                    </p>
                    <p className="text-yellow-700 dark:text-yellow-200">
                      Your subscription will end on {getNextBillingDate()}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage Section */}
          {tier !== "free" && usage && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Usage This Month</CardTitle>
                <CardDescription className="text-xs">
                  Track your AI request consumption
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {/* GPT-5 Mini Usage */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>GPT-5 Mini Requests</span>
                      <span className="font-medium">
                        <span className="text-green-600">Unlimited</span>
                      </span>
                    </div>
                  </div>

                  {/* GPT-5 Usage (Pro/Ultra only) */}
                  {(tier === "pro" || tier === "ultra") && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>GPT-5 Requests</span>
                        <span
                          className={`font-medium ${getUsageColor(
                            getUsagePercentage(
                              usage.gpt5_count,
                              tier === "pro" ? 20 : -1
                            )
                          )}`}
                        >
                          {tier === "ultra" ? (
                            <span className="text-green-600">Unlimited</span>
                          ) : (
                            `${usage.gpt5_count} / 20`
                          )}
                        </span>
                      </div>
                      {tier === "pro" && (
                        <Progress
                          value={getUsagePercentage(usage.gpt5_count, 20)}
                          className="h-2"
                        />
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2">
            <Button
              onClick={() => setShowPricingModal(true)}
              variant={tier === "free" ? "default" : "outline"}
              className="w-full"
            >
              <Crown className="w-4 h-4 mr-2" />
              {tier === "free" ? "Upgrade Plan" : "Change Plan"}
            </Button>

            {tier !== "free" && (
              <Button
                onClick={handleOpenPortal}
                variant="outline"
                className="w-full"
                disabled={isLoadingPortal}
              >
                {isLoadingPortal ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Opening Portal...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Manage Billing & Invoices
                  </>
                )}
              </Button>
            )}
          </div>

          {tier !== "free" && (
            <p className="text-xs text-muted-foreground text-center">
              Update payment methods, download invoices, and cancel subscription in billing portal
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Pricing Modal for plan changes */}
      <PricingModal
        open={showPricingModal}
        onOpenChange={setShowPricingModal}
      />
    </>
  );
}