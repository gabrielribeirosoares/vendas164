import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const source = await readFile(new URL('../src/lib/signalDelivery.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { reminderTestUser, signalEmailPayload } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const user='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const order='40000000-0000-4000-8000-000000000001';
test('envio desativado por padrão e preview exige conta explícita',()=>{
  assert.throws(()=>reminderTestUser({}),/reminders_disabled/);
  for(const target of [undefined,'', 'all', 'invalid']) assert.throws(()=>reminderTestUser({SIGNAL_REMINDERS_ENABLED:'true',VERCEL_ENV:'preview',SIGNAL_REMINDER_TEST_USER_ID:target}),/test_user_required/);
  assert.equal(reminderTestUser({SIGNAL_REMINDERS_ENABLED:'true',SIGNAL_REMINDER_TEST_USER_ID:user}),user);
  assert.equal(reminderTestUser({SIGNAL_REMINDERS_ENABLED:'true',VERCEL_ENV:'production'}),null);
});
test('mensagem discreta com link fixo e instrução de desativação; chave estável por prazo',()=>{
  const message=signalEmailPayload(order,'2026-10-10T12:00:00Z','gabriel@example.com');
  assert.deepEqual(message.to,['gabriel@example.com']);
  assert.match(message.text,/https:\/\/vendas164.com.br\/painel/);
  assert.match(message.text,/desativar/);
  assert.doesNotMatch(message.text,/gabriel|R\$|Mini GT/);
  assert.equal(message.key,signalEmailPayload(order,'2026-10-10T09:00:00-03:00','x@example.com').key);
  assert.notEqual(message.key,signalEmailPayload(order,'2026-10-10T13:00:00Z','x@example.com').key);
});
const db=new PGlite();
before(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 CREATE TABLE stores(id uuid PRIMARY KEY,name text); CREATE TABLE products(id uuid PRIMARY KEY,model text);
 CREATE TABLE orders(id uuid PRIMARY KEY,user_id uuid,store_id uuid,product_id uuid,total_price numeric,signal_amount numeric,down_payment numeric,payment_status text,delivery_status text,reservation_expires_at timestamptz);
 CREATE TABLE push_subscriptions(id uuid PRIMARY KEY,user_id uuid,endpoint text,p256dh text,auth text);
 INSERT INTO auth.users VALUES('${user}'),('${other}');
 INSERT INTO stores VALUES('20000000-0000-4000-8000-000000000001','Loja');
 INSERT INTO products VALUES('30000000-0000-4000-8000-000000000001','Mini GT');
 INSERT INTO orders VALUES('${order}','${user}','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',100,1,0,'aguardando_sinal','pendente',now()+interval '2 hours');
 INSERT INTO push_subscriptions VALUES('50000000-0000-4000-8000-000000000001','${user}','https://web.push.apple.com/test','key','auth');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261004015928_signal_expiry_reminders.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261009194010_signal_email_reminders.sql',import.meta.url),'utf8'));
 await db.exec('GRANT SELECT ON orders,products,stores,push_subscriptions TO service_role');
});
after(()=>db.close());
const claim=async(channel='email',target=null)=>(await db.query(`select ${channel==='email'?'claim_signal_email_reminders':'claim_signal_reminders'}(10,$1::uuid) as items`,[target])).rows[0].items;
async function reset(){
 await db.exec(`RESET ROLE; DELETE FROM signal_email_deliveries; DELETE FROM signal_reminder_deliveries; DELETE FROM signal_email_preferences;
 UPDATE orders SET payment_status='aguardando_sinal',delivery_status='pendente',reservation_expires_at=now()+interval '2 hours';`);
}
test('sem adesão não há e-mail; adesão escolhe e-mail e impede push',async()=>{
 await reset(); assert.deepEqual(await claim(),[]);
 await db.exec(`INSERT INTO signal_email_preferences(user_id,email,enabled) VALUES('${user}','gabriel@example.com',true)`);
 assert.deepEqual(await claim('push'),[]);
 const items=await claim(); assert.equal(items.length,1); assert.equal(items[0].email,'gabriel@example.com');
 assert.deepEqual(await claim(),[]);
});
test('alvo de preview limita os dois claims e service_role recebe permissões',async()=>{
 await reset(); await db.exec(`INSERT INTO signal_email_preferences(user_id,email,enabled) VALUES('${user}','gabriel@example.com',true); SET ROLE service_role`);
 assert.deepEqual(await claim('email',other),[]); assert.equal((await claim('email',user)).length,1);
 await db.exec(`RESET ROLE; DELETE FROM signal_email_preferences; DELETE FROM signal_email_deliveries; SET ROLE service_role`);
 assert.deepEqual(await claim('push',other),[]); assert.equal((await claim('push',user)).length,1);
 await db.exec('RESET ROLE');
});
test('e-mail enviado não permite push posterior; push enviado não permite e-mail',async()=>{
 await reset(); await claim('push'); await db.exec(`UPDATE signal_reminder_deliveries SET status='sent'; INSERT INTO signal_email_preferences(user_id,email,enabled) VALUES('${user}','gabriel@example.com',true)`);
 assert.deepEqual(await claim(),[]);
 await reset(); await db.exec(`INSERT INTO signal_email_preferences(user_id,email,enabled) VALUES('${user}','gabriel@example.com',true)`);
 await claim(); await db.exec("UPDATE signal_email_deliveries SET status='sent'; UPDATE signal_email_preferences SET enabled=false");
 assert.deepEqual(await claim('push'),[]);
});
test('opt-out, pago, cancelado, sem sinal e prazo vencido excluem e-mail',async()=>{
 for(const change of ["UPDATE signal_email_preferences SET enabled=false","UPDATE orders SET payment_status='sinal_pago'","UPDATE orders SET delivery_status='cancelado'","UPDATE orders SET signal_amount=0","UPDATE orders SET reservation_expires_at=now()-interval '1 minute'"]){
  await reset(); await db.exec(`UPDATE orders SET signal_amount=1; INSERT INTO signal_email_preferences(user_id,email,enabled) VALUES('${user}','gabriel@example.com',true); ${change}`);
  assert.deepEqual(await claim(),[]);
 }
});
test('lease recupera falha até três tentativas e novo prazo permite novo lembrete',async()=>{
 await reset(); await db.exec(`UPDATE orders SET signal_amount=1; INSERT INTO signal_email_preferences(user_id,email,enabled) VALUES('${user}','gabriel@example.com',true)`);
 const first=(await claim())[0];
 await db.exec("UPDATE signal_email_deliveries SET updated_at=now()-interval '11 minutes'");
 const second=(await claim())[0]; assert.notEqual(first.claim_id,second.claim_id);
 await db.exec("UPDATE signal_email_deliveries SET status='failed'"); assert.equal((await claim()).length,1);
 await db.exec("UPDATE signal_email_deliveries SET status='failed'"); assert.deepEqual(await claim(),[]);
 await db.exec("UPDATE orders SET reservation_expires_at=now()+interval '3 hours'"); assert.equal((await claim()).length,1);
});
test('troca de canal recupera lease abandonada, mas respeita envio em andamento',async()=>{
 await reset(); await db.exec('UPDATE orders SET signal_amount=1');
 await claim('push');
 await db.exec(`INSERT INTO signal_email_preferences(user_id,email,enabled) VALUES('${user}','gabriel@example.com',true)`);
 assert.deepEqual(await claim(),[]);
 await db.exec("UPDATE signal_reminder_deliveries SET updated_at=now()-interval '11 minutes'");
 assert.equal((await claim()).length,1);
});
test('RLS: conta só lê sua preferência; nenhum cliente grava destinatário ou lê entregas',async()=>{
 await reset(); await db.exec(`INSERT INTO signal_email_preferences(user_id,email,enabled) VALUES('${user}','gabriel@example.com',true),('${other}','other@example.com',true); SET test.user_id='${user}'; SET ROLE authenticated`);
 const rows=(await db.query('SELECT user_id FROM signal_email_preferences')).rows; assert.deepEqual(rows,[{user_id:user}]);
 await assert.rejects(db.exec("UPDATE signal_email_preferences SET email='evil@example.com'"),/permission denied/);
 await assert.rejects(db.query('SELECT * FROM signal_email_deliveries'),/permission denied/);
 await assert.rejects(claim(),/permission denied/);
 await db.exec('RESET ROLE; SET ROLE anon');
 await assert.rejects(db.query('SELECT * FROM signal_email_preferences'),/permission denied/);
 await assert.rejects(claim('push'),/permission denied/);
 await db.exec('RESET ROLE');
});

test('envio simulado revalida pagamento, consentimento e endereço confirmado sem rede real',async()=>{
 const savedEnv={...process.env}; const savedFetch=globalThis.fetch;
 const due=new Date(Date.now()+3600000).toISOString();
 const baseOrder={user_id:user,payment_status:'aguardando_sinal',delivery_status:'pendente',reservation_expires_at:due,signal_amount:1,down_payment:0,total_price:100};
 let scenario={}; let calls=[]; let writes=[]; let claims=[];
 globalThis.__signalEmailDb={
  rpc:async(name,args)=>{claims.push(args);return {data:[{order_id:order,user_id:user,expires_at:due,claim_id:'lease',email:'gabriel@example.com'}],error:null}},
  auth:{admin:{getUserById:async()=>({data:{user:{email:'gabriel@example.com',email_confirmed_at:due,...scenario.user}},error:null})}},
  from(table){
   let update;
   const query={
    select(){return this},eq(){return this},in(){return this},limit(){return this},update(value){update=value;return this},
    maybeSingle(){return this},
    then(resolve,reject){
     if(update){writes.push(update);return Promise.resolve({error:null}).then(resolve,reject)}
     const data=table==='orders'?{...baseOrder,...scenario.order}:table==='signal_email_preferences'?{email:'gabriel@example.com',enabled:true,...scenario.preference}:scenario.push||[];
     return Promise.resolve({data,error:null}).then(resolve,reject);
    }
   }; return query;
  }
 };
 const reminderSource=await readFile(new URL('../src/lib/signalReminder.ts',import.meta.url),'utf8');
 let server=await readFile(new URL('../src/lib/signalEmailReminders.server.ts',import.meta.url),'utf8');
 server=server.replace(/^import .*;\n/gm,'').replace('const db = supabaseAdmin as unknown as SupabaseClient;','const db = globalThis.__signalEmailDb;');
 const code=ts.transpileModule(source+'\n'+reminderSource+'\n'+server,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
 const {sendSignalEmailReminders}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
 try{
  Object.assign(process.env,{SIGNAL_REMINDERS_ENABLED:'true',SIGNAL_EMAIL_REMINDERS_ENABLED:'true',SIGNAL_EMAIL_PREFERENCES_ENABLED:'true',VERCEL_ENV:'preview',SIGNAL_REMINDER_TEST_USER_ID:user,RESEND_API_KEY:'test-not-real',SIGNAL_REMINDER_EMAIL_FROM:'test@example.com'});
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'fake-provider-id'}),{status:200})};
  assert.equal((await sendSignalEmailReminders()).sent,1);
  assert.equal(claims[0]._user_id,user);
  assert.equal(calls[0].url,'https://api.resend.com/emails');
  assert.deepEqual(JSON.parse(calls[0].options.body).to,['gabriel@example.com']);
  assert.match(calls[0].options.headers['Idempotency-Key'],/^signal-email-/);
  assert.equal(writes[0].status,'sent');
  for(const invalid of [
   {order:{payment_status:'sinal_pago'}},{order:{delivery_status:'cancelado'}},
   {order:{user_id:other}},{order:{reservation_expires_at:new Date(Date.now()+7200000).toISOString()}},
   {preference:{enabled:false}},{preference:{email:'changed@example.com'}},
   {user:{email:'changed@example.com'}},{user:{email_confirmed_at:null}},
   {push:[{status:'sent'}]},
  ]){
   scenario=invalid;calls=[];writes=[];
   assert.equal((await sendSignalEmailReminders()).skipped,1);
   assert.equal(calls.length,0);assert.equal(writes[0].status,'skipped');
  }
  scenario={};calls=[];writes=[];
  globalThis.fetch=async()=>new Response('{}',{status:429});
  assert.equal((await sendSignalEmailReminders()).failed,1);assert.equal(writes[0].status,'failed');
  delete process.env.SIGNAL_REMINDER_TEST_USER_ID;
  await assert.rejects(sendSignalEmailReminders(),/test_user_required/);
 }finally{
  globalThis.fetch=savedFetch; delete globalThis.__signalEmailDb;
  for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];
  Object.assign(process.env,savedEnv);
 }
});
