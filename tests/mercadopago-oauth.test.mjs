import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Mercado Pago OAuth migration keeps the connection table server-only", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.mercadopago_connections (
        store_id uuid PRIMARY KEY, mp_user_id text, public_key text, access_token text,
        refresh_token text, expires_at timestamptz, is_sandbox boolean NOT NULL DEFAULT true,
        is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE FUNCTION public.save_store_payment_credentials(uuid,text,text,boolean,boolean) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb';
      CREATE FUNCTION public.get_store_payment_public_config(uuid) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb';
      CREATE FUNCTION public.get_store_payment_status(uuid) RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb';
    `);
    const migration = await readFile(new URL("../supabase/migrations/20260928122006_mercadopago_oauth.sql", import.meta.url), "utf8");
    await db.exec(migration);
    const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='mercadopago_connections'");
    const names = new Set(columns.rows.map((row) => row.column_name));
    for (const name of ["encrypted_tokens", "oauth_state_hash", "oauth_code_verifier", "oauth_expires_at", "connection_type", "refresh_lock_until"]) {
      assert.equal(names.has(name), true, `missing ${name}`);
    }
    const permissions = (await db.query(`SELECT
      has_function_privilege('anon','public.save_store_payment_credentials(uuid,text,text,boolean,boolean)','EXECUTE') AS anon_save,
      has_function_privilege('authenticated','public.get_store_payment_status(uuid)','EXECUTE') AS user_status,
      has_function_privilege('service_role','public.save_store_payment_credentials(uuid,text,text,boolean,boolean)','EXECUTE') AS service_save`)).rows[0];
    assert.equal(permissions.anon_save, false);
    assert.equal(permissions.user_status, false);
    assert.equal(permissions.service_save, true);
  } finally {
    await db.close();
  }
});

test("OAuth flow uses PKCE, protected state and encrypted server tokens", async () => {
  const [server, settings] = await Promise.all([
    readFile(new URL("../src/lib/mercadoPago.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/vendedor/PaymentSettingsTab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(server, /code_challenge_method: "S256"/);
  assert.match(server, /createCipheriv\("aes-256-gcm"/);
  assert.match(server, /oauth_state_hash/);
  assert.match(server, /grant_type: "refresh_token"/);
  assert.match(settings, /Conectar Mercado Pago/);
  assert.doesNotMatch(settings, /(?:Access Token|Public Key)[^<]{0,80}<(?:Input|input)\b|<(?:Input|input)\b[^>]*(?:access-token|public-key)/i);
});
