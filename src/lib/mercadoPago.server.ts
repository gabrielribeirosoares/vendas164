import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function gatewayAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração de pagamentos indisponível.");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

type MercadoPagoTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
  public_key?: string;
  scope?: string;
  token_type?: string;
  expires_at?: string;
};

type MercadoPagoConnection = {
  store_id: string;
  access_token: string | null;
  encrypted_tokens: string | null;
  is_active: boolean;
  is_sandbox: boolean;
  connection_type: "manual" | "oauth";
  oauth_state_hash: string | null;
  oauth_code_verifier: string | null;
  oauth_expires_at: string | null;
  refresh_lock_until: string | null;
};

function oauthConfig(origin?: string) {
  const clientId = process.env.MERCADOPAGO_CLIENT_ID;
  const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;
  const redirectUri = process.env.MERCADOPAGO_REDIRECT_URI || `${origin || "https://vendas164.com.br"}/api/mercadopago/oauth/callback`;
  if (!clientId || !clientSecret) throw new Error("A integração OAuth do Mercado Pago precisa ser configurada pelo administrador.");
  return { clientId, clientSecret, redirectUri };
}

function tokenEncryptionKey() {
  const key = Buffer.from(process.env.MERCADOPAGO_TOKEN_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("A proteção dos tokens do Mercado Pago precisa ser configurada pelo administrador.");
  return key;
}

function encryptValue(storeId: string, value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(storeId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

function decryptValue<T>(storeId: string, payload: string): T {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Credencial criptografada inválida.");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  decipher.setAAD(Buffer.from(storeId));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as T;
}

async function paymentConnection(storeId: string) {
  const { data, error } = await gatewayAdmin().from("mercadopago_connections" as never)
    .select("store_id, access_token, encrypted_tokens, is_active, is_sandbox, connection_type, oauth_state_hash, oauth_code_verifier, oauth_expires_at, refresh_lock_until")
    .eq("store_id", storeId).maybeSingle();
  if (error) throw new Error("Não foi possível consultar a conexão do Mercado Pago.");
  return data as unknown as MercadoPagoConnection | null;
}

async function exchangeOAuthToken(origin: string | undefined, body: Record<string, string>) {
  const config = oauthConfig(origin);
  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...body }),
  });
  const result = await response.json() as MercadoPagoTokens & { message?: string };
  if (!response.ok || !result.access_token) throw new Error("O Mercado Pago não autorizou a conexão. Tente novamente.");
  result.expires_at = new Date(Date.now() + Math.max(60, Number(result.expires_in || 21600)) * 1000).toISOString();
  return result;
}

export async function assertStoreManager(token: string, storeId: string) {
  const admin = gatewayAdmin();
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) throw new Error("Entre na sua conta para gerenciar os pagamentos.");
  const { data: store, error } = await admin.from("stores").select("id, owner_id").eq("id", storeId).maybeSingle();
  if (error || !store || store.owner_id !== auth.user.id) throw new Error("Você não tem permissão para gerenciar os pagamentos desta loja.");
  return auth.user;
}

export async function getMercadoPagoConnectionStatus(storeId: string) {
  const row = await paymentConnection(storeId);
  let configured = false;
  try { oauthConfig(); tokenEncryptionKey(); configured = true; } catch { /* status only */ }
  return {
    configured,
    connected: !!row?.is_active && (!!row.encrypted_tokens || !!row.access_token),
    connectionType: row?.connection_type || null,
    isLegacy: !!row?.access_token && !row.encrypted_tokens,
  };
}

