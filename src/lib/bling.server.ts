import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { BlingProductItem } from './bling';

type Tokens = { access_token: string; refresh_token: string; expires_in?: number };
type Connection = { store_id: string; encrypted_tokens: string | null; oauth_state: string | null; oauth_expires_at: string | null };
type BlingProductDetails = BlingProductItem & {
  midia?: {
    imagens?: {
      externas?: Array<{ link?: string }>;
      internas?: Array<{ link?: string; linkMiniatura?: string }>;
    };
  };
};
// This table is deliberately inaccessible to browser roles.
const db = () => supabaseAdmin as unknown as import('@supabase/supabase-js').SupabaseClient;
function config(storeId: string) {
  const platformCredentials = {
    clientId: process.env.BLING_CLIENT_ID || '',
    clientSecret: process.env.BLING_CLIENT_SECRET || '',
  };
  if (platformCredentials.clientId && platformCredentials.clientSecret) return platformCredentials;

  // Backwards compatibility while existing installations move to the single
  // Vendas 1:64 OAuth application.
  let stores: Record<string, { clientId: string; clientSecret: string }>;
  try { stores = JSON.parse(process.env.BLING_STORE_CREDENTIALS || '{}'); }
  catch { throw new Error('A integração precisa ser configurada pelo administrador.'); }
  const credentials = stores[storeId];
  if (!credentials?.clientId || !credentials?.clientSecret) throw new Error('A integração precisa ser configurada pelo administrador.');
  return credentials;
}
function encryptionKey() {
  const key = Buffer.from(process.env.BLING_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('A integração precisa ser configurada pelo administrador.');
  return key;
}
function encrypt(storeId: string, tokens: Tokens) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(storeId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(b => b.toString('base64')).join('.');
}
function decrypt(storeId: string, payload: string): Tokens {
  const [iv, tag, data] = payload.split('.').map(s => Buffer.from(s, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(storeId)); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
}
async function connection(storeId: string): Promise<Connection | null> {
  const { data, error } = await db().from('bling_connections').select('store_id, encrypted_tokens, oauth_state, oauth_expires_at').eq('store_id', storeId).maybeSingle();
  if (error) throw new Error('Não foi possível consultar a conexão da loja.');
  return data;
}
async function exchange(storeId: string, params: Record<string, string>): Promise<Tokens> {
  const creds = config(storeId);
  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`,
      'enable-jwt': '1',
    },
    body: new URLSearchParams(params),
  });
  if (!response.ok) throw new Error('Não foi possível autorizar o Bling. Reconecte a conta.');
  const tokens = await response.json() as Tokens;
  if (!tokens.access_token || !tokens.refresh_token) throw new Error('O Bling não retornou uma autorização válida.');
  return tokens;
}
export async function getConnectionStatus(storeId: string) {
  const row = await connection(storeId);
  let configured = false;
  try { config(storeId); encryptionKey(); configured = true; } catch { /* status only */ }
  return { connected: configured && !!row?.encrypted_tokens, configured };
}
export async function beginConnection(storeId: string) {
  const creds = config(storeId); encryptionKey();
  const state = randomBytes(32).toString('hex');
  const { error } = await db().from('bling_connections').upsert({ store_id: storeId, oauth_state: state, oauth_expires_at: new Date(Date.now() + 600000).toISOString() }, { onConflict: 'store_id' });
  if (error) throw new Error('Não foi possível iniciar a autorização.');
  const url = new URL('https://www.bling.com.br/Api/v3/oauth/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: creds.clientId, state }).toString();
  return { url: url.toString() };
}
export async function finishConnection(callbackUrl: string) {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code'); const state = url.searchParams.get('state');
  if (url.searchParams.get('error')) throw new Error('A autorização foi cancelada ou recusada no Bling.');
  if (!code || !state) throw new Error('O Bling não retornou uma autorização válida.');
  // Consume state atomically so a callback cannot be replayed.
  const { data, error } = await db().from('bling_connections').update({ oauth_state: null, oauth_expires_at: null })
    .eq('oauth_state', state).gt('oauth_expires_at', new Date().toISOString()).select('store_id').maybeSingle();
  if (error || !data) throw new Error('A autorização expirou. Abra uma nova autorização no Bling.');
  const storeId = data.store_id as string;
  const tokens = await exchange(storeId, { grant_type: 'authorization_code', code });
  const saved = await db().from('bling_connections').update({ encrypted_tokens: encrypt(storeId, tokens), updated_at: new Date().toISOString() }).eq('store_id', storeId);
  if (saved.error) throw new Error('Não foi possível salvar a conexão. Autorize novamente.');
  return { connected: true, storeId };
}
export async function disconnectConnection(storeId: string) {
  const { error } = await db().from('bling_connections').update({
    encrypted_tokens: null,
    oauth_state: null,
    oauth_expires_at: null,
    refresh_lock_until: null,
    updated_at: new Date().toISOString(),
  }).eq('store_id', storeId);
  if (error) throw new Error('Não foi possível desconectar a conta do Bling.');
  return { disconnected: true };
}

async function authorizedBlingRequest(storeId: string, path: string) {
  const row = await connection(storeId);
  if (!row?.encrypted_tokens) throw new Error('Conecte sua conta do Bling para importar produtos.');
  let tokens = decrypt(storeId, row.encrypted_tokens);
  const request = (token: string) => fetch(`https://api.bling.com.br/Api/v3/${path}`, {
    signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'enable-jwt': '1' },
  });
  let response = await request(tokens.access_token);
  if (response.status === 401) {
    const now = new Date().toISOString();
    const lock = await db().from('bling_connections').update({ refresh_lock_until: new Date(Date.now() + 45000).toISOString() })
      .eq('store_id', storeId).or(`refresh_lock_until.is.null,refresh_lock_until.lt.${now}`).select('store_id').maybeSingle();
    if (lock.error || !lock.data) throw new Error('A conexão está sendo atualizada. Tente novamente em instantes.');
    try {
      // Another request may have renewed the token before we acquired the lease.
      const latest = await connection(storeId);
      if (latest?.encrypted_tokens !== row.encrypted_tokens && latest?.encrypted_tokens) {
        tokens = decrypt(storeId, latest.encrypted_tokens);
      } else {
        tokens = await exchange(storeId, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
        const saved = await db().from('bling_connections').update({ encrypted_tokens: encrypt(storeId, tokens), updated_at: now }).eq('store_id', storeId);
        if (saved.error) throw new Error('Não foi possível salvar a renovação da conexão.');
      }
      response = await request(tokens.access_token);
    } finally { await db().from('bling_connections').update({ refresh_lock_until: null }).eq('store_id', storeId); }
  }
  return response;
}

function safeHttpsUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const MAX_BLING_IMAGE_BYTES = 4 * 1024 * 1024;
const BLING_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function downloadInternalProductImage(value: unknown) {
  const imageUrl = safeHttpsUrl(value);
  if (!imageUrl) return null;

  const url = new URL(imageUrl);
  if (url.hostname !== 'orgbling.s3.amazonaws.com') return null;

  const response = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: { Accept: 'image/jpeg,image/png,image/webp' },
  });
  if (!response.ok) throw new Error('A imagem original do Bling não pôde ser baixada.');

  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
  if (!BLING_IMAGE_TYPES.has(contentType)) throw new Error('O Bling retornou uma imagem em formato incompatível.');

  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_BLING_IMAGE_BYTES) throw new Error('A imagem original do Bling excede 4 MB.');

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BLING_IMAGE_BYTES) {
    throw new Error('A imagem original do Bling está vazia ou excede 4 MB.');
  }

  return {
    imageData: Buffer.from(bytes).toString('base64'),
    contentType,
  };
}

export async function loadProducts(storeId: string, page: number) {
  const response = await authorizedBlingRequest(storeId, `produtos?limite=100&pagina=${page}`);
  if (!response.ok) throw new Error(response.status === 429 ? 'O Bling limitou as consultas. Tente novamente em instantes.' : 'Não foi possível carregar os produtos do Bling.');
  const payload = await response.json();
  const products = (payload.data ?? []) as BlingProductItem[];
  return { products, hasMore: products.length === 100 };
}

export async function loadProductImage(storeId: string, productId: number, fallbackUrl?: string) {
  const response = await authorizedBlingRequest(storeId, `produtos/${productId}`);
  if (!response.ok) {
    throw new Error(response.status === 429
      ? 'O Bling limitou as consultas. Tente novamente em instantes.'
      : 'Não foi possível consultar a imagem original do produto.');
  }

  const payload = await response.json() as { data?: BlingProductDetails };
  const product = payload.data;
  const externalImage = product?.midia?.imagens?.externas
    ?.map((image) => safeHttpsUrl(image.link))
    .find(Boolean);

  if (externalImage) return {
    imageUrl: externalImage,
    imageQuality: 'original' as const,
    imageData: null,
    contentType: null,
  };

  const internalImage = product?.midia?.imagens?.internas
    ?.map((image) => image.link)
    .find(Boolean);
  if (internalImage) {
    const downloaded = await downloadInternalProductImage(internalImage);
    if (downloaded) {
      return {
        imageUrl: null,
        imageQuality: 'original' as const,
        ...downloaded,
      };
    }
  }

  const thumbnail = safeHttpsUrl(product?.imagemURL)
    || product?.midia?.imagens?.internas?.map((image) => safeHttpsUrl(image.linkMiniatura)).find(Boolean)
    || safeHttpsUrl(fallbackUrl);

  return {
    imageUrl: thumbnail || null,
    imageQuality: thumbnail ? 'thumbnail' as const : 'missing' as const,
    imageData: null,
    contentType: null,
  };
}
