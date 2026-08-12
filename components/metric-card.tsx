import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "accent" | "warning";
}

export function MetricCard({
  label,
  value,
  subValue,
  icon,
  trend,
  variant = "default",
}: MetricCardProps) {
  return (
    <Card className="group/card">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardDescription className="text-[0.75rem]">{label}</CardDescription>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-2xl transition-all duration-200",
            variant === "accent" && "bg-accent/10 text-accent ring-1 ring-accent/20",
            variant === "warning" &&
              "bg-warning/10 text-warning ring-1 ring-warning/20",
            variant === "default" && "bg-muted text-muted-foreground",
          )}
        >
          {icon}
        </span>
      </CardHeader>
      <CardContent className="pb-1">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[1.75rem] leading-none font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </span>
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold",
                trend === "up" && "bg-success/10 text-success",
                trend === "down" && "bg-destructive/10 text-destructive",
                trend === "neutral" && "bg-muted text-muted-foreground",
              )}
            >
              {trend === "up" ? (
                <TrendingUp className="size-2.5" />
              ) : trend === "down" ? (
                <TrendingDown className="size-2.5" />
              ) : (
                <Minus className="size-2.5" />
              )}
            </span>
          ) : null}
        </div>
        {subValue ? (
          <p className="mt-1.5 text-[0.7rem] leading-relaxed text-muted-foreground">
            {subValue}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
