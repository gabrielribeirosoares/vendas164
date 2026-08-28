import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";

export const Route = createFileRoute("/update-password")({
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      // Opcional: Se desejar fazer algo ao interceptar explicitamente o PASSWORD_RECOVERY
      if (event === "PASSWORD_RECOVERY") {
        toast.info("Por favor, digite sua nova senha abaixo.");
      }
    });
  }, []);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    
    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: password
    });
    setLoading(false);
    
    if (error) {
      toast.error("Erro ao atualizar senha: " + error.message);
    } else {
      toast.success("Senha atualizada com sucesso!");
      navigate({ to: "/painel", replace: true });
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="hero-surface flex min-h-[calc(100vh-4rem)] items-start justify-center px-4 py-12">
        <Card className="w-full max-w-md panel border-border/60">
          <CardHeader>
            <CardTitle className="text-2xl">Redefinir Senha</CardTitle>
            <CardDescription>
              Digite abaixo a sua nova senha. Ela substituirá a antiga e você já será conectado automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !password}>
                {loading ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
      <AppFooter />
    </div>
  );
}
