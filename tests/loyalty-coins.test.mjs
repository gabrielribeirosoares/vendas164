import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const owner = randomUUID(),
  customer = randomUUID(),
  other = randomUUID(),
  store = randomUUID(),
  foreignStore = randomUUID(),
  product = randomUUID();
const migration = new URL(
  "../supabase/migrations/20261021231215_store_loyalty_coins.sql",
  import.meta.url,
);
async function asUser(id = owner) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("SET ROLE authenticated");
}
async function command(action, data = {}, sid = store) {
  return (
    await db.query("SELECT loyalty_command($1,$2,$3::jsonb) AS result", [
      sid,
      action,
      JSON.stringify(data),
    ])
  ).rows[0].result;
}
async function snapshot(sid = store) {
  return (await db.query("SELECT loyalty_data($1) AS result", [sid])).rows[0].result;
}
async function order(total, status = "sem_sinal", down = 0, user = customer) {
  await db.exec("RESET ROLE");
  const id = randomUUID();
  await db.query(
    "INSERT INTO orders(id,store_id,user_id,product_id,total_price,down_payment,payment_status) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id, store, user, product, total, down, status],
  );
  await asUser(owner);
  return id;
}
async function balance(user = customer) {
  await asUser(user);
  return (await snapshot()).accounts[0]?.balance || 0;
}
async function reset() {
  await db.exec("RESET ROLE");
  await db.exec(
    "TRUNCATE loyalty_ledger,loyalty_redemptions,loyalty_rewards,private.loyalty_order_credit,loyalty_accounts,loyalty_programs CASCADE; DELETE FROM orders;",
  );
  await asUser(owner);
}
async function activate() {
  await asUser(owner);
  await command("configure", { enabled: true });
}
async function reward(coins = 1, stock = 2, extras = {}) {
  await asUser(owner);
  return (await command("reward", { name: "Mini GT", coins, stock, ...extras })).id;
}
async function redeem(id, coins = 1, req = randomUUID()) {
  await asUser(customer);
  return command("redeem", { reward_id: id, expected_coins: coins, request_id: req });
}
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA private;
 CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
 INSERT INTO auth.users VALUES('${owner}'),('${customer}'),('${other}');`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260725203415_7a543904-d061-4fd1-bb06-d1b13ce19cde.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260831121000_create_order_installments.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON order_installments TO authenticated");
  await db.query(
    "INSERT INTO stores(id,owner_id,name,slug) VALUES($1,$2,'Loja teste','coins'),($3,$4,'Outra loja','other')",
    [store, owner, foreignStore, other],
  );
  await db.query(
    "INSERT INTO products(id,store_id,brand,model,price,stock) VALUES($1,$2,'Mini GT','Teste',100,100)",
    [product, store],
  );
  await db.query("INSERT INTO customer_store_link(user_id,store_id) VALUES($1,$2)", [
    customer,
    store,
  ]);
  await db.exec(await readFile(migration, "utf8"));
});
after(() => db.close());
test("activation excludes old receipts and enrolls customers, new partial receipts accumulate across orders", async () => {
  await reset();
  const old = await order(120, "sinal_pago", 20);
  await activate();
  assert.equal(await balance(), 0);
  await asUser(owner);
  await db.query("UPDATE orders SET down_payment=45 WHERE id=$1", [old]);
  assert.equal(await balance(), 0);
  await order(45, "sinal_pago", 30);
  assert.equal(await balance(), 1);
  const data = await snapshot();
  assert.equal(data.accounts[0].remainder_cents, 500);
  await asUser(owner);
  await db.query("UPDATE orders SET down_payment=45 WHERE id=$1", [old]);
  assert.equal(await balance(), 1);
  assert.equal((await snapshot()).ledger.length, 2);
});
test("installments, manual settlement and payment reversals reconcile final state without double credits", async () => {
  await reset();
  await activate();
  const id = await order(120, "sinal_pago", 20);
  await asUser(owner);
  const paid = randomUUID();
  await db.query(
    "INSERT INTO order_installments(id,order_id,installment_number,amount,due_date,status) VALUES($1,$2,1,100,now(),'paid')",
    [paid, id],
  );
  assert.equal(await balance(), 2);
  await asUser(owner);
  await db.query("UPDATE orders SET payment_status='quitado' WHERE id=$1", [id]);
  assert.equal(await balance(), 2);
  await asUser(owner);
  await db.exec("BEGIN");
  await db.query("DELETE FROM order_installments WHERE id=$1", [paid]);
  await db.query("UPDATE orders SET payment_status='sinal_pago' WHERE id=$1", [id]);
  await db.exec("COMMIT");
  assert.equal(await balance(), 0);
  await asUser(owner);
  await db.query("UPDATE orders SET payment_status='quitado' WHERE id=$1", [id]);
  assert.equal(await balance(), 2);
  await asUser(owner);
  await db.query("UPDATE orders SET delivery_status='cancelado' WHERE id=$1", [id]);
  assert.equal(await balance(), 0);
});
test("deleting a credited order reverses points and ledger keeps original order reference", async () => {
  await reset();
  await activate();
  const id = await order(100, "quitado");
  assert.equal(await balance(), 2);
  await asUser(owner);
  await db.query("DELETE FROM orders WHERE id=$1", [id]);
  assert.equal(await balance(), 0);
  assert.equal((await snapshot()).ledger[0].order_id, id);
});
test("pause preserves earned coins, ignores receipts during pause and still reverses refunded payments", async () => {
  await reset();
  await activate();
  const id = await order(200, "sinal_pago", 50);
  await asUser(owner);
  await command("configure", { enabled: false });
  await db.query("UPDATE orders SET down_payment=150 WHERE id=$1", [id]);
  assert.equal(await balance(), 1);
  await asUser(owner);
  await command("configure", { enabled: true });
  await db.query("UPDATE orders SET down_payment=200 WHERE id=$1", [id]);
  assert.equal(await balance(), 2);
  await asUser(owner);
  await command("configure", { enabled: false });
  await db.query("UPDATE orders SET payment_status='cancelado' WHERE id=$1", [id]);
  assert.equal(await balance(), 0);
});
test("redemption atomically spends points and stock, retry is idempotent, refusal returns both only once", async () => {
  await reset();
  await activate();
  await order(150, "quitado");
  const rid = await reward(2, 1);
  const req = randomUUID();
  const redemption = await redeem(rid, 2, req);
  assert.deepEqual(await redeem(rid, 2, req), redemption);
  assert.equal(await balance(), 1);
  await assert.rejects(redeem(rid, 2), /loyalty_reward_unavailable/);
  await asUser(owner);
  await command("redemption_status", { id: redemption.id, status: "rejected" });
  await command("redemption_status", { id: redemption.id, status: "rejected" });
  assert.equal(await balance(), 3);
  await asUser(owner);
  assert.equal((await snapshot()).rewards[0].stock, 1);
});
test("unavailable balance, changed cost, paused program and per-client limits prevent redemption", async () => {
  await reset();
  await activate();
  await order(50, "quitado");
  const rid = await reward(2, 5, { per_customer_limit: 1 });
  await assert.rejects(redeem(rid, 2), /loyalty_insufficient_balance/);
  await order(100, "quitado");
  await assert.rejects(redeem(rid, 1), /loyalty_reward_changed/);
  await redeem(rid, 2);
  await order(100, "quitado");
  await assert.rejects(redeem(rid, 2), /loyalty_reward_limit/);
  await asUser(owner);
  await command("configure", { enabled: false });
  await assert.rejects(redeem(rid, 2), /loyalty_paused/);
});
test("refund after redeemed coins displays zero balance and deficit without minting free coins", async () => {
  await reset();
  await activate();
  const id = await order(100, "quitado");
  const rid = await reward(2, 2);
  await redeem(rid, 2);
  await asUser(owner);
  await db.query("UPDATE orders SET payment_status='cancelado' WHERE id=$1", [id]);
  await asUser(customer);
  let data = await snapshot();
  assert.equal(data.accounts[0].balance, 0);
  assert.equal(data.accounts[0].deficit, 2);
  await order(50, "quitado");
  await asUser(customer);
  data = await snapshot();
  assert.equal(data.accounts[0].balance, 0);
  assert.equal(data.accounts[0].deficit, 1);
});
test("manual adjustment requires owner, reason and enough balance; request retries do not duplicate", async () => {
  await reset();
  await activate();
  const req = randomUUID();
  await command("adjust", {
    user_id: customer,
    coins: 5,
    reason: "Crédito de lançamento",
    request_id: req,
  });
  await command("adjust", {
    user_id: customer,
    coins: 5,
    reason: "Crédito de lançamento",
    request_id: req,
  });
  assert.equal(await balance(), 5);
  await asUser(owner);
  await assert.rejects(
    command("adjust", {
      user_id: customer,
      coins: -6,
      reason: "Correção",
      request_id: randomUUID(),
    }),
    /loyalty_insufficient_balance/,
  );
  await assert.rejects(
    command("adjust", { user_id: customer, coins: 1, reason: "", request_id: randomUUID() }),
    /loyalty_invalid_adjustment/,
  );
  await asUser(customer);
  await assert.rejects(
    command("adjust", {
      user_id: customer,
      coins: 100,
      reason: "Fraude",
      request_id: randomUUID(),
    }),
    /loyalty_forbidden/,
  );
});
test("RLS isolates customers and stores, client writes and anonymous RPC calls are denied", async () => {
  await reset();
  await activate();
  await order(100, "quitado");
  await order(50, "quitado", 0, other);
  await asUser(customer);
  const data = await snapshot();
  assert.equal(data.accounts.length, 1);
  assert.equal(data.accounts[0].user_id, customer);
  assert.ok(data.ledger.every((e) => e.user_id === customer));
  await assert.rejects(
    db.query("UPDATE loyalty_accounts SET adjustment=999 WHERE store_id=$1", [store]),
    /permission denied/,
  );
  await asUser(other);
  await assert.rejects(
    command("reward", { name: "Hacked", coins: 1, stock: 1 }),
    /loyalty_forbidden/,
  );
  await asUser(owner);
  assert.equal((await snapshot(foreignStore)).accounts.length, 0);
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(db.query("SELECT loyalty_data($1)", [store]), /permission denied/);
});

test('cent values accumulate exactly and customer balance stays visible on later history pages', async () => {
  await reset(); await activate(); await order(49.99, 'quitado');
  assert.equal(await balance(), 0); await order(0.01, 'quitado');
  assert.equal(await balance(), 1);
  const later = (await db.query('SELECT loyalty_data($1,NULL,100) AS result', [store])).rows[0].result;
  assert.equal(later.accounts[0].balance, 1); assert.equal(later.ledger.length, 0);
});
test('reward edits reject stale stock and redemption preserves the agreed reward and cost', async () => {
  await reset(); await activate(); await order(250, 'quitado');
  const rid=await reward(2,3); const d=await redeem(rid,2);
  await asUser(owner);
  await assert.rejects(command('reward',{id:rid,name:'Alterada',coins:4,stock:3,expected_stock:3}), /loyalty_stock_changed/);
  await command('reward',{id:rid,name:'Alterada',coins:4,stock:2,expected_stock:2});
  assert.equal((await snapshot()).redemptions[0].coins,2);
  assert.equal((await snapshot()).redemptions[0].reward_name,'Mini GT');
  await command('redemption_status',{id:d.id,status:'approved'});
  await command('redemption_status',{id:d.id,status:'shipped'});
  await assert.rejects(command('redemption_status',{id:d.id,status:'rejected'}),/loyalty_invalid_status/);
  await command('redemption_status',{id:d.id,status:'delivered'});
  assert.equal(await balance(),3);
});
