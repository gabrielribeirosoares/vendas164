import { Link } from "@tanstack/react-router";
import { ShieldCheck, FileText, Lock } from "lucide-react";

export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-card/50 py-8 text-xs text-muted-foreground">
      <div className="container max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
            164
          </div>
          <span className="font-semibold text-foreground text-sm">Vendas 164</span>
          <span className="text-muted-foreground">© {year} · Gestão de Reservas & Pré-Vendas</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 font-medium">
          <Link
            to="/termos"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <FileText className="size-3.5 text-primary" /> Termos de Uso
          </Link>
          <Link
            to="/privacidade"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ShieldCheck className="size-3.5 text-emerald-500" /> Privacidade & LGPD
          </Link>
          <span className="flex items-center gap-1 text-[11px] bg-muted/60 px-2.5 py-1 rounded-md border border-border/40">
            <Lock className="size-3 text-muted-foreground" /> Conexão Criptografada SSL
          </span>
        </div>
      </div>
    </footer>
  );
}
