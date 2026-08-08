import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createServerFn } from "@tanstack/react-start";
import { AppHeader, updateAppFavicon } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PhoneInput } from "@/components/PhoneInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

type AuthSearch = { loja?: string; produto?: string; next?: string };

const fetchAuthStoreMeta = createServerFn({ method: "GET" })
  .validator((d: { loja?: string; next?: string }) => d)
  .handler(async ({ data }) => {
    let store: any = null;
    if (data.loja) {
      const { data: storeData } = await supabase
        .from("stores")
        .select("id, name, slug, logo_url, favicon_url, about_text")
        .eq("id", data.loja)
        .maybeSingle();
      store = storeData;
    }
    if (!store && data.next?.startsWith("/loja/")) {
      const slug = data.next.replace("/loja/", "").split("?")[0].split("/")[0];
      const { data: storeData } = await supabase
        .from("stores")
        .select("id, name, slug, logo_url, favicon_url, about_text")
        .eq("slug", slug)
        .maybeSingle();
      store = storeData;
    }
    return store;
  });

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    loja: typeof search.loja === "string" ? search.loja : undefined,
    produto: typeof search.produto === "string" ? search.produto : undefined,
    next: typeof search.next === "string" && search.next.startsWith("/") ? search.next : undefined,
  }),
  loaderDeps: ({ search }) => ({ loja: search.loja, next: search.next }),
  loader: async ({ deps }) => {
    const store = await fetchAuthStoreMeta({ data: { loja: deps.loja, next: deps.next } });
    return { store };
  },
  head: ({ loaderData }) => {
    const store = loaderData?.store;
    const title = store?.name ? `Entrar / Criar Conta — ${store.name}` : "Entrar ou criar conta — Vendas 1:64";
    const desc = store?.name
      ? (store.about_text || `Acesse sua conta para ver as pré-vendas e fazer reservas na ${store.name}.`)
      : "Acesse sua conta para reservar miniaturas ou gerenciar sua loja.";
    const img = store?.logo_url || store?.favicon_url || "https://vendas164.com.br/og-image.png";

    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: img },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: img },
      ],
      links: (store?.favicon_url || store?.logo_url) ? [{ rel: "icon", href: store.favicon_url || store.logo_url }] : [],
    };
  },
  component: AuthPage,
});

function AuthPage() {
  return (
    <ErrorBoundary>
      <AuthPageContent />
    </ErrorBoundary>
  );
}

