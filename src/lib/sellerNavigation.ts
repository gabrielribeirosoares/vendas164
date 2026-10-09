import type { LucideIcon } from "lucide-react";
import { Car, Clock, CreditCard, Package, Palette, ShieldCheck, Truck, UserRound, Zap } from "lucide-react";
type SellerSection = {
  group: "Operação" | "Configuração" | "Administração";
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
};

export const SECTIONS: Record<string, SellerSection> = {
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
  rodinhas: {
    group: "Operação", title: "Rodinhas", description: "Gerencie os conjuntos de rodinhas disponíveis nesta loja.", icon: Car, accent: "text-blue-500 bg-blue-500/10",
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
  fila_espera: {
    group: "Operação",
    title: "Fila de espera",
    description: "Acompanhe clientes interessados em miniaturas esgotadas e atenda por ordem de chegada.",
    icon: Clock,
    accent: "text-amber-500 bg-amber-500/10",
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
  pagamentos: {
    group: "Configuração",
    title: "Pagamentos e Checkout",
    description: "Conecte sua conta do Mercado Pago para receber via PIX automático e Cartão de Crédito.",
    icon: CreditCard,
    accent: "text-emerald-500 bg-emerald-500/10",
  },
  admin_moderation: {
    group: "Administração",
    title: "Moderação da plataforma",
    description: "Revise cadastros e permissões administrativas.",
    icon: ShieldCheck,
    accent: "text-amber-600 bg-amber-500/10",
  },
};


export function getSellerNavigation(wheelsEnabled: boolean, isAdmin: boolean) {
  return Object.entries(SECTIONS).filter(([id]) => (id !== "rodinhas" || wheelsEnabled) && (id !== "admin_moderation" || isAdmin)).map(([id, section]) => ({ id, ...section }));
}
