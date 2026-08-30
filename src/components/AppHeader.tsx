import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Car, ChevronDown, LogOut, Menu, Package, Palette, Store as StoreIcon, User, Zap } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
import { updateAppFavicon } from "@/lib/favicon";

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
                <div className="hidden sm:flex items-center gap-1.5">
                  <Button asChild variant="ghost" size="sm" data-tour="header-reservas" className="px-3">
                    <Link to="/painel" preload="intent">Minhas reservas</Link>
                  </Button>

                  {myLinkedStores && myLinkedStores.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" data-tour="header-lojas" className="gap-1 px-3">
                          <StoreIcon className="size-4 text-primary" />
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

                  <Button asChild variant="secondary" size="sm" data-tour="header-minha-loja" className="px-3">
                    <Link to="/vendedor" search={{ tab: "produtos" }} preload="intent">Minha loja</Link>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    data-tour="header-perfil"
                    onClick={() => setProfileOpen(true)}
                    className="gap-1 px-3"
                  >
                    <User className="size-4 text-primary" />
                    <span>Perfil</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair" className="size-9">
                    <LogOut className="size-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-1 sm:gap-1.5">
                  <CartDrawer />
                  <div className="hidden sm:flex"><TourTriggerButton /></div>
                  
                  <div className="flex sm:hidden">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Menu Mobile" className="size-9">
                          <Menu className="size-5" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="right" className="w-[280px] p-0 border-l border-border/60">
                        <div className="flex flex-col h-full bg-background">
                          <div className="p-5 border-b border-border/50 bg-muted/20">
                            <h3 className="font-bold text-lg text-foreground">Menu</h3>
                            <p className="text-xs text-muted-foreground mt-1 truncate">{user.email}</p>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            <Button asChild variant="ghost" className="w-full justify-start gap-3 h-11" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))}>
                              <Link to="/painel" preload="intent">
                                <Car className="size-5 text-primary" /> Minhas Reservas
                              </Link>
                            </Button>
                            {currentStore ? (
                              <div className="py-2 border-y border-border/50 my-2">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 px-2">Minha Loja</h4>
                                <Button asChild variant="ghost" className="w-full justify-start gap-3 h-10 mb-1" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))}>
                                  <Link to="/vendedor" search={{ tab: 'produtos' }}>
                                    <Package className="size-4 text-amber-500" /> Pré-vendas
                                  </Link>
                                </Button>
                                <Button asChild variant="ghost" className="w-full justify-start gap-3 h-10 mb-1" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))}>
                                  <Link to="/vendedor" search={{ tab: 'pronta_entrega' }}>
                                    <Zap className="size-4 text-emerald-500 fill-emerald-500" /> Pronta Entrega
                                  </Link>
                                </Button>
                                <Button asChild variant="ghost" className="w-full justify-start gap-3 h-10 mb-1" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))}>
                                  <Link to="/vendedor" search={{ tab: 'reservas' }}>
                                    <Car className="size-4 text-emerald-500" /> Pedidos/Reservas
                                  </Link>
                                </Button>
                                <Button asChild variant="ghost" className="w-full justify-start gap-3 h-10 mb-1" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))}>
                                  <Link to="/vendedor" search={{ tab: 'clientes' }}>
                                    <User className="size-4 text-emerald-500" /> Clientes
                                  </Link>
                                </Button>
                                <Button asChild variant="ghost" className="w-full justify-start gap-3 h-10 mb-1" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))}>
                                  <Link to="/vendedor" search={{ tab: 'loja' }}>
                                    <Palette className="size-4 text-emerald-500" /> Personalização
                                  </Link>
                                </Button>
                              </div>
                            ) : (
                              <Button asChild variant="ghost" className="w-full justify-start gap-3 h-11" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))}>
                                <Link to="/vendedor" search={{ tab: "produtos" }} preload="intent">
                                  <StoreIcon className="size-5 text-emerald-500" /> Criar Minha Loja
                                </Link>
                              </Button>
                            )}
                            <Button variant="ghost" className="w-full justify-start gap-3 h-11" onClick={() => { setProfileOpen(true); document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'})); }}>
                              <User className="size-5 text-blue-500" /> Meu Perfil
                            </Button>
                            
                            {myLinkedStores && myLinkedStores.length > 0 && (
                              <div className="pt-4 pb-2">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3 px-2">Lojas Seguidas</h4>
                                {myLinkedStores.map((s: any) => (
                                  <Button key={s.id} asChild variant="ghost" className="w-full justify-start gap-3 h-11 mb-1" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))}>
                                    <Link to="/loja/$slug" params={{ slug: s.slug }}>
                                      {s.logo_url ? (
                                        <img src={s.logo_url} alt={s.name} className="size-5 rounded object-cover border border-border" />
                                      ) : (
                                        <StoreIcon className="size-5 text-muted-foreground" />
                                      )}
                                      <span className="truncate">{s.name}</span>
                                    </Link>
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          <div className="p-4 border-t border-border/50 bg-muted/10">
                            <Button variant="destructive" className="w-full gap-2 font-medium" onClick={signOut}>
                              <LogOut className="size-4" /> Sair da conta
                            </Button>
                          </div>
                        </div>
                      </SheetContent>
                    </Sheet>
                  </div>
                </div>

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
