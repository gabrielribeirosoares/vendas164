import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/lib/customerPacking.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {groupCustomerPackages,loadPackingOrders}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const base={id:'one',user_id:'customer',product_id:'wheel',payment_status:'quitado',delivery_status:'pendente',profiles:{name:'Gabriel',phone:'48999999999',email:null},products:{brand:'Kit',model:'Rodinhas',image_url:'base.webp',release_date:null,sku:'wheel'}};
test('packages consolidate all units but preserve customer identity and wheel combinations',()=>{
 const packages=groupCustomerPackages([base,{...base,id:'two'},{...base,id:'red',variant_id:'red',variant_name:'Vermelho — 12 mm — Com freio',variant_image_url:'red.webp'},{...base,id:'blue',variant_id:'blue',variant_name:'Azul — 14 mm',variant_image_url:'blue.webp'},{...base,id:'different',user_id:'other'}],'2026-10-13');
 assert.equal(packages.length,2);
 const customer=packages.find(p=>p.key==='user:customer');
 assert.equal(customer.quantity,4);
 assert.equal(customer.lines.length,3);
 assert.equal(customer.lines.find(l=>l.variantName?.startsWith('Vermelho')).imageUrl,'red.webp');
 assert.equal(customer.lines.find(l=>!l.variantName).quantity,2);
});
test('only fully paid, unshipped and available orders enter packing',()=>{
 const excluded=[{payment_status:'sinal_pago'},{payment_status:'cancelado'},...['enviado','em_transito','entregue','cancelado'].map(delivery_status=>({delivery_status})),{products:{...base.products,release_date:'2026-10-14'}}];
 const packages=groupCustomerPackages([base,...excluded.map((extra,i)=>({...base,id:`excluded${i}`,...extra})),{...base,id:'today',products:{...base.products,release_date:'2026-10-13'}}],'2026-10-13');
 assert.equal(packages[0].quantity,2);
});
test('guests on the seller account group by phone and malformed metadata stays separate',()=>{
 const guest=(id,phone)=>({...base,id,user_id:'seller',pix_key:'GUEST:'+JSON.stringify({name:'Cliente',phone})});
 const packages=groupCustomerPackages([guest('a','(48) 99999-1111'),guest('b','48999991111'),guest('c','48999992222'),{...base,id:'broken1',pix_key:'GUEST:broken'},{...base,id:'broken2',pix_key:'GUEST:broken'}],'2026-10-13');
 assert.equal(packages.length,4);assert.equal(packages.find(p=>p.key==='guest:48999991111').quantity,2);
});
test('fetches every server page and deduplicates overlapping order IDs',async()=>{
 const calls=[];
 const orders=await loadPackingOrders(async page=>{calls.push(page);return {total:201,groups:[{order:base,ids:page===1?['a','b']:page===2?['b','c']:['d']}]};});
 assert.deepEqual(calls,[1,2,3]);assert.deepEqual(orders.map(o=>o.id),['a','b','c','d']);
 const failed=()=>loadPackingOrders(async page=>{if(page===2)throw Error('network');return {total:101,groups:[{order:base,ids:['a']}]};});
 await assert.rejects(failed,/network/);
});
