import { Link, useNavigate } from "@tanstack/react-router";
import { Car, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export function AppHeader() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Car className="size-5" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">MiniPré</span>
        </Link>

        <nav className="flex items-center gap-1.5">
          {!loading && user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/painel">Minhas reservas</Link>
              </Button>
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
