import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const customer = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const owner = '10000000-0000-4000-8000-000000000003';
const store = '20000000-0000-4000-8000-000000000001';
async function asUser(id = customer, role = 'authenticated') {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec(`SET ROLE ${role}`);
}
async function product(overrides = {}) {
  await db.exec('RESET ROLE');
  const id = randomUUID();
  await db.query(`INSERT INTO products(id,store_id,brand,model,price,stock,max_installments,payment_deadline_hours,initial_stock) VALUES($1,$2,'Mini GT','Teste',100,10,3,24,10)`, [id, store]);
  for (const [key, value] of Object.entries(overrides)) {
    if (!['stock', 'price', 'down_payment_amount', 'payment_deadline_hours', 'bulk_discount_threshold', 'bulk_discount_price'].includes(key)) throw new Error('unsupported fixture');
    await db.query(`UPDATE products SET ${key}=$1 WHERE id=$2`, [value, id]);
  }
  await asUser(); return id;
}
const item = (id, extras = {}) => ({ product_id: id, quantity: 1, installments: 3, expected_total: 100, expected_signal: 20, ...extras });
const checkout = async (items, key = randomUUID()) => (await db.query('SELECT checkout_cart($1,$2::jsonb) AS ids', [key, JSON.stringify(items)])).rows[0].ids;
async function stock(id) { return (await db.query('SELECT stock FROM products WHERE id=$1', [id])).rows[0].stock; }
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    INSERT INTO auth.users VALUES ('${customer}'),('${other}'),('${owner}');`);
  // Start with the repository's original schema, then the financial columns.
  await db.exec(await readFile(new URL('../supabase/migrations/20260725203415_7a543904-d061-4fd1-bb06-d1b13ce19cde.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260729184600_add_installment_columns_to_products.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260731142025_add_bulk_discount_to_products.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260808150000_add_initial_stock_to_products.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260831121000_create_order_installments.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260831123600_fix_insert_order_installments.sql', import.meta.url), 'utf8'));
  await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON order_installments TO authenticated, anon;');
  await db.query('INSERT INTO stores(id,owner_id,name,slug) VALUES($1,$2,$3,$4)', [store,owner,'Loja','loja']);
  await db.exec(await readFile(new URL('../supabase/migrations/20260905190000_secure_checkout.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260905191000_bling_server_credentials.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260726131700_add_pix_key_to_stores_and_orders.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260905192000_catalog_pagination.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260905193000_atomic_manual_reservations.sql', import.meta.url), 'utf8'));
});
after(() => db.close());
test('checkout commits stock, order and exact-cent installments; retry returns same IDs', async () => {
  const id = await product({price:100.01}); const key=randomUUID(); const items=[item(id,{expected_total:100.01})];
  const ids = await checkout(items,key); assert.equal(ids.length,1); assert.equal(await stock(id),9);
  assert.deepEqual(await checkout(items,key),ids); assert.equal(await stock(id),9);
  const parts = (await db.query('SELECT amount,due_date FROM order_installments WHERE order_id=$1 ORDER BY installment_number', [ids[0]])).rows;
  assert.deepEqual(parts.map(p=>Number(p.amount)),[26.67,26.67,26.67]);
  const order=(await db.query('SELECT total_price, signal_amount, installment_count FROM orders WHERE id=$1',[ids[0]])).rows[0];
  assert.equal(Number(order.total_price),100.01); assert.equal(Number(order.signal_amount),20); assert.equal(order.installment_count,3);
  await assert.rejects(checkout([item(id)],key),/checkout_conflict/);
});
test('a failure anywhere in a cart rolls back all its reservations',async()=>{
  const first=await product(); const second=await product({stock:0});
  await assert.rejects(checkout([item(first),item(second)]),/out_of_stock/);
  assert.equal(await stock(first),10);
  assert.equal((await db.query('SELECT id FROM orders WHERE product_id=$1',[first])).rows.length,0);
});
test('rejects client price manipulation and invalid quantities without changing stock',async()=>{
  const id=await product();
  await assert.rejects(checkout([item(id,{expected_total:1})]),/price_changed/);
  for(const quantity of [-1,0,1.5,101]) await assert.rejects(checkout([item(id,{quantity})]),/invalid_cart|invalid_quantity/);
  await assert.rejects(checkout([item(id,{installments:12})]),/invalid_installments/);
  assert.equal(await stock(id),10);
});
test('applies quantity discount on the server and distributes rounding remainder',async()=>{
  const id=await product({bulk_discount_threshold:2,bulk_discount_price:90});
  const ids=await checkout([item(id,{quantity:2,expected_total:180,expected_signal:40})]);
  assert.equal(ids.length,2); assert.equal(await stock(id),8);
  const parts=(await db.query('SELECT amount FROM order_installments WHERE order_id=$1 ORDER BY installment_number',[ids[0]])).rows;
  assert.deepEqual(parts.map(p=>Number(p.amount)),[23.34,23.33,23.33]);
});
test('last unit can only be reserved once',async()=>{
  const id=await product({stock:1}); await checkout([item(id)]);
  await assert.rejects(checkout([item(id)]),/presale_closed|out_of_stock/); assert.equal(await stock(id),0);
});
test('customers cannot read other installments or write financial rows directly',async()=>{
  const id=await product(); const [orderId]=await checkout([item(id)]);
  await asUser(other); assert.equal((await db.query('SELECT * FROM order_installments WHERE order_id=$1',[orderId])).rows.length,0);
  await asUser(customer);
  await assert.rejects(db.query("INSERT INTO order_installments(order_id,installment_number,amount,due_date,status) VALUES($1,1,1,now(),'paid')",[orderId]),/row-level security/);
  await assert.rejects(db.query('INSERT INTO orders(user_id,store_id,product_id,total_price) VALUES($1,$2,$3,1)',[customer,store,id]),/row-level security/);
  await asUser('', 'anon');
  await assert.rejects(db.query('SELECT * FROM order_installments'),/permission denied/);
  await assert.rejects(db.query('SELECT reservar_miniatura($1,1)',[id]),/permission denied/);
  await assert.rejects(checkout([item(id)]),/permission denied/);
});
test('standalone stock adjustment is restricted to the store owner',async()=>{
  const id=await product();
  await assert.rejects(db.query('SELECT reservar_miniatura($1,1)',[id]),/not_authorized/);
  await asUser(owner);
  await assert.rejects(db.query('SELECT reservar_miniatura($1,-1)',[id]),/invalid_quantity/);
  assert.equal((await db.query('SELECT reservar_miniatura($1,2) AS ok',[id])).rows[0].ok,true);
  assert.equal(await stock(id),8);
});
test('browser roles cannot access Bling tokens or checkout ledger',async()=>{
  await asUser();
  await assert.rejects(db.query('SELECT * FROM bling_connections'),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM checkout_requests'),/permission denied/);
});

test('catalog filters and page boundaries are computed on the server', async () => {
  const id = await product();
  await asUser('', 'anon');
  const first = (await db.query("SELECT catalog_page($1,'Teste','all','all','all',true,'price_asc',1,2) AS page", [store])).rows[0].page;
  const second = (await db.query("SELECT catalog_page($1,'Teste','all','all','all',true,'price_asc',2,2) AS page", [store])).rows[0].page;
  assert.equal(first.products.length, 2); assert.ok(first.total > 2);
  assert.equal(first.total, second.total);
  assert.ok(!first.products.some(p => second.products.some(q => p.id === q.id)));
  assert.deepEqual(first.brands, ['Mini GT']);
  const empty = (await db.query("SELECT catalog_page($1,'nonexistent') AS page", [store])).rows[0].page;
  assert.equal(empty.total, 0);
  await assert.rejects(db.query("SELECT catalog_page($1,'','all','all','all',false,'recent',0,12)",[store]),/invalid_catalog_filter/);
});
test('manual reservations are atomic, owner-only and idempotent', async () => {
  const id = await product({ stock: 2 }); const key = randomUUID();
  const order = { user_id: customer, total_price: 100, down_payment: 0, signal_amount: 20, installment_count: 3, payment_status: 'aguardando_sinal' };
  const manual = () => db.query('SELECT create_manual_reservations($1,$2,2,$3::jsonb) AS ids', [key,id,JSON.stringify(order)]);
  await assert.rejects(manual(), /not_authorized/);
  await asUser(owner);
  const result = (await manual()).rows[0].ids;
  assert.equal(result.length,2); assert.equal(await stock(id),0);
  assert.deepEqual((await manual()).rows[0].ids,result);
  await assert.rejects(db.query('SELECT create_manual_reservations($1,$2,1,$3::jsonb)',[randomUUID(),id,JSON.stringify(order)]),/out_of_stock/);
  const missingCustomer = await product(); await asUser(owner);
  await assert.rejects(db.query('SELECT create_manual_reservations($1,$2,1,$3::jsonb)',[randomUUID(),missingCustomer,JSON.stringify({...order,user_id:randomUUID()})]),/foreign key/);
  assert.equal(await stock(missingCustomer),10);
});
