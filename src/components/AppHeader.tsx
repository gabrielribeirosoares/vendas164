import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Car, ChevronDown, LogOut, Store as StoreIcon, User } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { OnboardingTour, TourTriggerButton } from "@/components/OnboardingTour";
import { CartDrawer } from "@/components/CartDrawer";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export function updateAppFavicon(iconUrl: string | null | undefined) {
  if (!iconUrl || typeof document === "undefined") return;
  try {
    let link = document.getElementById("app-dynamic-favicon") as HTMLLinkElement | null;
    if (!link) {
      link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    }
    if (!link) {
      link = document.createElement("link");
      link.id = "app-dynamic-favicon";
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = iconUrl.endsWith(".ico") ? "image/x-icon" : "image/png";
    link.href = iconUrl;

    const ogMeta = document.querySelector<HTMLMetaElement>("meta[property='og:image']");
    if (ogMeta) {
      ogMeta.setAttribute("content", iconUrl);
    }
    const twMeta = document.querySelector<HTMLMetaElement>("meta[name='twitter:image']");
    if (twMeta) {
      twMeta.setAttribute("content", iconUrl);
    }
  } catch (err) {
    console.warn("[updateAppFavicon] Error updating favicon:", err);
  }
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
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: myStore } = useQuery({
    queryKey: ["my-store-header", user?.id],
    enabled: !!user && propStore === undefined,
    retry: 2,
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
    retry: 2,
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
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" data-tour="header-logo" className="flex items-center gap-2 min-w-0">
            {currentStore ? (
              <>
                {currentStore.logo_url ? (
                  <img
                    src={currentStore.logo_url}
                    alt={currentStore.name}
                    className="size-8 sm:size-9 rounded-xl object-cover border border-border/50 shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="flex size-8 sm:size-9 items-center justify-center rounded-xl font-bold text-white text-xs sm:text-sm shrink-0"
                    style={{ backgroundColor: currentStore.primary_color || "#e11d48" }}
                  >
                    {currentStore.name ? currentStore.name[0].toUpperCase() : "L"}
                  </span>
                )}
                <span className="font-display text-sm sm:text-lg font-bold tracking-tight truncate max-w-[140px] sm:max-w-xs">
                  {currentStore.name}
                </span>
              </>
            ) : (
              <>
                <span className="flex size-8 sm:size-9 items-center justify-center rounded-xl bg-primary/15 text-primary shrink-0">
                  <Car className="size-4 sm:size-5" />
                </span>
                <span className="font-display text-base sm:text-lg font-bold tracking-tight">Vendas 1:64</span>
              </>
            )}
          </Link>

          <nav className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {!loading && user ? (
              <>
                <Button asChild variant="ghost" size="sm" data-tour="header-reservas" className="px-2 sm:px-3 text-xs sm:text-sm">
                  <Link to="/painel" preload="intent">
                    <span className="hidden sm:inline">Minhas reservas</span>
                    <span className="sm:hidden">Reservas</span>
                  </Link>
                </Button>

                {myLinkedStores && myLinkedStores.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" data-tour="header-lojas" className="gap-1 px-2 sm:px-3 text-xs sm:text-sm">
                        <StoreIcon className="size-3.5 sm:size-4 text-primary" />
                        <span>Lojas</span>
                        <ChevronDown className="size-3 opacity-60" />
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
                            <img src={s.logo_url} alt={s.name} className="size-5 rounded object-cover" loading="lazy" />
                          ) : (
                            <StoreIcon className="size-4 text-muted-foreground" />
                          )}
                          <span className="truncate">{s.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Button asChild variant="secondary" size="sm" data-tour="header-minha-loja" className="px-2 sm:px-3 text-xs sm:text-sm">
                  <Link to="/vendedor" preload="intent">
                    <span className="hidden sm:inline">Minha loja</span>
                    <span className="sm:hidden">Loja</span>
                  </Link>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  data-tour="header-perfil"
                  onClick={() => setProfileOpen(true)}
                  className="gap-1 px-2 sm:px-3 text-xs sm:text-sm"
                >
                  <User className="size-3.5 sm:size-4 text-primary" />
                  <span className="hidden sm:inline">Perfil</span>
                </Button>
                <CartDrawer />
                <TourTriggerButton />
                <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair" className="size-9 sm:size-9">
                  <LogOut className="size-4" />
                </Button>

                <EditProfileDialog
                  user={user}
                  open={profileOpen}
                  onOpenChange={setProfileOpen}
                />
              </>
            ) : (
              <div className="flex items-center gap-2">
                <TourTriggerButton />
                <Button asChild size="sm">
                  <Link to="/auth" preload="intent">Entrar</Link>
                </Button>
              </div>
            )}
          </nav>
        </div>
      </header>
      <OnboardingTour userId={user?.id} />
    </>
  );
}
