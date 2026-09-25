import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const readMigration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const store = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const signalOrder = '30000000-0000-4000-8000-000000000001';
const fullOrder = '30000000-0000-4000-8000-000000000002';

test('gateway confirmation requires service role and verifies amount, store, and replay', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.orders(id uuid PRIMARY KEY,store_id uuid NOT NULL,total_price numeric NOT NULL,down_payment numeric,payment_status text NOT NULL,payment_method text,gateway_payment_id text,gateway_status text);
      CREATE TABLE public.order_installments(id uuid PRIMARY KEY,order_id uuid,status text,paid_at timestamptz);
      CREATE FUNCTION public.confirm_gateway_payment(uuid[],numeric,text,text) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
      GRANT EXECUTE ON FUNCTION public.confirm_gateway_payment(uuid[],numeric,text,text) TO anon,authenticated;
      INSERT INTO public.orders(id,store_id,total_price,down_payment,payment_status) VALUES
        ('${signalOrder}','${store}',150,25,'aguardando_sinal'),
        ('${fullOrder}','${store}',100,0,'pendente');
      INSERT INTO public.order_installments(id,order_id,status) VALUES
        ('40000000-0000-4000-8000-000000000001','${signalOrder}','pending'),
        ('40000000-0000-4000-8000-000000000002','${fullOrder}','pending');`);
    await db.exec(await readMigration('20260925180000_revoke_unsafe_gateway_confirmation.sql'));
    await db.exec(await readMigration('20260925190000_verified_gateway_payments.sql'));
    const rights = (await db.query(`SELECT has_function_privilege('anon','public.confirm_gateway_payment(uuid[],numeric,text,text)','EXECUTE') old_anon,
      has_function_privilege('authenticated','public.confirm_verified_gateway_payment(uuid,uuid[],numeric,text,text)','EXECUTE') new_user`)).rows[0];
    assert.equal(rights.old_anon,false);
    assert.equal(rights.new_user,false);

    const confirm = (ids, amount, paymentId = 'payment-1', storeId = store) => db.query(
      'SELECT public.confirm_verified_gateway_payment($1,$2::uuid[],$3,$4,$5) AS result',
      [storeId, ids, amount, 'pix', paymentId]);
    await assert.rejects(confirm([signalOrder], 1), /gateway_amount_or_orders_mismatch/);
    await assert.rejects(confirm([signalOrder], 25, 'wrong-store', other), /gateway_order_not_payable/);
    await assert.rejects(confirm([signalOrder,fullOrder], 25), /gateway_amount_or_orders_mismatch/);
    assert.equal((await confirm([signalOrder],25)).rows[0].result.updated_count,1);
    assert.equal((await confirm([signalOrder],25)).rows[0].result.already_confirmed,true);
    await assert.rejects(confirm([fullOrder],100), /gateway_payment_reused/);
    const signalState=(await db.query('SELECT payment_status,down_payment FROM public.orders WHERE id=$1',[signalOrder])).rows[0];
    assert.equal(signalState.payment_status,'sinal_pago');
    assert.equal(Number(signalState.down_payment),25);
    assert.equal((await db.query('SELECT status FROM public.order_installments WHERE order_id=$1',[signalOrder])).rows[0].status,'pending');
    assert.equal((await confirm([fullOrder],100,'payment-2')).rows[0].result.updated_count,1);
    assert.equal((await db.query('SELECT status FROM public.order_installments WHERE order_id=$1',[fullOrder])).rows[0].status,'paid');
  } finally {
    await db.close();
  }
});
