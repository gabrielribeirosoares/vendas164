import type { LucideIcon } from "lucide-react";
import {
  Car,
  Package,
  Palette,
  ShieldCheck,
  Truck,
  UserRound,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type SellerSection = {
  group: "Operação" | "Configuração" | "Administração";
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
};

const SECTIONS: Record<string, SellerSection> = {
  produtos: {
    group: "Operação",
    title: "Pré-vendas",
    description: "Organize lançamentos, estoque previsto e condições de reserva.",
    icon: Package,
    accent: "text-amber-500 bg-amber-500/10",
  },
  pronta_entrega: {
    group: "Operação",
    title: "Pronta entrega",
    description: "Gerencie produtos disponíveis para envio imediato.",
    icon: Zap,
    accent: "text-emerald-500 bg-emerald-500/10",
  },
  reservas: {
    group: "Operação",
    title: "Reservas e pedidos",
    description: "Acompanhe valores recebidos, saldos e o andamento de cada pedido.",
    icon: Car,
    accent: "text-blue-500 bg-blue-500/10",
  },
  clientes: {
    group: "Operação",
    title: "Clientes",
    description: "Consulte o histórico e mantenha o relacionamento com seus colecionadores.",
    icon: UserRound,
    accent: "text-violet-500 bg-violet-500/10",
  },
  rastreamento: {
    group: "Operação",
    title: "Rastreamento",
    description: "Acompanhe envios e atualize seus clientes sobre cada entrega.",
    icon: Truck,
    accent: "text-sky-500 bg-sky-500/10",
  },
  loja: {
    group: "Configuração",
    title: "Personalização da loja",
    description: "Ajuste identidade visual, informações e canais de contato.",
    icon: Palette,
    accent: "text-fuchsia-500 bg-fuchsia-500/10",
  },
  admin_moderation: {
    group: "Administração",
    title: "Moderação da plataforma",
    description: "Revise cadastros e permissões administrativas.",
    icon: ShieldCheck,
    accent: "text-amber-600 bg-amber-500/10",
  },
};

export function SellerSectionHeader({
  activeSection,
  storeName,
}: {
  activeSection: string;
  storeName: string;
}) {
  const section = SECTIONS[activeSection] ?? SECTIONS.produtos;
  const Icon = section.icon;

  return (
    <section className="mt-5 rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground/80">{storeName}</span>
        <span aria-hidden="true">/</span>
        <span>{section.group}</span>
      </div>

      <div className="flex items-start gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${section.accent}`}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">{section.title}</h2>
            <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px] font-medium">
              Seção atual
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {section.description}
          </p>
        </div>
      </div>
    </section>
  );
}
