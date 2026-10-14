import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const read=path=>readFile(new URL('../src/lib/'+path,import.meta.url),'utf8');
const customer=url(compile(await read('customerPacking.ts'))),summary=url(compile(await read('reservationSummary.ts')));
const code=compile(await read('productBuyers.ts')).replace('"./customerPacking"',JSON.stringify(customer)).replace("'./customerPacking'",JSON.stringify(customer)).replace('"./reservationSummary"',JSON.stringify(summary)).replace("'./reservationSummary'",JSON.stringify(summary));
const {groupProductBuyers,loadBuyerPages}=await import(url(code));
const base={id:'a',user_id:'customer',product_id:'wheel',payment_status:'sinal_pago',delivery_status:'pendente',total_price:100,down_payment:10,signal_amount:10,profiles:{name:'Cliente',phone:'48999999999',email:null},products:{brand:'Kit',model:'Rodinhas',image_url:'base.webp',release_date:null},order_installments:[{amount:20,status:'paid'}]};
test('per-product buyer totals use each unit payments, settled state and exact variations',()=>{
 const rows=[base,{...base,id:'b',order_installments:[{amount:30,status:'paid'}]},{...base,id:'paid',payment_status:'quitado',variant_id:'red',variant_name:'Vermelho — 12 mm',variant_image_url:'red.webp',order_installments:[]},{...base,id:'other',user_id:'other'}];
 const buyers=groupProductBuyers(rows,'wheel');assert.equal(buyers.length,2);
 const buyer=buyers.find(b=>b.key==='user:customer');assert.equal(buyer.quantity,3);assert.equal(buyer.summary.total,300);assert.equal(buyer.summary.received,170);assert.equal(buyer.summary.balance,130);assert.equal(buyer.variants.find(v=>v.key==='red').imageUrl,'red.webp');assert.equal(buyer.variants.find(v=>v.key==='').quantity,2);
});
test('cancelled, duplicate and other product orders never inflate buyers or quantity',()=>{
 const rows=[base,base,{...base,id:'cancel',payment_status:'cancelado'},{...base,id:'shipCancel',delivery_status:'cancelado'},{...base,id:'different',product_id:'another'}];
 assert.equal(groupProductBuyers(rows,'wheel')[0].quantity,1);
});
test('manual guests sharing seller account retain independent identities and shipping counts',()=>{
 const rows=[{...base,id:'one',user_id:'seller',pix_key:'GUEST:'+JSON.stringify({name:'Mesmo nome',phone:'48911111111'}),delivery_status:'entregue'},{...base,id:'two',user_id:'seller',pix_key:'GUEST:'+JSON.stringify({name:'Mesmo nome',phone:'48922222222'}),delivery_status:'enviado'}];
 const buyers=groupProductBuyers(rows,'wheel');assert.equal(buyers.length,2);assert.equal(buyers.find(b=>b.phone==='48911111111').delivered,1);assert.equal(buyers.find(b=>b.phone==='48922222222').sent,1);
});
test('raw order pagination loads all pages and surfaces a failed page',async()=>{
 const offsets=[];const rows=await loadBuyerPages(async offset=>{offsets.push(offset);return offset<200?Array.from({length:100},(_,i)=>offset+i):[200];});assert.equal(rows.length,201);assert.deepEqual(offsets,[0,100,200]);
 await assert.rejects(loadBuyerPages(async offset=>{if(offset)throw Error('network');return Array(100).fill(base);}),/network/);
});
