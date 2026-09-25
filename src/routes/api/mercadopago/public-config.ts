import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/mercadopago/public-config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const storeId = url.searchParams.get("storeId");

          if (!storeId) {
            return new Response(JSON.stringify({ error: "storeId é obrigatório" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            return new Response(JSON.stringify({ error: "Configuração ausente" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = createClient<Database>(supabaseUrl, supabaseKey);

          // Buscar na tabela mercadopago_connections
          const { data: connection } = await supabase
            .from("mercadopago_connections" as any)
            .select("public_key, is_sandbox, is_active, access_token")
            .eq("store_id", storeId)
            .maybeSingle();

          if (connection && (connection as any).is_active && (connection as any).public_key && (connection as any).access_token) {
            return new Response(
              JSON.stringify({
                isConfigured: true,
                publicKey: (connection as any).public_key,
                isSandbox: (connection as any).is_sandbox ?? true,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }

          // Se a loja não configurou credenciais, retornar não configurado
          return new Response(
            JSON.stringify({
              isConfigured: false,
              publicKey: null,
              isSandbox: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});