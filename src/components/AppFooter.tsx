import { Link } from "@tanstack/react-router";
import { ShieldCheck, FileText, Lock, Mail, Phone, Instagram } from "lucide-react";

export interface StoreContactInfo {
  whatsapp_number?: string | null;
  contact_email?: string | null;
  contact_instagram?: string | null;
}

export function AppFooter({ storeInfo }: { storeInfo?: StoreContactInfo }) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-card/50 py-8 text-xs text-muted-foreground">
      <div className="container max-w-7xl mx-auto px-4 space-y-6">
        {/* Contato */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          {(storeInfo?.whatsapp_number || !storeInfo) && (
            <a
              href={`https://wa.me/${(storeInfo?.whatsapp_number || "5548991344833").replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors font-medium"
            >
              <Phone className="size-3.5 text-emerald-500" /> {storeInfo?.whatsapp_number || "(48) 99134-4833"}
            </a>
          )}
          {(storeInfo?.contact_email || !storeInfo) && (
            <a
              href={`mailto:${storeInfo?.contact_email || "minishub01@gmail.com"}`}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors font-medium"
            >
              <Mail className="size-3.5 text-primary" /> {storeInfo?.contact_email || "minishub01@gmail.com"}
            </a>
          )}
          {(storeInfo?.contact_instagram || !storeInfo) && (
            <a
              href={`https://www.instagram.com/${storeInfo?.contact_instagram ? storeInfo.contact_instagram.replace("@", "") : "vendas164.com.br"}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors font-medium"
            >
              <Instagram className="size-3.5 text-pink-500" /> @{storeInfo?.contact_instagram ? storeInfo.contact_instagram.replace("@", "") : "vendas164.com.br"}
            </a>
          )}
        </div>

        {/* Separador */}
        <div className="border-t border-border/30" />

        {/* Marca + Links legais */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
              164
            </div>
            <span className="font-semibold text-foreground text-sm">Vendas 164</span>
            <span className="text-muted-foreground">© {year} · Todos os direitos reservados</span>
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
      </div>
    </footer>
  );
}
