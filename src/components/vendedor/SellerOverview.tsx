import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Wallet, Clock, DollarSign } from "lucide-react";
import { brl } from "@/lib/format";
import React from "react";
import { SalesChart } from "./SalesChart";

interface Totals {
  projected: number;
  received: number;
  pending: number;
  activeCount: number;
  avgTicket: number;
  paidInFull: number;
}

interface SellerOverviewProps {
  totals: Totals;
  brandData: { name: string; count: number }[];
}

export function SellerOverview({ totals, brandData }: SellerOverviewProps) {
  return (
    <>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="size-4 text-primary" />}
          label="Total Projetado"
          value={brl(totals.projected)}
          subtext={`${totals.activeCount} reservas ativas`}
        />
        <StatCard
          icon={<Wallet className="size-4 text-emerald-500" />}
          label="Sinais Recebidos"
          value={brl(totals.received)}
          accent="text-emerald-500"
          subtext={`${totals.paidInFull} pedidos quitados`}
        />
        <StatCard
          icon={<Clock className="size-4 text-amber-500" />}
          label="Saldo a Receber"
          value={brl(totals.pending)}
          accent="text-amber-500"
          subtext="A receber na chegada"
        />
        <StatCard
          icon={<DollarSign className="size-4 text-blue-500" />}
          label="Ticket Médio"
          value={brl(totals.avgTicket)}
          accent="text-blue-500"
          subtext="Média por reserva"
        />
      </div>
      
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <SalesChart brandData={brandData} />
      </div>
    </>
  );
}

export function StatCard({
  icon,
  label,
  value,
  accent,
  subtext,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
  subtext?: string;
}) {
  return (
    <Card className="border-border/40 bg-card/60 relative overflow-hidden backdrop-blur-sm shadow-sm transition-all hover:border-border/80">
      <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
        {icon && <div className="p-1.5 rounded-lg bg-muted/40 shrink-0">{icon}</div>}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className={`font-display text-2xl font-bold tracking-tight ${accent ?? ""}`}>{value}</p>
        {subtext && <p className="text-[11px] text-muted-foreground mt-1">{subtext}</p>}
      </CardContent>
    </Card>
  );
}
