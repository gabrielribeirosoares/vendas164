import { Badge } from "@/components/ui/badge";
import { SECTIONS } from "@/lib/sellerNavigation";

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
      <div className="mb-3 hidden flex-wrap items-center gap-2 text-xs text-muted-foreground md:flex">
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
            <Badge variant="outline" className="hidden md:inline-flex h-5 rounded-full px-2 text-[10px] font-medium">
              Seção atual
            </Badge>
          </div>
          <p className="hidden md:block mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {section.description}
          </p>
        </div>
      </div>
    </section>
  );
}
