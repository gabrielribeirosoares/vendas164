import { createFileRoute } from "@tanstack/react-router";
import { infinitePayAdmin, normalizeInfinitePayHandle } from "@/lib/infinitePay.server";

async function storeOwner(request: Request, storeId: string) {
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

export const Route = createFileRoute("/api/infinitepay/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const storeId = new URL(request.url).searchParams.get("storeId") || "";
          const admin = await storeOwner(request, storeId);
          const { data, error } = await admin.from("infinitepay_connections" as never)
            .select("handle, is_active").eq("store_id", storeId).maybeSingle();
          if (error) throw error;
          const connection = data as unknown as { handle: string; is_active: boolean } | null;
          return Response.json({ connected: !!connection?.is_active, handle: connection?.is_active ? connection.handle : "" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível consultar a InfinitePay.";
          const status = message.includes("permissão") ? 403 : message.includes("Sessão") || message.includes("Entre") ? 401 : 400;
          return Response.json({ error: message }, { status });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const storeId = String(body.storeId || "");
          const handle = normalizeInfinitePayHandle(body.handle);
          const admin = await storeOwner(request, storeId);
          const { error } = await admin.from("infinitepay_connections" as never).upsert({
            store_id: storeId, handle, is_active: true, updated_at: new Date().toISOString(),
          } as never, { onConflict: "store_id" });
          if (error) throw error;
          return Response.json({ connected: true, handle });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível salvar a InfiniteTag.";
          const status = message.includes("permissão") ? 403 : message.includes("Sessão") || message.includes("Entre") ? 401 : 400;
          return Response.json({ error: message }, { status });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const body = await request.json();
          const storeId = String(body.storeId || "");
          const admin = await storeOwner(request, storeId);
          const { error } = await admin.from("infinitepay_connections" as never)
            .delete().eq("store_id", storeId);
          if (error) throw error;
          const { error: providerError } = await admin.from("store_payment_provider_settings" as never)
            .update({ active_provider: null, updated_at: new Date().toISOString() } as never)
            .eq("store_id", storeId).eq("active_provider", "infinitepay");
          if (providerError) throw providerError;
          return Response.json({ connected: false, handle: "" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível desconectar a InfinitePay.";
          const status = message.includes("permissão") ? 403 : message.includes("Sessão") || message.includes("Entre") ? 401 : 400;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
