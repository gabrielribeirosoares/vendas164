import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Car, ChevronDown, LogOut, Store as StoreIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export function updateAppFavicon(iconUrl: string | null | undefined) {
  if (!iconUrl || typeof document === "undefined") return;
  const existingLinks = document.querySelectorAll<HTMLLinkElement>(
    "link[rel*='icon'], link[rel='shortcut icon']"
  );
  existingLinks.forEach((el) => el.remove());

  const link = document.createElement("link");
  link.rel = "icon";
  link.type = iconUrl.endsWith(".ico") ? "image/x-icon" : "image/png";
  link.href = iconUrl;
  document.head.appendChild(link);
}

interface AppHeaderProps {
  store?: {
    name: string;
    logo_url?: string | null;
    favicon_url?: string | null;
    primary_color?: string | null;
  } | null;
}

export function AppHeader({ store: propStore }: AppHeaderProps = {}) {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: myStore } = useQuery({
    queryKey: ["my-store-header", user?.id],
    enabled: !!user && propStore === undefined,
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("name, logo_url, favicon_url, primary_color")
        .eq("owner_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: myLinkedStores } = useQuery({
    queryKey: ["my-linked-stores-header", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_store_link")
        .select("store_id, stores(id, name, slug, logo_url, owner_id)")
        .eq("user_id", user!.id);
      return (data ?? [])
        .map((l: any) => l.stores)
        .filter((s: any) => s && s.owner_id !== user!.id);
    },
  });

  const currentStore = propStore !== undefined ? propStore : myStore;

  useEffect(() => {
    const icon = currentStore?.favicon_url || currentStore?.logo_url;
    if (icon) {
      updateAppFavicon(icon);
    }
  }, [currentStore?.favicon_url, currentStore?.logo_url]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2.5">
          {currentStore ? (
            <>
              {currentStore.logo_url ? (
                <img
                  src={currentStore.logo_url}
                  alt={currentStore.name}
                  className="size-9 rounded-xl object-cover border border-border/50"
                />
              ) : (
                <span
                  className="flex size-9 items-center justify-center rounded-xl font-bold text-white text-sm"
                  style={{ backgroundColor: currentStore.primary_color || "#e11d48" }}
                >
                  {currentStore.name ? currentStore.name[0].toUpperCase() : "L"}
                </span>
              )}
              <span className="font-display text-lg font-bold tracking-tight">
                {currentStore.name}
              </span>
            </>
          ) : (
            <>
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Car className="size-5" />
              </span>
              <span className="font-display text-lg font-bold tracking-tight">MiniPré</span>
            </>
          )}
        </Link>

        <nav className="flex items-center gap-1.5">
          {!loading && user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/painel">Minhas reservas</Link>
              </Button>

              {myLinkedStores && myLinkedStores.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1">
                      <StoreIcon className="size-4 text-primary" />
                      <span>Lojas</span>
                      <ChevronDown className="size-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {myLinkedStores.map((s: any) => (
                      <DropdownMenuItem
                        key={s.id}
                        className="cursor-pointer gap-2"
                        onClick={() => navigate({ to: "/loja/$slug", params: { slug: s.slug } })}
                      >
                        {s.logo_url ? (
                          <img src={s.logo_url} alt={s.name} className="size-5 rounded object-cover" />
                        ) : (
                          <StoreIcon className="size-4 text-muted-foreground" />
                        )}
                        <span className="truncate">{s.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button asChild variant="secondary" size="sm">
                <Link to="/vendedor">Minha loja</Link>
              </Button>

              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Entrar</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
