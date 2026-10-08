import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const customer = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const owner = '10000000-0000-4000-8000-000000000003';
const guest = '10000000-0000-4000-8000-000000000004';
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
    CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY, phone TEXT, phone_confirmed_at TIMESTAMPTZ);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    INSERT INTO auth.users(id,phone,phone_confirmed_at) VALUES
      ('${customer}','48999999999',now()),('${other}','48988888888',null),('${owner}',null,null),('${guest}',null,null);`);
  // Start with the repository's original schema, then the financial columns.
  await db.exec(await readFile(new URL('../supabase/migrations/20260725203415_7a543904-d061-4fd1-bb06-d1b13ce19cde.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260729184600_add_installment_columns_to_products.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260731142025_add_bulk_discount_to_products.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260808150000_add_initial_stock_to_products.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260831121000_create_order_installments.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260831123600_fix_insert_order_installments.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260726124100_fix_profiles_rls_for_store_owners.sql', import.meta.url), 'utf8'));
  await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON order_installments TO authenticated, anon;');
  await db.query('INSERT INTO stores(id,owner_id,name,slug) VALUES($1,$2,$3,$4)', [store,owner,'Loja','loja']);
  await db.exec(await readFile(new URL('../supabase/migrations/20260905190000_secure_checkout.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260905191000_bling_server_credentials.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260726131700_add_pix_key_to_stores_and_orders.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260905192000_catalog_pagination.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260905193000_atomic_manual_reservations.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260907143000_harden_platform_authorization.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260920145545_keep_presale_open_and_cleanup_customer_waitlist.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260831122700_add_installment_due_day.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260922183409_atomic_order_financial_management.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260923004537_seller_server_pagination.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260924165900_atomic_global_payment.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261008173147_product_color_variants.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261008203000_product_variant_options.sql', import.meta.url), 'utf8'));
});
after(() => db.close());
async function coloredProduct(redStock = 1, blueStock = 2) {
  const id = await product();
  const red = randomUUID(), blue = randomUUID();
  await db.exec('RESET ROLE');
  await db.query('UPDATE products SET color_variants=$1::jsonb WHERE id=$2', [JSON.stringify([
    {id:red,name:'Vermelho',stock:redStock,image_url:'https://example.com/red.webp'},
    {id:blue,name:'Azul',stock:blueStock,image_url:'https://example.com/blue.webp'}
  ]),id]);
  await asUser();
  return {id,red,blue};
}
async function variants(id) {
  return (await db.query('SELECT color_variants FROM products WHERE id=$1',[id])).rows[0].color_variants;
}
test('color choice is mandatory, belongs to the product and has independent stock',async()=>{
  const {id,red,blue}=await coloredProduct();
  await assert.rejects(checkout([item(id)]), /variant_required/);
  await assert.rejects(checkout([item(id,{variant_id:randomUUID()})]), /variant_not_found/);
  const request=randomUUID(), payload=[item(id,{variant_id:red})];
  const orders=await checkout(payload,request);
  assert.deepEqual(await checkout(payload,request),orders);
  assert.equal(await stock(id),2);
  assert.equal((await variants(id)).find(v=>v.id===blue).stock,2);
  await assert.rejects(checkout([item(id,{variant_id:red})]), /variant_out_of_stock/);
  assert.equal(await stock(id),2);
  const order=(await db.query('SELECT variant_id,variant_name,variant_image_url FROM orders WHERE id=$1',[orders[0]])).rows[0];
  assert.equal(order.variant_id,red); assert.equal(order.variant_name,'Vermelho'); assert.equal(order.variant_image_url,'https://example.com/red.webp');
});
test('two colors of the same product are distinct checkout lines and seller groups',async()=>{
  const {id,red,blue}=await coloredProduct();
  const ids=await checkout([item(id,{variant_id:red}),item(id,{variant_id:blue})]);
  assert.equal(ids.length,2); assert.equal(await stock(id),1);
  await asUser(owner);
  const page=(await db.query('SELECT seller_orders_page($1) AS result',[store])).rows[0].result;
  const groups=page.groups.filter(g=>g.order.product_id===id);
  assert.equal(groups.length,2); assert.deepEqual(groups.map(g=>g.quantity),[1,1]);
});
test('one unavailable color rolls back stock, orders, installments and other colors',async()=>{
  const {id,red,blue}=await coloredProduct(0,2);
  await assert.rejects(checkout([item(id,{variant_id:blue}),item(id,{variant_id:red})]), /variant_out_of_stock/);
  assert.equal(await stock(id),2);
  assert.equal((await variants(id)).find(v=>v.id===blue).stock,2);
  assert.equal((await db.query('SELECT id FROM orders WHERE product_id=$1',[id])).rows.length,0);
});
test('cancellation restores the exact color once; reactivation and deletion remain atomic',async()=>{
  const {id,red}=await coloredProduct(); const [order]=await checkout([item(id,{variant_id:red})]);
  await asUser(owner);
  await db.query("UPDATE orders SET payment_status='cancelado' WHERE id=$1",[order]);
  assert.equal((await variants(id)).find(v=>v.id===red).stock,1);
  await db.query("UPDATE orders SET delivery_status='cancelado' WHERE id=$1",[order]);
  assert.equal((await variants(id)).find(v=>v.id===red).stock,1);
  await db.query("UPDATE orders SET payment_status='aguardando_sinal',delivery_status='pendente' WHERE id=$1",[order]);
  assert.equal((await variants(id)).find(v=>v.id===red).stock,0);
  await db.query('DELETE FROM orders WHERE id=$1',[order]);
  assert.equal((await variants(id)).find(v=>v.id===red).stock,1);
});
test('seller manual reservation records and consumes the selected color, with idempotency',async()=>{
  const {id,blue}=await coloredProduct(); await asUser(owner);
  const key=randomUUID(), payload={user_id:customer,total_price:100,down_payment:0,signal_amount:20,installment_count:1,payment_status:'aguardando_sinal',variant_id:blue};
  const manual=async()=>(await db.query('SELECT create_manual_reservations($1,$2,1,$3::jsonb) AS ids',[key,id,JSON.stringify(payload)])).rows[0].ids;
  const ids=await manual(); assert.deepEqual(await manual(),ids);
  assert.equal((await variants(id)).find(v=>v.id===blue).stock,1);
});
test('variant stock cannot be negative, IDs cannot duplicate, snapshots cannot be changed and used colors cannot be removed',async()=>{
  const {id,red}=await coloredProduct(); const [order]=await checkout([item(id,{variant_id:red})]);
  await asUser(owner);
  const colors=await variants(id);
  await assert.rejects(db.query('UPDATE products SET color_variants=$1::jsonb WHERE id=$2',[JSON.stringify([{...colors[0],stock:-1}]),id]), /invalid_variants/);
  await assert.rejects(db.query('UPDATE products SET color_variants=$1::jsonb WHERE id=$2',[JSON.stringify([colors[0],colors[0]]),id]), /duplicate_variant/);
  await assert.rejects(db.query('UPDATE products SET color_variants=$1::jsonb WHERE id=$2',[JSON.stringify(colors.filter(v=>v.id!==red)),id]), /variant_has_orders/);
  await assert.rejects(db.query("UPDATE orders SET variant_name='Azul' WHERE id=$1",[order]), /immutable_order_variant/);
});
test('expiration restores colored stock without assigning an unspecified color to the waitlist',async()=>{
  const {id,red}=await coloredProduct(); const [order]=await checkout([item(id,{variant_id:red})]);
  await db.exec('RESET ROLE');
  await db.query("UPDATE orders SET reservation_expires_at=now()-interval '1 hour' WHERE id=$1",[order]);
  await db.query('INSERT INTO waitlist(user_id,product_id,store_id) VALUES($1,$2,$3)',[other,id,store]);
  await db.query('SELECT expire_stale_orders()');
  assert.equal((await variants(id)).find(v=>v.id===red).stock,1);
  assert.equal((await db.query('SELECT id FROM orders WHERE product_id=$1 AND user_id=$2',[id,other])).rows.length,0);
});
test('ordinary products keep the original checkout and stock behavior after the migration',async()=>{
  const id=await product(); const request=randomUUID();
  const ids=await checkout([item(id)],request);
  assert.equal(ids.length,1); assert.equal(await stock(id),9);
  assert.deepEqual(await checkout([item(id)],request),ids);
  const order=(await db.query('SELECT variant_id,variant_name FROM orders WHERE id=$1',[ids[0]])).rows[0];
  assert.equal(order.variant_id,null); assert.equal(order.variant_name,null);
});
test('deleting a product with colored orders allows the existing cascade to complete',async()=>{
  const {id,red}=await coloredProduct(); await checkout([item(id,{variant_id:red})]);
  await asUser(owner);
  await db.query('DELETE FROM products WHERE id=$1',[id]);
  assert.equal((await db.query('SELECT id FROM orders WHERE product_id=$1',[id])).rows.length,0);
});

test('combinations use server prices, optional attributes and independent stock',async()=>{
  const id=await product({bulk_discount_threshold:2,bulk_discount_price:50});
  const first=randomUUID(),second=randomUUID();
  await db.exec('RESET ROLE');
  const options=[{id:first,name:'ignored',color:'Azul',size:'12 mm',brake:'Com freio',price:150.5,stock:2,image_url:null},{id:second,name:'ignored',color:'Azul',size:'14 mm',brake:'Sem freio',stock:1,image_url:null}];
  await db.query('UPDATE products SET color_variants=$1 WHERE id=$2',[JSON.stringify(options),id]);
  await asUser();
  await assert.rejects(checkout([item(id,{variant_id:first,expected_total:100})]),/price_changed/);
  const orders=await checkout([item(id,{variant_id:first,quantity:2,expected_total:301,expected_signal:60.2})]);
  const saved=(await db.query('SELECT total_price,signal_amount,variant_name FROM orders WHERE id=$1',[orders[0]])).rows[0];
  assert.equal(Number(saved.total_price),150.5);
  assert.equal(Number(saved.signal_amount),30.1);
  assert.equal(saved.variant_name,'Azul — 12 mm — Com freio');
  assert.equal((await variants(id)).find(v=>v.id===second).stock,1);
  await checkout([item(id,{variant_id:second})]);
  await db.exec('RESET ROLE');
  for(const price of [-1,1.001,'10']) {
    await assert.rejects(db.query('UPDATE products SET color_variants=$1 WHERE id=$2',[JSON.stringify([{...options[0],price}]),id]),/invalid_variants/);
  }
});
