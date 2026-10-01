import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const customer = "10000000-0000-4000-8000-000000000001";
const store = "20000000-0000-4000-8000-000000000001";
const signalOrder = "30000000-0000-4000-8000-000000000001";
const fullOrder = "30000000-0000-4000-8000-000000000002";
const readyOrder = "30000000-0000-4000-8000-000000000003";
const noSignalOrder = "30000000-0000-4000-8000-000000000004";
const legacySignalOrder = "30000000-0000-4000-8000-000000000005";

test("payment attempts bind amount, customer, store and gateway confirmation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.stores(id uuid PRIMARY KEY);
      CREATE TABLE public.orders(
        id uuid PRIMARY KEY, store_id uuid NOT NULL, user_id uuid NOT NULL,
        total_price numeric NOT NULL, down_payment numeric, signal_amount numeric, payment_status text NOT NULL,
        payment_method text, gateway_payment_id text, gateway_status text
      );
      CREATE TABLE public.order_installments(id uuid PRIMARY KEY,order_id uuid,status text,paid_at timestamptz);
      INSERT INTO auth.users VALUES ('${customer}');
      INSERT INTO public.stores VALUES ('${store}');
      INSERT INTO public.orders VALUES
        ('${signalOrder}','${store}','${customer}',150,25,25,'aguardando_sinal',null,null,null),
        ('${fullOrder}','${store}','${customer}',100,0,0,'pendente',null,null,null),
        ('${readyOrder}','${store}','${customer}',1,0,0,'pronta_entrega',null,null,null),
        ('${noSignalOrder}','${store}','${customer}',50,0,0,'sem_sinal',null,null,null),
        ('${legacySignalOrder}','${store}','${customer}',100,0,1,'aguardando_sinal',null,null,null);
      INSERT INTO public.order_installments VALUES
        ('40000000-0000-4000-8000-000000000001','${signalOrder}','pending',null),
        ('40000000-0000-4000-8000-000000000002','${fullOrder}','pending',null),
        ('40000000-0000-4000-8000-000000000003','${readyOrder}','pending',null),
        ('40000000-0000-4000-8000-000000000004','${noSignalOrder}','pending',null);`);
    const migration = await readFile(
      new URL("../supabase/migrations/20260927200746_payment_attempts.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    const confirmationFix = await readFile(
      new URL("../supabase/migrations/20260930220000_confirm_ready_order_payments.sql", import.meta.url),
      "utf8",
    );
    await db.exec(confirmationFix);
    const signalFix = await readFile(
      new URL("../supabase/migrations/20261001124948_fix_gateway_signal_amount.sql", import.meta.url),
      "utf8",
    );
    await db.exec(signalFix);

    const privileges = (await db.query(`SELECT
      has_table_privilege('anon','public.gateway_payment_attempts','SELECT') AS anon_read,
      has_function_privilege('authenticated','public.confirm_gateway_payment_attempt(uuid,numeric,text,text)','EXECUTE') AS user_execute,
      has_function_privilege('service_role','public.confirm_gateway_payment_attempt(uuid,numeric,text,text)','EXECUTE') AS service_execute`)).rows[0];
    assert.equal(privileges.anon_read, false);
    assert.equal(privileges.user_execute, false);
    assert.equal(privileges.service_execute, true);

    const legacyAttempt = "50000000-0000-4000-8000-000000000005";
    await db.query(`INSERT INTO public.gateway_payment_attempts
      (id,store_id,user_id,order_ids,request_key,amount,payment_method,max_installments,description,status,expires_at)
      VALUES($1,$2,$3,$4::uuid[],repeat('d',64),1,'pix',1,'Sinal R$ 1','pending',now()+interval '30 minutes')`,
      [legacyAttempt, store, customer, [legacySignalOrder]]);
    const signalConfirmation = (await db.query(
      "SELECT public.confirm_gateway_payment_attempt($1,1,'pix','pay-signal-1') AS result",
      [legacyAttempt],
    )).rows[0].result;
    assert.equal(signalConfirmation.updated_count, 1);
    const legacySignal = (await db.query(
      "SELECT payment_status, down_payment, signal_amount FROM public.orders WHERE id=$1",
      [legacySignalOrder],
    )).rows[0];
    assert.equal(legacySignal.payment_status, "sinal_pago");
    assert.equal(Number(legacySignal.down_payment), 1);
    assert.equal(Number(legacySignal.signal_amount), 1);

    await db.query(`INSERT INTO public.orders
      (id,store_id,user_id,total_price,down_payment,signal_amount,payment_status)
      VALUES('30000000-0000-4000-8000-000000000006',$1,$2,100,0,1,'aguardando_sinal')`, [store, customer]);
    const syncedSignal = (await db.query(
      "SELECT down_payment, signal_amount FROM public.orders WHERE id='30000000-0000-4000-8000-000000000006'",
    )).rows[0];
    assert.equal(Number(syncedSignal.down_payment), 1);
    assert.equal(Number(syncedSignal.signal_amount), 1);

    const attempt = "50000000-0000-4000-8000-000000000001";
    await db.query(`INSERT INTO public.gateway_payment_attempts
      (id,store_id,user_id,order_ids,request_key,amount,payment_method,max_installments,description,status,expires_at)
      VALUES($1,$2,$3,$4::uuid[],repeat('a',64),25,'pix',1,'Sinal Mini GT','pending',now()+interval '30 minutes')`,
      [attempt, store, customer, [signalOrder]]);
    await assert.rejects(
      db.query("SELECT public.confirm_gateway_payment_attempt($1,1,'pix','pay-1')", [attempt]),
      /gateway_attempt_mismatch/,
    );
    const result = (await db.query(
      "SELECT public.confirm_gateway_payment_attempt($1,25,'pix','pay-1') AS result",
      [attempt],
    )).rows[0].result;
    assert.equal(result.updated_count, 1);
    assert.equal((await db.query("SELECT payment_status FROM public.orders WHERE id=$1", [signalOrder])).rows[0].payment_status, "sinal_pago");
    assert.equal((await db.query("SELECT status FROM public.order_installments WHERE order_id=$1", [signalOrder])).rows[0].status, "pending");
    assert.equal((await db.query(
      "SELECT public.confirm_gateway_payment_attempt($1,25,'pix','pay-1') AS result",
      [attempt],
    )).rows[0].result.already_confirmed, true);

    const secondAttempt = "50000000-0000-4000-8000-000000000002";
    await db.query(`INSERT INTO public.gateway_payment_attempts
      (id,store_id,user_id,order_ids,request_key,amount,payment_method,max_installments,description,status,expires_at)
      VALUES($1,$2,$3,$4::uuid[],repeat('b',64),100,'checkout_pro',3,'Pedido Kaido House','expired',now()-interval '1 minute')`,
      [secondAttempt, store, customer, [fullOrder]]);
    await assert.rejects(
      db.query("SELECT public.confirm_gateway_payment_attempt($1,100,'card','pay-1')", [secondAttempt]),
      /gateway_payment_reused/,
    );
    assert.equal((await db.query(
      "SELECT public.confirm_gateway_payment_attempt($1,100,'card','pay-2') AS result",
      [secondAttempt],
    )).rows[0].result.updated_count, 1);
    assert.equal((await db.query("SELECT payment_status FROM public.orders WHERE id=$1", [fullOrder])).rows[0].payment_status, "quitado");
    assert.equal((await db.query("SELECT status FROM public.order_installments WHERE order_id=$1", [fullOrder])).rows[0].status, "paid");

    for (const [id, orderId, amount] of [
      ["50000000-0000-4000-8000-000000000003", readyOrder, 1],
      ["50000000-0000-4000-8000-000000000004", noSignalOrder, 50],
    ]) {
      await db.query(`INSERT INTO public.gateway_payment_attempts
        (id,store_id,user_id,order_ids,request_key,amount,payment_method,max_installments,description,status,expires_at)
        VALUES($1,$2,$3,$4::uuid[],repeat('c',64),$5,'pix',1,'Pagamento confirmado','pending',now()+interval '30 minutes')`,
        [id, store, customer, [orderId], amount]);
      const confirmation = (await db.query(
        "SELECT public.confirm_gateway_payment_attempt($1,$2,'infinitepay',$3) AS result",
        [id, amount, `infinitepay-${id}`],
      )).rows[0].result;
      assert.equal(confirmation.updated_count, 1);
      assert.equal((await db.query("SELECT payment_status FROM public.orders WHERE id=$1", [orderId])).rows[0].payment_status, "quitado");
      assert.equal((await db.query("SELECT gateway_status FROM public.orders WHERE id=$1", [orderId])).rows[0].gateway_status, "approved");
      assert.equal((await db.query("SELECT status FROM public.order_installments WHERE order_id=$1", [orderId])).rows[0].status, "paid");
      assert.equal((await db.query("SELECT status FROM public.gateway_payment_attempts WHERE id=$1", [id])).rows[0].status, "approved");
    }
  } finally {
    await db.close();
  }
});

test("Checkout Pro uses the registered attempt, description and installment limit", async () => {
  const source = await readFile(new URL("../src/routes/api/mercadopago/create-payment.ts", import.meta.url), "utf8");
  assert.match(source, /external_reference: externalReference/);
  assert.match(source, /payment_methods: \{ installments: maxInstallments \}/);
  assert.match(source, /title: description/);
  assert.doesNotMatch(source, /external_reference: orderIds\.join/);
});