function AuthPageContent() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading: sessionLoading } = useSession();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const { data: invitedStore } = useQuery({
    queryKey: ["invited-store", search.loja, search.next],
    enabled: !!(search.loja || search.next?.startsWith("/loja/")),
    retry: 2,
    queryFn: async () => {
      if (search.loja) {
        const { data } = await supabase
          .from("stores")
          .select("*")
          .eq("id", search.loja)
          .maybeSingle();
        if (data) return data;
      }
      if (search.next?.startsWith("/loja/")) {
        const slug = search.next.replace("/loja/", "").split("?")[0];
        const { data } = await supabase
          .from("stores")
          .select("*")
          .eq("slug", slug)
          .maybeSingle();
        if (data) return data;
      }
      return null;
    },
  });

  // Se o usuário JÁ ESTIVER LOGADO ao clicar/colar o link de convite:
  useEffect(() => {
    async function processAlreadyLoggedInUser() {
      if (sessionLoading || !user) return;
      
      const storeId = search.loja || invitedStore?.id;
      if (storeId && invitedStore && invitedStore.owner_id !== user.id) {
        await supabase.from("customer_store_link").upsert(
          { user_id: user.id, store_id: storeId },
          { onConflict: "user_id,store_id" }
        );
      }

      const dest = search.next ?? (search.produto ? `/produto/${search.produto}` : (invitedStore?.slug ? `/loja/${invitedStore.slug}` : "/painel"));
      navigate({ to: dest, replace: true });
    }

    processAlreadyLoggedInUser();
  }, [user, sessionLoading, search.loja, search.next, invitedStore]);

  useEffect(() => {
    if (search.loja) {
      window.sessionStorage.setItem("pending_store_link", search.loja);
    }
  }, [search.loja]);

  useEffect(() => {
    if (invitedStore?.name) {
      document.title = `Acesse ${invitedStore.name}`;
      const icon = invitedStore.favicon_url || invitedStore.logo_url;
      if (icon) {
        updateAppFavicon(icon);
      }
    }
  }, [invitedStore]);

  async function finish() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    const storeId = search.loja ?? window.sessionStorage.getItem("pending_store_link");
    
    // Vincular cliente à loja (tanto no cadastro quanto no login), desde que não seja a própria loja do usuário
    if (user && storeId) {
      const { data: targetStore } = await supabase
        .from("stores")
        .select("owner_id")
        .eq("id", storeId)
        .maybeSingle();

      if (targetStore && targetStore.owner_id !== user.id) {
        await supabase.from("customer_store_link").upsert(
          { user_id: user.id, store_id: storeId },
          { onConflict: "user_id,store_id" }
        );
      }
      window.sessionStorage.removeItem("pending_store_link");
    }

    // Salvar/Atualizar perfil com Nome e WhatsApp
    if (user) {
      const cleanPhone = phone.trim() || user.user_metadata?.phone || null;
      const cleanName = name.trim() || user.user_metadata?.name || "Cliente";
      await supabase.from("profiles").upsert({
        id: user.id,
        name: cleanName,
        email: user.email,
        phone: cleanPhone,
      });

// Lógica de Garagem: Migração de reservas vinculadas por telefone/email temporário para o novo user.id
       try {
         // Migração via RPC: a função de banco acha os IDs antigos ou via metadados pix_key GUEST e atualiza
        const { error: rpcError } = await supabase.rpc("migrate_reservations_by_phone", {
          p_new_user_id: user.id,
          p_phone: cleanPhone,
        });
        
        if (rpcError) {
          console.error("Erro na RPC de migração via auth.tsx:", rpcError);
        } else {
          console.log("Migração RPC disparada com sucesso no auth.tsx.");
        }

      } catch (err) {
        console.error("Erro ao migrar reservas pendentes para a conta do cliente:", err);
      }
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
    if (!phone.trim()) {
      return toast.error("Por favor, informe seu número de WhatsApp.");
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone },
        emailRedirectTo: window.location.origin,
      },
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

  return (
    <div className="min-h-screen">
      <AppHeader store={invitedStore} />
      <main className="hero-surface flex min-h-[calc(100vh-4rem)] items-start justify-center px-4 py-12">
        <Card className="w-full max-w-md panel border-border/60">
          <CardHeader>
            <CardTitle className="text-2xl">
              {invitedStore?.name ? `Acesse ${invitedStore.name}` : "Acesse Vendas 1:64"}
            </CardTitle>
            <CardDescription>
              {invitedStore?.name
                ? `Você foi convidado por ${invitedStore.name}. Ao criar sua conta ela ficará vinculada automaticamente.`
                : search.loja
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
                    <Label htmlFor="signup-name">Nome completo</Label>
                    <Input
                      id="signup-name"
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">WhatsApp</Label>
                    <PhoneInput
                      id="signup-phone"
                      required
                      value={phone}
                      onChange={setPhone}
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
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      A senha deve conter no mínimo 6 caracteres, incluindo letras maiúsculas, minúsculas e números.
                    </p>
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
            <p className="mt-6 text-center text-[11px] text-muted-foreground leading-relaxed">
              Ao continuar, você concorda com nossos{" "}
              <Link to="/termos" className="text-primary underline font-medium">
                Termos de Uso
              </Link>{" "}
              e nossa{" "}
              <Link to="/privacidade" className="text-emerald-500 underline font-medium">
                Política de Privacidade (LGPD)
              </Link>.
            </p>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
