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
  await asUser(owner);
  await command("configure", { enabled: true });
  await order(75, "quitado");
  assert.equal(await balance(), 1);
  await db.exec("RESET ROLE");
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261022132404_configurable_loyalty_earning_rules.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261022163012_loyalty_redemption_visibility.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261028174038_public_loyalty_program_availability.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await asUser(customer);
  assert.equal(await balance(), 1);
  assert.equal((await snapshot()).accounts[0].remainder_cents, 2500);
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

test("cent values accumulate exactly and customer balance stays visible on later history pages", async () => {
  await reset();
  await activate();
  await order(49.99, "quitado");
  assert.equal(await balance(), 0);
  await order(0.01, "quitado");
  assert.equal(await balance(), 1);
  const later = (await db.query("SELECT loyalty_data($1,NULL,100) AS result", [store])).rows[0]
    .result;
  assert.equal(later.accounts[0].balance, 1);
  assert.equal(later.ledger.length, 0);
});
test("reward edits reject stale stock and redemption preserves the agreed reward and cost", async () => {
  await reset();
  await activate();
  await order(250, "quitado");
  const rid = await reward(2, 3);
  const d = await redeem(rid, 2);
  await asUser(owner);
  await assert.rejects(
    command("reward", { id: rid, name: "Alterada", coins: 4, stock: 3, expected_stock: 3 }),
    /loyalty_stock_changed/,
  );
  await command("reward", { id: rid, name: "Alterada", coins: 4, stock: 2, expected_stock: 2 });
  assert.equal((await snapshot()).redemptions[0].coins, 2);
  assert.equal((await snapshot()).redemptions[0].reward_name, "Mini GT");
  await command("redemption_status", { id: d.id, status: "approved" });
  await command("redemption_status", { id: d.id, status: "shipped" });
  await assert.rejects(
    command("redemption_status", { id: d.id, status: "rejected" }),
    /loyalty_invalid_status/,
  );
  await command("redemption_status", { id: d.id, status: "delivered" });
  assert.equal(await balance(), 3);
});

