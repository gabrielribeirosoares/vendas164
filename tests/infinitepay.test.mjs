import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("InfinitePay payment attempts are locked per order and available only to server-side roles", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.stores(id uuid PRIMARY KEY);
      CREATE TABLE public.orders(
        id uuid PRIMARY KEY, store_id uuid NOT NULL, user_id uuid NOT NULL,
        total_price numeric NOT NULL, down_payment numeric, payment_status text NOT NULL
      );
      CREATE TABLE public.gateway_payment_attempts (
        id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        order_ids uuid[] NOT NULL, request_key text NOT NULL, amount numeric NOT NULL,
        payment_method text NOT NULL CHECK(payment_method IN ('pix','checkout_pro')),
        provider text NOT NULL DEFAULT 'mercadopago', max_installments integer NOT NULL,
        description text NOT NULL, status text NOT NULL DEFAULT 'created',
        expires_at timestamptz NOT NULL, provider_resource_id text, provider_payment_id text,
        response_payload jsonb, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
      );
      INSERT INTO auth.users VALUES ('10000000-0000-4000-8000-000000000001');
      INSERT INTO public.stores VALUES ('20000000-0000-4000-8000-000000000001');
      INSERT INTO public.orders VALUES
        ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
         '10000000-0000-4000-8000-000000000001',150,25,'aguardando_sinal');`);
    const migration = await readFile(
      new URL("../supabase/migrations/20260930150000_infinitepay_checkout.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(await readFile(new URL("../supabase/migrations/20260930173500_allow_unpaid_payment_statuses.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20260930213000_recover_stale_gateway_attempts.sql", import.meta.url), "utf8"));
    const payableStatuses = ["sem_sinal", "pronta_entrega"];
    for (const [index, status] of payableStatuses.entries()) {
      const id = `30000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`;
      await db.query("INSERT INTO public.orders VALUES($1,$2,$3,150,0,$4)", [id, "20000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000001", status]);
      if (index === 0) {
        await db.query(`INSERT INTO public.gateway_payment_attempts(
          id, store_id, user_id, order_ids, request_key, amount, payment_method, provider,
          max_installments, description, status, expires_at, updated_at
        ) VALUES($1,$2,$3,$4::uuid[],$5,150,'infinitepay','infinitepay',1,'Tentativa antiga',
          'pending',$6,$7)`, [
          "40000000-0000-4000-8000-000000000009", "20000000-0000-4000-8000-000000000001",
          "10000000-0000-4000-8000-000000000001", [id], "c".repeat(64),
          new Date(Date.now() + 3600_000).toISOString(), new Date(Date.now() - 10 * 60_000).toISOString(),
        ]);
        await db.query("INSERT INTO public.gateway_payment_attempt_order_locks(order_id,attempt_id) VALUES($1,$2)",
          [id, "40000000-0000-4000-8000-000000000009"]);
      }
      const result = await db.query(`SELECT public.create_gateway_payment_attempt($1,$2,$3,$4::uuid[],$5,$6,$7,$8,$9,$10,$11::timestamptz) AS id`, [
        `40000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`, "20000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000001", [id], String(index + 1).repeat(64), 150, "infinitepay", "infinitepay", 1, "Reserva miniatura", new Date(Date.now() + 3600_000).toISOString(),
      ]);
      assert.ok(result.rows[0].id);
      if (index === 0) {
        const stale = await db.query("SELECT status FROM public.gateway_payment_attempts WHERE id = $1",
          ["40000000-0000-4000-8000-000000000009"]);
        assert.equal(stale.rows[0].status, "failed");
      }
    }

    const grants = (await db.query(`SELECT
      has_table_privilege('anon','public.infinitepay_connections','SELECT') AS anon_read,
      has_table_privilege('authenticated','public.infinitepay_connections','SELECT') AS user_read,
      has_table_privilege('service_role','public.infinitepay_connections','SELECT') AS server_read,
      has_function_privilege('anon','public.create_gateway_payment_attempt(uuid,uuid,uuid,uuid[],text,numeric,text,text,integer,text,timestamptz)','EXECUTE') AS anon_call`)).rows[0];
    assert.equal(grants.anon_read, false);
    assert.equal(grants.user_read, false);
    assert.equal(grants.server_read, true);
    assert.equal(grants.anon_call, false);

    const storeId = "20000000-0000-4000-8000-000000000001";
    const userId = "10000000-0000-4000-8000-000000000001";
    const orderId = "30000000-0000-4000-8000-000000000001";
    await db.query("INSERT INTO public.infinitepay_connections(store_id,handle) VALUES($1,'gabrielminis')", [storeId]);
    await assert.rejects(
      db.query(`INSERT INTO public.infinitepay_connections(store_id,handle) VALUES($1,'handle com espaço')`, [storeId]),
      /check constraint/i,
    );

    const firstAttempt = "40000000-0000-4000-8000-000000000001";
    const requestKey = "a".repeat(64);
    const args = [firstAttempt, storeId, userId, [orderId], requestKey, 25, "infinitepay", "infinitepay", 1,
      "Reserva miniatura", new Date(Date.now() + 3600_000).toISOString()];
    const created = (await db.query(`SELECT public.create_gateway_payment_attempt(
      $1,$2,$3,$4::uuid[],$5,$6,$7,$8,$9,$10,$11::timestamptz) AS id`, args)).rows[0].id;
    assert.equal(created, firstAttempt);

    const replayArgs = [...args];
    replayArgs[0] = "40000000-0000-4000-8000-000000000002";
    const replay = (await db.query(`SELECT public.create_gateway_payment_attempt(
      $1,$2,$3,$4::uuid[],$5,$6,$7,$8,$9,$10,$11::timestamptz) AS id`, replayArgs)).rows[0].id;
    assert.equal(replay, firstAttempt);

    const competingArgs = [...replayArgs];
    competingArgs[0] = "40000000-0000-4000-8000-000000000003";
    competingArgs[4] = "b".repeat(64);
    competingArgs[6] = "pix";
    competingArgs[7] = "mercadopago";
    await assert.rejects(
      db.query(`SELECT public.create_gateway_payment_attempt(
        $1,$2,$3,$4::uuid[],$5,$6,$7,$8,$9,$10,$11::timestamptz)`, competingArgs),
      /gateway_order_payment_in_progress/,
    );
  } finally {
    await db.close();
  }
});

test("InfinitePay callbacks verify status and amount with the provider before confirming orders", async () => {
  const [server, webhook, settings, createPayment, mercadoPagoCreatePayment, checkoutDialog] = await Promise.all([
    readFile(new URL("../src/lib/infinitePay.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/api/infinitepay/webhook.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/api/infinitepay/settings.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/api/infinitepay/create-payment.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/api/mercadopago/create-payment.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CheckoutPaymentDialog.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(checkoutDialog, /Gerar PIX automaticamente/);
  assert.match(checkoutDialog, /paymentRequestRef\.current/);
  assert.match(checkoutDialog, /disabled=\{!paymentConfig\?\.isConfigured \|\| paymentBusy\}/);
  assert.match(server, /api\.checkout\.infinitepay\.io\/payment_check/);
  assert.match(server, /!check\.success \|\| !check\.paid \|\| Number\(check\.amount\) !== expectedCents/);
  assert.ok(server.indexOf("api.checkout.infinitepay.io/payment_check") < server.indexOf('admin.rpc("confirm_gateway_payment_attempt"'));
  assert.match(webhook, /verifyAndConfirmInfinitePay/);
  assert.match(settings, /store\.owner_id !== user\.id/);
  assert.match(createPayment, /provider: "infinitepay"/);
  assert.match(createPayment, /order_nsu: paymentAttempt\.id/);
  assert.match(createPayment, /products\(model\)/);
  assert.doesNotMatch(createPayment, /products\(name/);
  const paymentHelpers = await readFile(new URL("../src/lib/mercadoPago.server.ts", import.meta.url), "utf8");
  assert.ok(paymentHelpers.includes('case "sem_sinal":') && paymentHelpers.includes('case "pronta_entrega": amount = total'));
  assert.match(mercadoPagoCreatePayment, /products\(model, max_installments\)/);
  assert.doesNotMatch(mercadoPagoCreatePayment, /products\(name/);
  assert.match(createPayment, /domínio de checkout não permitido/);
  assert.match(mercadoPagoCreatePayment, /providerError\.message/);
  assert.match(mercadoPagoCreatePayment, /email ocultado/);
});
