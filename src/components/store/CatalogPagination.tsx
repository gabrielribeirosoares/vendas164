import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type CatalogPaginationProps = {
  currentPage: number;
  totalPages: number;
  primaryColor: string;
  primaryTextColor: string;
  onPageChange: (page: number) => void;
};

export function CatalogPagination({
  currentPage,
  totalPages,
  primaryColor,
  primaryTextColor,
  onPageChange,
}: CatalogPaginationProps) {
  if (totalPages <= 1) return null;

  const changePage = (page: number) => {
    onPageChange(page);
    window.scrollTo({ top: 400, behavior: "smooth" });
  };

  const visiblePages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  return (
    <nav
      aria-label="Paginação do catálogo"
      className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-border/30 bg-card/60 p-4 shadow-sm backdrop-blur-sm sm:flex-row"
    >
      <div className="text-xs text-muted-foreground" aria-live="polite">
        Página <strong className="text-foreground">{currentPage}</strong> de{" "}
        <strong className="text-foreground">{totalPages}</strong>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1 px-2.5 text-xs"
          disabled={currentPage <= 1}
          onClick={() => changePage(Math.max(1, currentPage - 1))}
        >
          <ChevronLeft className="size-4" />
          <span>Anterior</span>
        </Button>

        {visiblePages.map((page, index) => {
          const isCurrent = currentPage === page;
          return (
            <div key={page} className="contents">
              {index > 0 && page - visiblePages[index - 1] > 1 && (
                <span aria-hidden="true" className="px-1 text-xs text-muted-foreground">…</span>
              )}
              <button
                type="button"
                aria-current={isCurrent ? "page" : undefined}
                aria-label={`Ir para a página ${page}`}
                onClick={() => changePage(page)}
                className={`size-9 rounded-lg border text-xs font-bold transition-all ${
                  isCurrent
                    ? "scale-105 border-transparent text-white shadow-md"
                    : "border-border/30 bg-muted/30 text-muted-foreground hover:bg-muted"
                }`}
                style={
                  isCurrent ? { backgroundColor: primaryColor, color: primaryTextColor } : undefined
                }
              >
                {page}
              </button>
            </div>
          );
        })}

        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1 px-2.5 text-xs"
          disabled={currentPage >= totalPages}
          onClick={() => changePage(Math.min(totalPages, currentPage + 1))}
        >
          <span>Próxima</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
