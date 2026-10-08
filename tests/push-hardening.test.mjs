import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const migration = await read('supabase/migrations/20261008172515_harden_push_and_restore_sale_type.sql');
const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const store = '20000000-0000-4000-8000-000000000001';
test('forward migration prevents cross-user deletion and ownership reassignment, including store owner', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE stores(id uuid PRIMARY KEY,owner_id uuid);
      INSERT INTO auth.users VALUES('${user}'),('${other}');
      INSERT INTO stores VALUES('${store}','${user}');`);
    await db.exec(await read('supabase/migrations/20260920153000_push_subscriptions.sql'));
    await db.exec(migration);
    await db.exec(`INSERT INTO push_subscriptions(user_id,store_id,endpoint,p256dh,auth) VALUES
      ('${user}','${store}','https://web.push.apple.com/own','key','auth'),
      ('${other}','${store}','https://web.push.apple.com/other','key','auth');
      SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;`);
    assert.equal((await db.query("DELETE FROM push_subscriptions WHERE endpoint='https://web.push.apple.com/other' RETURNING id")).rows.length, 0);
    await assert.rejects(db.query('UPDATE push_subscriptions SET user_id=$1 WHERE user_id=$2',[other,user]), /row-level security/);
    assert.equal((await db.query("DELETE FROM push_subscriptions WHERE endpoint='https://web.push.apple.com/own' RETURNING id")).rows.length, 1);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM push_subscriptions'), /permission denied/);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT user_id FROM push_subscriptions')).rows[0].user_id, other);
  } finally { await db.close(); }
});
test('latest seller definition preserves order modality despite contradictory product and payment status', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${user}'::uuid$$;
      CREATE FUNCTION is_store_owner(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
      CREATE TABLE stores(id uuid PRIMARY KEY,owner_id uuid,name text);
      CREATE TABLE products(id uuid PRIMARY KEY,brand text,model text,release_date date,payment_deadline_date date,payment_deadline_hours integer);
      CREATE TABLE profiles(id uuid PRIMARY KEY,name text,email text,phone text);
      CREATE TABLE orders(id uuid PRIMARY KEY,user_id uuid,store_id uuid,product_id uuid,sale_type text,payment_status text,delivery_status text,
        total_price numeric,signal_amount numeric,down_payment numeric,reservation_expires_at timestamptz,created_at timestamptz,pix_key text);
      CREATE TABLE order_installments(order_id uuid,installment_number integer,amount numeric,status text);
      INSERT INTO stores VALUES('${store}','${user}','Loja');
      INSERT INTO products VALUES('30000000-0000-4000-8000-000000000001','Mini GT','Teste',null,null,0);
      INSERT INTO orders VALUES('40000000-0000-4000-8000-000000000001','${user}','${store}','30000000-0000-4000-8000-000000000001',
        'pre_venda','pronta_entrega','pendente',100,20,0,now()+interval '2 hours',now(),null);`);
    await db.exec(await read('supabase/migrations/20260920153000_push_subscriptions.sql'));
    await db.exec(await read('supabase/migrations/20260928130412_align_seller_pagination_sale_type.sql'));
    await db.exec(await read('supabase/migrations/20261004015928_signal_expiry_reminders.sql'));
    await db.exec(migration);
    const page = async category => (await db.query("SELECT seller_orders_page($1,_category=>$2) AS result",[store,category])).rows[0].result;
    assert.equal((await page('pre_venda')).total,1);
    assert.equal((await page('pronta_entrega')).total,0);
    await db.exec("UPDATE orders SET sale_type='pronta_entrega', payment_status='aguardando_sinal'; UPDATE products SET payment_deadline_hours=24");
    assert.equal((await page('pronta_entrega')).total,1);
    assert.equal((await db.query("SELECT seller_orders_page($1,_focus=>'vencendo') AS result",[store])).rows[0].result.total,1);
  } finally { await db.close(); }
});
test('subscription verification uses authenticated account and fails closed; VAPID has no literal fallback', async () => {
  const server = await read('src/lib/push.server.ts');
  assert.doesNotMatch(server,/VAPID_PRIVATE_KEY\s*\|\|/);
  assert.match(server,/if \(!publicKey \|\| !privateKey\) throw new Error/);
  const client = await read('src/components/PushNotificationManager.tsx');
  assert.match(client,/checkPushSubscriptionServer/);
  assert.match(client,/onAuthStateChange/);
  const rpc = await read('src/lib/push.ts');
  assert.match(rpc,/eq\("user_id", context.userId\)/);
});
