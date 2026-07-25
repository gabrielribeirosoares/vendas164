import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

type AuthSearch = { loja?: string; produto?: string; next?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    loja: typeof search.loja === "string" ? search.loja : undefined,
    produto: typeof search.produto === "string" ? search.produto : undefined,
    next: typeof search.next === "string" && search.next.startsWith("/") ? search.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta — MiniPré" },
      {
        name: "description",
        content: "Acesse sua conta MiniPré para reservar miniaturas ou gerenciar sua loja.",
      },
      { property: "og:title", content: "Entrar ou criar conta — MiniPré" },
      { property: "og:description", content: "Acesse sua conta MiniPré." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (search.loja) {
      window.sessionStorage.setItem("pending_store_link", search.loja);
    }
  }, [search.loja]);

  async function finish() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    const storeId = search.loja ?? window.sessionStorage.getItem("pending_store_link");
    if (user && storeId) {
      await supabase.from("customer_store_link").insert({ user_id: user.id, store_id: storeId });
      window.sessionStorage.removeItem("pending_store_link");
    }
    const dest = search.next ?? (search.produto ? `/produto/${search.produto}` : "/painel");
    navigate({ to: dest, replace: true });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error("E-mail ou senha inválidos.");
    toast.success("Bem-vindo de volta!");
    await finish();
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      toast.success("Conta criada! Confirme seu e-mail para entrar.");
      return;
    }
    toast.success("Conta criada com sucesso!");
    await finish();
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) return toast.error("Não foi possível entrar com Google.");
    if (result.redirected) return;
    await finish();
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="hero-surface flex min-h-[calc(100vh-4rem)] items-start justify-center px-4 py-12">
        <Card className="w-full max-w-md panel border-border/60">
          <CardHeader>
            <CardTitle className="text-2xl">Acesse a MiniPré</CardTitle>
            <CardDescription>
              {search.loja
                ? "Você foi convidado por uma loja. Ao criar sua conta ela ficará vinculada automaticamente."
                : "Reserve miniaturas ou gerencie sua loja."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Entrar
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nome</Label>
                    <Input
                      id="signup-name"
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Criar conta
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="secondary" className="w-full" onClick={handleGoogle}>
              Continuar com Google
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
