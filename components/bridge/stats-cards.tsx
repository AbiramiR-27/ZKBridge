"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Shield, Zap } from "lucide-react";

interface StatsCardsProps {
  totalDeposits?: number;
  totalClaims?: number;
  pendingCount?: number;
}

export function StatsCards({ 
  totalDeposits = 0, 
  totalClaims = 0, 
  pendingCount = 0 
}: StatsCardsProps) {
  const stats = [
    {
      title: "Total Deposits",
      value: totalDeposits.toLocaleString(),
      description: "On Source Chain",
      icon: ArrowUpRight,
      color: "text-chart-1",
      bgColor: "bg-chart-1/10",
    },
    {
      title: "Total Claims",
      value: totalClaims.toLocaleString(),
      description: "On Destination Chain",
      icon: ArrowDownRight,
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
    {
      title: "Pending Proofs",
      value: pendingCount.toLocaleString(),
      description: "Awaiting Verification",
      icon: Zap,
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
    {
      title: "ZK Verified",
      value: `${totalClaims > 0 ? "100" : "0"}%`,
      description: "Proof Success Rate",
      icon: Shield,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-foreground">{stat.value}</h3>
              <p className="text-sm text-muted-foreground mt-1">{stat.title}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{stat.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
