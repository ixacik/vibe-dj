import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSubscriptionStore, useSubscriptionTier, useSubscriptionUsage } from "@/stores/subscription-store";
import { useNavigate } from "react-router-dom";

export function UsageLimitBadge() {
  const tier = useSubscriptionTier();
  const usage = useSubscriptionUsage();
  const { fetchUsage } = useSubscriptionStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsage();
    // Refresh usage every 30 seconds
    const interval = setInterval(fetchUsage, 30000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  // Only show for free tier
  if (tier !== "free") {
    return null;
  }

  const currentUsage = usage?.gpt5_mini_count || 0;
  const limit = 10;
  const percentage = (currentUsage / limit) * 100;
  const remaining = Math.max(0, limit - currentUsage);

  const getNumberColor = () => {
    if (percentage >= 100) return "text-red-600";
    if (percentage >= 80) return "text-orange-600";
    return "text-foreground";
  };

  const handleClick = () => {
    navigate("/pricing");
  };

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      className="gap-1.5"
      title={percentage >= 60 ? "Click to upgrade" : `${remaining} requests remaining this month`}
    >
      <span className="text-sm text-muted-foreground">Requests left:</span>
      <span className={`text-sm font-semibold ${getNumberColor()}`}>
        {remaining}/{limit}
      </span>
    </Button>
  );
}