test("store can set reward quantity and paid threshold; fractional amounts accumulate exactly", async () => {
  await reset();
  await asUser(owner);
  await command("configure", { enabled: true, spend_cents: 10000, coins_per_step: 3 });
  assert.equal((await snapshot()).configurable_rules, true);
  await order(99.99, "quitado");
  assert.equal(await balance(), 0);
  assert.equal((await snapshot()).accounts[0].remainder_cents, 9999);
  await order(0.01, "quitado");
  assert.equal(await balance(), 3);
  await order(200, "quitado");
  assert.equal(await balance(), 9);
  await asUser(owner);
  const rid = await reward(8, 1);
  await redeem(rid, 8);
  assert.equal(await balance(), 1);
});
test("rule changes preserve earned coins and finish prior progress before starting the new rule", async () => {
  await reset();
  await activate();
  await order(75, "quitado");
  assert.equal(await balance(), 1);
  await asUser(owner);
  await command("configure", { spend_cents: 10000, coins_per_step: 3 });
  assert.equal(await balance(), 1);
  let a = (await snapshot()).accounts[0];
  assert.equal(a.previous_rule, true);
  assert.equal(a.next_spend_cents, 5000);
  assert.equal(a.remainder_cents, 2500);
  await order(30, "quitado");
  assert.equal(await balance(), 2);
  a = (await snapshot()).accounts[0];
  assert.equal(a.previous_rule, false);
  assert.equal(a.remainder_cents, 500);
  assert.equal(a.next_coins, 3);
  await order(95, "quitado");
  assert.equal(await balance(), 5);
});
test("refunds across changed rules reverse original allocations and leave unrelated credits intact", async () => {
  await reset();
  await activate();
  const old = await order(75, "quitado");
  await asUser(owner);
  await command("configure", { spend_cents: 10000, coins_per_step: 3 });
  const newer = await order(125, "quitado");
  assert.equal(await balance(), 5);
  await asUser(owner);
  await db.query("UPDATE orders SET payment_status='cancelado' WHERE id=$1", [newer]);
  assert.equal(await balance(), 1);
  assert.equal((await snapshot()).accounts[0].remainder_cents, 2500);
  await order(25, "quitado");
  assert.equal(await balance(), 2);
  await asUser(owner);
  await db.query("UPDATE orders SET payment_status='cancelado' WHERE id=$1", [old]);
  assert.equal(await balance(), 0);
  await db.exec("RESET ROLE");
  const totals = (
    await db.query(
      `SELECT a.earned_coins, (SELECT coalesce(sum((ra.eligible_cents/r.spend_cents)*r.coins_per_step),0)::bigint FROM private.loyalty_rule_accounts ra JOIN private.loyalty_earning_rules r ON r.id=ra.rule_id WHERE ra.user_id=a.user_id AND ra.store_id=a.store_id) AS expected FROM loyalty_accounts a WHERE store_id=$1 AND user_id=$2`,
      [store, customer],
    )
  ).rows[0];
  assert.equal(totals.earned_coins, totals.expected);
});
test("rule edits require owner, positive integral values, and a fresh rule version", async () => {
  await reset();
  await activate();
  const previous = (await snapshot()).program.rule_id;
  for (const payload of [
    { spend_cents: 0 },
    { spend_cents: -1 },
    { spend_cents: 1.5 },
    { coins_per_step: 0 },
    { coins_per_step: 1.5 },
    { spend_cents: null },
    { coins_per_step: null },
    { spend_cents: 100000001 },
    { coins_per_step: 1000001 },
  ])
    await assert.rejects(command("configure", payload), /loyalty_invalid_rule/);
  await command("configure", { spend_cents: 2500, coins_per_step: 2, expected_rule_id: previous });
  await assert.rejects(
    command("configure", { spend_cents: 10000, coins_per_step: 1, expected_rule_id: previous }),
    /loyalty_rule_changed/,
  );
  await asUser(customer);
  await assert.rejects(command("configure", { coins_per_step: 999 }), /loyalty_forbidden/);
  await assert.rejects(
    db.query("SELECT private.loyalty_progress($1,$2)", [store, other]),
    /loyalty_forbidden/,
  );
  await assert.rejects(
    db.query("SELECT * FROM private.loyalty_earning_rules"),
    /permission denied/,
  );
});
test("pause and resume keep configured rate; same configuration does not mint points", async () => {
  await reset();
  await asUser(owner);
  await command("configure", { enabled: true, spend_cents: 2000, coins_per_step: 5 });
  const id = await order(40, "quitado");
  assert.equal(await balance(), 10);
  await asUser(owner);
  const before = (await snapshot()).program.rule_id;
  await command("configure", { enabled: false });
  await command("configure", { enabled: true });
  await command("configure", { spend_cents: 2000, coins_per_step: 5 });
  assert.equal((await snapshot()).program.rule_id, before);
  assert.equal(await balance(), 10);
  await asUser(owner);
  await db.query("UPDATE orders SET payment_status='cancelado' WHERE id=$1", [id]);
  assert.equal(await balance(), 0);
});
test("each store keeps its own rule and clients cannot edit another store", async () => {
  await reset();
  await activate();
  await order(100, "quitado");
  await asUser(other);
  await command("configure", { enabled: true, spend_cents: 1000, coins_per_step: 4 }, foreignStore);
  await assert.rejects(command("configure", { spend_cents: 1 }, store), /loyalty_forbidden/);
  await asUser(owner);
  const p = (await snapshot()).program;
  assert.equal(p.spend_cents, 5000);
  assert.equal(p.coins_per_step, 1);
  assert.equal(await balance(), 2);
});

test("redemption counts survive pagination, ignore rejected requests and isolate customers and stores", async () => {
  await reset();
  await activate();
  await order(150, "quitado");
  const rid = await reward(1, 5, { per_customer_limit: 2 });
  const first = await redeem(rid);
  await redeem(rid);
  let view = (await db.query("SELECT loyalty_data($1,$2,100) AS result", [store, other])).rows[0]
    .result;
  assert.equal(view.redemptions.length, 0);
  assert.equal(view.rewards[0].redeemed_count, 2);
  assert.equal(view.pending_redemptions, 2);
  await assert.rejects(() => redeem(rid), /loyalty_reward_limit/);
  await asUser(other);
  view = await snapshot();
  assert.equal(view.rewards[0].redeemed_count, 0);
  assert.equal(view.pending_redemptions, 0);
  assert.equal((await snapshot(foreignStore)).pending_redemptions, 0);
  await asUser(owner);
  assert.equal((await snapshot()).pending_redemptions, 2);
  await command("redemption_status", { id: first.id, status: "rejected" });
  await asUser(customer);
  assert.equal((await snapshot()).rewards[0].redeemed_count, 1);
  await redeem(rid);
  await asUser(owner);
  view = await snapshot();
  const pending = view.redemptions.find((r) => r.status === "pending");
  await command("redemption_status", { id: pending.id, status: "approved" });
  assert.equal((await snapshot()).pending_redemptions, 1);
  await asUser(customer);
  assert.equal((await snapshot()).rewards[0].redeemed_count, 2);
});

