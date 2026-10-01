import { createFileRoute } from "@tanstack/react-router";
import { infinitePayAdmin } from "@/lib/infinitePay.server";

type Provider = "mercadopago" | "infinitepay";

async function authorizeStore(request: Request, storeId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) throw new Error("Loja inválida.");
  const admin = infinitePayAdmin();
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) throw new Error("Entre na sua conta para gerenciar pagamentos.");
  const { data: { user }, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !user) throw new Error("Sessão inválida.");
  const { data: store, error } = await admin.from("stores").select("id, owner_id").eq("id", storeId).maybeSingle();
  if (error || !store || store.owner_id !== user.id) throw new Error("Você não tem permissão para gerenciar esta loja.");
  return admin;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível atualizar a forma de pagamento.";
  const status = message.includes("permissão") ? 403 : message.includes("Sessão") || message.includes("Entre") ? 401 : 400;
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/payment-provider/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const storeId = new URL(request.url).searchParams.get("storeId") || "";
          const admin = await authorizeStore(request, storeId);
          const { data, error } = await admin.from("store_payment_provider_settings" as never)
            .select("active_provider").eq("store_id", storeId).maybeSingle();
          if (error) throw error;
          return Response.json({ activeProvider: (data as unknown as { active_provider: Provider | null } | null)?.active_provider ?? null });
        } catch (error) {
          return errorResponse(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const storeId = String(body.storeId || "");
          const provider = body.provider as Provider;
          if (provider !== "mercadopago" && provider !== "infinitepay") throw new Error("Forma de pagamento inválida.");
          const admin = await authorizeStore(request, storeId);

          const connection = provider === "mercadopago"
            ? await admin.from("mercadopago_connections" as never).select("is_active, access_token, encrypted_tokens").eq("store_id", storeId).maybeSingle()
            : await admin.from("infinitepay_connections" as never).select("is_active").eq("store_id", storeId).maybeSingle();
          if (connection.error) throw connection.error;
          const row = connection.data as unknown as { is_active?: boolean; access_token?: string | null; encrypted_tokens?: string | null } | null;
          const connected = provider === "mercadopago"
            ? Boolean(row?.is_active && (row.access_token || row.encrypted_tokens))
            : Boolean(row?.is_active);
          if (!connected) throw new Error(`Conecte ${provider === "mercadopago" ? "o Mercado Pago" : "a InfinitePay"} antes de ativá-lo no checkout.`);

          const { error } = await admin.from("store_payment_provider_settings" as never).upsert({
            store_id: storeId, active_provider: provider, updated_at: new Date().toISOString(),
          } as never, { onConflict: "store_id" });
          if (error) throw error;
          return Response.json({ activeProvider: provider });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