export async function beginMercadoPagoConnection(storeId: string, origin: string) {
  const config = oauthConfig(origin);
  tokenEncryptionKey();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const { error } = await gatewayAdmin().from("mercadopago_connections" as never).upsert({
    store_id: storeId,
    oauth_state_hash: stateHash,
    oauth_code_verifier: encryptValue(storeId, verifier),
    oauth_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  } as never, { onConflict: "store_id" });
  if (error) throw new Error("Não foi possível iniciar a autorização do Mercado Pago.");
  const url = new URL("https://auth.mercadopago.com/authorization");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    platform_id: "mp",
    redirect_uri: config.redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function finishMercadoPagoConnection(callbackUrl: string, origin: string) {
  const callback = new URL(callbackUrl);
  const code = callback.searchParams.get("code");
  const state = callback.searchParams.get("state");
  if (!code || !state) throw new Error("A autorização do Mercado Pago foi cancelada ou está incompleta.");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const admin = gatewayAdmin();
  const { data, error } = await admin.from("mercadopago_connections" as never)
    .select("store_id, oauth_code_verifier")
    .eq("oauth_state_hash", stateHash).gt("oauth_expires_at", new Date().toISOString()).maybeSingle();
  const pending = data as unknown as { store_id: string; oauth_code_verifier: string } | null;
  if (error || !pending?.oauth_code_verifier) throw new Error("A autorização expirou. Inicie a conexão novamente.");

  const consumed = await admin.from("mercadopago_connections" as never).update({
    oauth_state_hash: null, oauth_code_verifier: null, oauth_expires_at: null,
  } as never).eq("store_id", pending.store_id).eq("oauth_state_hash", stateHash).select("store_id").maybeSingle();
  if (consumed.error || !consumed.data) throw new Error("Esta autorização já foi utilizada.");

  const verifier = decryptValue<string>(pending.store_id, pending.oauth_code_verifier);
  const config = oauthConfig(origin);
  const tokens = await exchangeOAuthToken(origin, {
    grant_type: "authorization_code", code, redirect_uri: config.redirectUri, code_verifier: verifier,
  });
  const saved = await admin.from("mercadopago_connections" as never).update({
    encrypted_tokens: encryptValue(pending.store_id, tokens),
    access_token: null,
    refresh_token: null,
    public_key: tokens.public_key || null,
    mp_user_id: tokens.user_id ? String(tokens.user_id) : null,
    expires_at: tokens.expires_at,
    is_sandbox: false,
    is_active: true,
    connection_type: "oauth",
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as never).eq("store_id", pending.store_id);
  if (saved.error) throw new Error("Não foi possível salvar a conexão do Mercado Pago.");
  return pending.store_id;
}

export async function disconnectMercadoPago(storeId: string) {
  const { error } = await gatewayAdmin().from("mercadopago_connections" as never).update({
    encrypted_tokens: null, access_token: null, refresh_token: null, public_key: null,
    is_active: false, oauth_state_hash: null, oauth_code_verifier: null,
    oauth_expires_at: null, refresh_lock_until: null, updated_at: new Date().toISOString(),
  } as never).eq("store_id", storeId);
  if (error) throw new Error("Não foi possível desconectar o Mercado Pago.");
}

export async function getMercadoPagoAccessToken(storeId: string) {
  const row = await paymentConnection(storeId);
  if (!row?.is_active) throw new Error("Esta loja ainda não conectou o Mercado Pago.");
  if (!row.encrypted_tokens) {
    if (!row.access_token) throw new Error("Esta loja ainda não conectou o Mercado Pago.");
    return row.access_token; // Compatibilidade temporária com conexões manuais existentes.
  }
  let tokens = decryptValue<MercadoPagoTokens>(storeId, row.encrypted_tokens);
  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 5 * 60_000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error("Reconecte a conta do Mercado Pago.");

  const now = new Date().toISOString();
  const lock = await gatewayAdmin().from("mercadopago_connections" as never)
    .update({ refresh_lock_until: new Date(Date.now() + 45_000).toISOString() } as never)
    .eq("store_id", storeId).or(`refresh_lock_until.is.null,refresh_lock_until.lt.${now}`)
    .select("store_id").maybeSingle();
  if (lock.error || !lock.data) throw new Error("A conexão está sendo atualizada. Tente novamente em instantes.");
  try {
    const latest = await paymentConnection(storeId);
    if (latest?.encrypted_tokens && latest.encrypted_tokens !== row.encrypted_tokens) {
      tokens = decryptValue<MercadoPagoTokens>(storeId, latest.encrypted_tokens);
    } else {
      tokens = await exchangeOAuthToken(undefined, { grant_type: "refresh_token", refresh_token: tokens.refresh_token });
      const saved = await gatewayAdmin().from("mercadopago_connections" as never).update({
        encrypted_tokens: encryptValue(storeId, tokens), expires_at: tokens.expires_at,
        refresh_lock_until: null, updated_at: now,
      } as never).eq("store_id", storeId);
      if (saved.error) throw new Error("Não foi possível renovar a conexão do Mercado Pago.");
    }
    return tokens.access_token;
  } finally {
    await gatewayAdmin().from("mercadopago_connections" as never).update({ refresh_lock_until: null } as never).eq("store_id", storeId);
  }
}

export function pendingAmount(order: {
  total_price: number | null;
  down_payment: number | null;
  payment_status: string | null;
}) {
  const total = Number(order.total_price);
  const signal = Number(order.down_payment || 0);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(signal) || signal < 0 || signal > total) {
    throw new Error("Valor do pedido inválido.");
  }
  let amount: number;
  switch (order.payment_status) {
    case "aguardando_sinal": amount = signal > 0 ? signal : total; break;
    case "sinal_pago": amount = total - signal; break;
    case "pendente":
    case "sem_sinal":
    case "pronta_entrega": amount = total; break;
    default: throw new Error("Pedido indisponível para pagamento.");
  }
  if (amount <= 0) throw new Error("Pedido já está pago.");
  return Math.round(amount * 100);
}

export function parseOrderIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25) throw new Error("Pedidos inválidos.");
  const ids = value.map((id) => String(id));
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Pedidos inválidos.");
  }
  return ids.sort();
}

export function paymentAttemptReference(attemptId: string) {
  return `v164:${attemptId}`;
}

export function paymentAttemptKey(storeId: string, userId: string, orderIds: string[], amountCents: number, method: string) {
  return createHash("sha256").update(JSON.stringify([storeId, userId, orderIds, amountCents, method])).digest("hex");
}

export function parsePaymentAttemptReference(value: unknown) {
  const match = String(value || "").match(/^v164:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (!match) throw new Error("Referência de pagamento inválida.");
  return match[1].toLowerCase();
}

export async function confirmGatewayPayment(
  admin: ReturnType<typeof gatewayAdmin>,
  payment: { id: string; status: string; external_reference: string; transaction_amount: number; payment_method_id?: string },
) {
  if (payment.status !== "approved") return false;
  const attemptId = parsePaymentAttemptReference(payment.external_reference);
  const { data: attempt, error: attemptError } = await admin
    .from("gateway_payment_attempts" as never)
    .select("provider")
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError || (attempt as unknown as { provider?: string } | null)?.provider !== "mercadopago") {
    throw new Error("A tentativa não pertence ao Mercado Pago.");
  }
  const amount = Number(payment.transaction_amount);
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001) {
    throw new Error("Valor do pagamento inválido.");
  }
  const { data, error } = await admin.rpc("confirm_gateway_payment_attempt" as never, {
    p_attempt_id: attemptId,
    p_amount: amount,
    p_payment_method: payment.payment_method_id || "mercadopago",
    p_gateway_id: payment.id,
  } as never);
  if (error) throw error;
  return Boolean((data as { success?: boolean } | null)?.success);
}