test("guests see only active program availability and cannot read private loyalty data", async () => {
  await reset();
  await activate();
  await db.exec("RESET ROLE; SET ROLE anon");
  assert.equal((await db.query("SELECT store_id,enabled FROM loyalty_programs")).rows.length, 1);
  await assert.rejects(() => db.query("SELECT * FROM loyalty_programs"), /permission denied/);
  await assert.rejects(() => db.query("SELECT * FROM loyalty_accounts"), /permission denied/);
  await assert.rejects(() => db.query("SELECT * FROM loyalty_redemptions"), /permission denied/);
  await asUser(owner);
  await command("configure", { enabled: false });
  await db.exec("RESET ROLE; SET ROLE anon");
  assert.equal((await db.query("SELECT store_id,enabled FROM loyalty_programs")).rows.length, 0);
});

test("customer cannot mint Coins through direct writes, privileged commands or forged redemption status", async () => {
  await reset();
  await activate();
  await order(100, "quitado");
  const rid = await reward(1, 3);
  const redemption = await redeem(rid);
  const original = await snapshot();
  const tables = [
    ["public.loyalty_accounts", "store_id"],
    ["public.loyalty_ledger", "store_id"],
    ["public.loyalty_programs", "store_id"],
    ["public.loyalty_rewards", "store_id"],
    ["public.loyalty_redemptions", "store_id"],
    ["private.loyalty_earning_rules", "store_id"],
    ["private.loyalty_rule_accounts", "store_id"],
    ["private.loyalty_order_credit", "store_id"],
    ["private.loyalty_order_rule_credit", "rule_id"],
  ];
  for (const [table, column] of tables) {
    for (const sql of [
      `INSERT INTO ${table} (${column}) VALUES ($1)`,
      `UPDATE ${table} SET ${column}=$1`,
      `DELETE FROM ${table} WHERE ${column}=$1`,
    ]) {
      await assert.rejects(db.query(sql, [store]), /permission denied/, sql);
    }
  }
  for (const [action, payload] of [
    ["adjust", { user_id: customer, coins: 999999, reason: "forged", request_id: randomUUID() }],
    ["configure", { enabled: true, spend_cents: 1, coins_per_step: 999999 }],
    ["reward", { id: rid, name: "forged", coins: 0, stock: 999999 }],
    ["redemption_status", { id: redemption.id, status: "rejected" }],
  ]) {
    await assert.rejects(command(action, payload), /loyalty_forbidden/, action);
    await assert.rejects(
      db.query("SELECT private.loyalty_command($1,$2,$3::jsonb)", [
        store,
        action,
        JSON.stringify(payload),
      ]),
      /loyalty_forbidden/,
      `private ${action}`,
    );
  }
  await assert.rejects(
    db.query("SELECT private.loyalty_apply_rule_credit($1,$2,$3,$4,$5)", [
      store,
      customer,
      randomUUID(),
      randomUUID(),
      999999,
    ]),
    /permission denied/,
  );
  await assert.rejects(redeem(rid, -100), /loyalty_reward_changed/);
  const final = await snapshot();
  assert.equal(final.accounts[0].balance, original.accounts[0].balance);
  assert.equal(final.ledger.length, original.ledger.length);
  assert.equal(final.redemptions.length, original.redemptions.length);
  assert.equal(final.rewards[0].stock, original.rewards[0].stock);
});

test("two queued redemption requests cannot spend the same balance twice", async () => {
  await reset();
  await activate();
  await order(50, "quitado");
  const first = await reward(1, 2);
  const second = await reward(1, 2);
  await asUser(customer);
  // PGlite serializes queries: this checks back-to-back requests, not multi-session lock contention.
  const results = await Promise.allSettled([first, second].map(reward_id =>
    command("redeem", { reward_id, expected_coins: 1, request_id: randomUUID() })));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rejected = results.find(r => r.status === "rejected");
  assert.match(rejected.reason.message, /loyalty_insufficient_balance/);
  const view = await snapshot();
  assert.equal(view.accounts[0].balance, 0);
  assert.equal(view.redemptions.length, 1);
  assert.equal(view.rewards.reduce((sum, r) => sum + r.stock, 0), 3);
});
