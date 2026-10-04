import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const source = await readFile(new URL('../src/lib/signalReminder.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { isSignalDueSoon, isAllowedPushEndpoint } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const now = Date.parse('2026-10-04T12:00:00Z');
const order = (hours, extra={}) => ({ payment_status:'aguardando_sinal',delivery_status:'pendente',reservation_expires_at:new Date(now+hours*3600000).toISOString(),...extra });
test('lembrete inclui 24h e prazos curtos, exclui vencidos e prazos maiores', () => {
  for (const hours of [0.01,1,24]) assert.equal(isSignalDueSoon(order(hours),now),true);
  for (const hours of [-1,0,24.01]) assert.equal(isSignalDueSoon(order(hours),now),false);
});
test('pago, cancelado ou data inválida não recebe aviso', () => {
  for (const extra of [{payment_status:'sinal_pago'},{payment_status:'quitado'},{payment_status:'cancelado'},{delivery_status:'cancelado'},{reservation_expires_at:null},{reservation_expires_at:'invalid'}]) assert.equal(isSignalDueSoon(order(1,extra),now),false);
});
test('endpoints push recusam destino interno, HTTP e domínio semelhante', () => {
  assert.equal(isAllowedPushEndpoint('https://web.push.apple.com/test'),true);
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/test'),true);
  for (const endpoint of ['http://fcm.googleapis.com/test','https://127.0.0.1/','https://fcm.googleapis.com.evil.com/test','https://user@web.push.apple.com/test','https://web.push.apple.com:444/test']) assert.equal(isAllowedPushEndpoint(endpoint),false);
});
const db = new PGlite();
const ids = {user:'10000000-0000-4000-8000-000000000001',other:'10000000-0000-4000-8000-000000000002',store:'20000000-0000-4000-8000-000000000001',product:'30000000-0000-4000-8000-000000000001',order:'40000000-0000-4000-8000-000000000001',sub:'50000000-0000-4000-8000-000000000001'};
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE stores(id uuid PRIMARY KEY,name text); CREATE TABLE products(id uuid PRIMARY KEY,model text);
    CREATE TABLE orders(id uuid PRIMARY KEY,user_id uuid,store_id uuid,product_id uuid,total_price numeric,signal_amount numeric,down_payment numeric,payment_status text,delivery_status text,reservation_expires_at timestamptz);
    CREATE TABLE push_subscriptions(id uuid PRIMARY KEY,user_id uuid,endpoint text,p256dh text,auth text);
    INSERT INTO stores VALUES('${ids.store}','Loja'); INSERT INTO products VALUES('${ids.product}','Mini GT');
    INSERT INTO orders VALUES('${ids.order}','${ids.user}','${ids.store}','${ids.product}',100,1,0,'aguardando_sinal','pendente',now()+interval '2 hours');
    INSERT INTO push_subscriptions VALUES('${ids.sub}','${ids.user}','https://web.push.apple.com/test','key','auth');
    INSERT INTO push_subscriptions VALUES('50000000-0000-4000-8000-000000000002','${ids.other}','https://web.push.apple.com/other','key','auth');`);
  const sql = await readFile(new URL('../supabase/migrations/20261004015928_signal_expiry_reminders.sql',import.meta.url),'utf8');
  await db.exec(sql);
  await db.exec('GRANT SELECT ON orders, products, stores, push_subscriptions TO service_role');
});
after(() => db.close());
const claim = async () => (await db.query('select claim_signal_reminders(20) as items')).rows[0].items;
test('claim é por dispositivo do cliente, usa sinal de R$1 e não duplica',async () => {
  const items=await claim(); assert.equal(items.length,1); assert.equal(items[0].user_id,ids.user); assert.equal(Number(items[0].amount),1);
  assert.deepEqual(await claim(),[]);
});
test('lease abandonada é recuperável, claim muda e sucesso não repete',async () => {
  await db.exec("update signal_reminder_deliveries set updated_at=now()-interval '11 minutes'");
  const items=await claim(); assert.equal(items.length,1);
  await db.exec("update signal_reminder_deliveries set status='sent'");
  assert.deepEqual(await claim(),[]);
});
test('prazo alterado permite novo aviso, falha tem no máximo três tentativas',async () => {
  await db.exec("update orders set reservation_expires_at=now()+interval '3 hours'");
  assert.equal((await claim()).length,1);
  await db.exec("update signal_reminder_deliveries set status='failed' where status='sending'");
  assert.equal((await claim()).length,1);
  await db.exec("update signal_reminder_deliveries set status='failed' where status='sending'");
  assert.equal((await claim()).length,1);
  await db.exec("update signal_reminder_deliveries set status='failed' where status='sending'");
  assert.deepEqual(await claim(),[]);
});
test('banco exclui sinal pago, cancelamento e prazo vencido',async () => {
  for(const update of ["payment_status='sinal_pago'","payment_status='aguardando_sinal',delivery_status='cancelado'","delivery_status='pendente',reservation_expires_at=now()-interval '1 minute'"]){
    await db.exec("delete from signal_reminder_deliveries; update orders set "+update);
    assert.deepEqual(await claim(),[]);
  }
});
test('anon e authenticated não podem ler entregas nem executar claims',async () => {
  for(const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(claim(),/permission denied/);
    await assert.rejects(db.query('select * from signal_reminder_deliveries'),/permission denied/);
    await db.exec('reset role');
  }
});

test('service_role usa as permissões explícitas e valor inválido é rejeitado', async () => {
  await db.exec("update orders set payment_status='aguardando_sinal', delivery_status='pendente', reservation_expires_at=now()+interval '2 hours'; delete from signal_reminder_deliveries; set role service_role");
  assert.equal((await claim()).length,1);
  await assert.rejects(db.query('select claim_signal_reminders(null)'),/invalid_reminder_limit/);
  await db.exec('reset role');
});
