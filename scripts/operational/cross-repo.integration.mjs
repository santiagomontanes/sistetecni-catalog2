// Bot real del worktree + API ERP/Auth/PostgreSQL reales, exclusivamente loopback.
// La salida de Meta se inyecta como adaptador sintético: no envía mensajes reales.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {appEnv,baseUrl,appUrl,anonKey,serviceKey,testPassword} from './browser-env.mjs';
process.env.APP_ENV='test';process.env.PRODUCT_REPOSITORY='fake';process.env.QUOTE_REPOSITORY='fake';
if(!/^http:\/\/127\.0\.0\.1:/.test(baseUrl)||!/^http:\/\/127\.0\.0\.1:/.test(appUrl))throw Error('local_services_required');
const bot=resolve(process.cwd(),'../sistetecni-bot-operativo');
const {ErpCliente}=await import(pathToFileURL(resolve(bot,'src/erp/cliente.js')));
const {atenderErp}=await import(pathToFileURL(resolve(bot,'src/erp/admin.js')));
const {PendientesErp}=await import(pathToFileURL(resolve(bot,'src/erp/pendientes.js')));
const {FormulariosAdmin}=await import(pathToFileURL(resolve(bot,'src/erp/menu-estado.js')));
const {procesarRecordatorios}=await import(pathToFileURL(resolve(bot,'src/erp/recordatorios-envios.js')));
const admin=createClient(baseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const erp=new ErpCliente({baseUrl:appUrl,secret:appEnv.ERP_AGENT_SHARED_SECRET});
const prefix=randomUUID();let n=0,operator,token,employee,shipment;
const wa='57'+String(Date.now()).slice(-11);
const pendientes=new PendientesErp(),formularios=new FormulariosAdmin();
const turn=texto=>atenderErp({texto,sessionId:`cross:${prefix}`,waId:wa,metaMessageId:`cross:${prefix}:${++n}`,esAdministrador:true,cliente:erp,pendientes,formularios});
const confirm=async()=>{const p=pendientes.obtener(`cross:${prefix}`);assert.ok(p);return turn(`CONFIRMAR ${p.confirmationCode}`);};
async function rpc(client,name,args){const r=await client.rpc(name,args);if(r.error)throw Error(`${name}:${r.error.message}`);return r.data;}
async function web(action,args){const r=await fetch(appUrl+'/api/admin/shipments',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,arguments:args,requestId:randomUUID()})});const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));assert.equal(result.ok,true,JSON.stringify(result));return result.data;}
after(()=>{employee?.auth.stopAutoRefresh();});
test('bot crea envío, lista pendientes, registra guía/flete, despacho y entrega; web concilia 700000/30000/670000',async()=>{
 const email=`cross-${prefix}@example.test`;const user=await admin.auth.admin.createUser({email,password:testPassword,email_confirm:true});assert.equal(user.error,null);operator=user.data.user.id;
 const profile=await admin.from('profiles').insert({id:operator,email,is_admin:true,erp_role:'admin',active:true});assert.equal(profile.error,null);
 employee=createClient(baseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await employee.auth.signInWithPassword({email,password:testPassword});assert.equal(signed.error,null);token=signed.data.session.access_token;
 await rpc(admin,'erp_agent_upsert_operator',{p_profile_id:operator,p_wa_id_hash:createHash('sha256').update(wa).digest('hex'),p_label:'TEST integración bot',p_active:true});
 await web('configure',{enabled:true,recipientIds:[operator]});
 const product=await employee.from('products').insert({title:'PRUEBA cross-repo',price:700000,erp_stock_enabled:true}).select('id').single();assert.equal(product.error,null);
 const unit=await employee.from('product_units').insert({product_id:product.data.id,unit_code:'BOT-TEST-'+prefix,status:'available',acquisition_cost_cop:100000}).select('id').single();assert.equal(unit.error,null);
 const sale=await rpc(employee,'erp_create_sale_with_units',{p_customer_id:null,p_customer_name:'Destinatario FICTICIO',p_customer_document:'00001',p_customer_phone:'3000000000',p_customer_email:null,p_items:[{itemType:'catalog',productId:product.data.id,productUnitId:unit.data.id,quantity:1,unitPriceCop:700000}],p_discount_cop:0,p_payment_method:'transferencia',p_payment_status:'pendiente',p_warranty_months:6,p_notes:'Sólo prueba loopback',p_idempotency_key:randomUUID()});
 const saleRow=await employee.from('sales').select('sale_number').eq('id',sale).single();assert.equal(saleRow.error,null);
 assert.equal((await turn('NUEVO ENVÍO')).manejado,true);await turn(saleRow.data.sale_number);
 for(const value of ['IGUAL','IGUAL','IGUAL','Ciudad ficticia','Departamento ficticio','Oficina ficticia','SÍ','TEST '+prefix,'OMITIR'])await turn(value);
 assert.ok(pendientes.obtener(`cross:${prefix}`));await confirm();
 const rows=await web('list',{carrier:'TEST '+prefix});assert.equal(rows.items.length,1);shipment=rows.items[0];assert.equal(shipment.sale_value_cop,'700000');
 assert.match((await turn('PENDIENTES DE GUÍA')).respuesta,new RegExp(saleRow.data.sale_number));
 await turn('REGISTRAR GUÍA');await turn(shipment.id);
 for(const value of ['000'+prefix,'30000','1','1','NO','0','0'])await turn(value);await confirm();
 shipment=await web('detail',{id:shipment.id});assert.equal(shipment.guide,'000'+prefix);assert.equal(shipment.transport[0].cost_bearer,'sistetecni');
 await turn('REGISTRAR DESPACHO');const dispatchPrompt=await turn(shipment.id);assert.ok(pendientes.obtener(`cross:${prefix}`),dispatchPrompt.respuesta.replace(/\d{6}/g,'[código]'));await confirm();
 await turn('REGISTRAR ENTREGA');await turn(shipment.id);await turn('AHORA');await turn('Constancia sintética cross-repo');await confirm();
 shipment=await web('detail',{id:shipment.id});assert.equal(shipment.status,'delivered');assert.equal(shipment.expected_net_cop,'670000');assert.equal(shipment.received_cop,'0');
 assert.match((await turn('PENDIENTES DE RECAUDO')).respuesta,/670[.,]000/);
 assert.match((await turn('DETALLE ENVÍO '+shipment.id)).respuesta,/000/);
 const deposit=await web('reconcile',{amountCop:'670000',depositedOn:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date()),account:'Cuenta TEST cross-repo',reference:prefix,confirmed:true,allocations:[{shipmentId:shipment.id,version:shipment.version,amountCop:'670000'}]});
 const cost=await admin.from('cost_entries').select('amount_cop').eq('sale_id',sale);assert.equal(cost.error,null);assert.deepEqual(cost.data,[{amount_cop:30000}]);
 const cash=await admin.from('cash_movements').select('amount_cop').eq('id',deposit.cashMovementId);assert.equal(cash.error,null);assert.deepEqual(cash.data,[{amount_cop:670000}]);
 const unchanged=await employee.from('sales').select('total_cop').eq('id',sale).single();assert.equal(unchanged.data.total_cop,700000);
});
test('número no vinculado y firma errónea no autorizan operaciones',async()=>{
 await assert.rejects(erp.enviarEnvio({kind:'command',waId:'579999999999',metaMessageId:'no-operator-'+prefix,requestId:randomUUID(),action:'list',arguments:{}}));
 const bad=new ErpCliente({baseUrl:appUrl,secret:'different-synthetic-secret-at-least-32-characters'});
 await assert.rejects(bad.enviarEnvio({kind:'command',waId:wa,metaMessageId:'bad-signature-'+prefix,requestId:randomUUID(),action:'list',arguments:{}}),e=>e.estadoHttp===401);
});
test('worker real usa API y persistencia; adaptador Meta sintético envía una vez tras reencolar',async()=>{
 const id=randomUUID();const insert=await admin.from('erp_shipping_jobs').insert({id,kind:'pending_guides',dedupe_key:'cross-job:'+prefix,due_at:'1990-01-01T00:00:00Z',recipient_ids:[operator]});assert.equal(insert.error,null);
 let calls=0;const options={cliente:erp,destinatarios:[{profileId:operator,waId:wa}],limite:1,enviarPlantilla:async()=>{calls++;return {messageId:'synthetic-provider-'+prefix};}};
 const first=await procesarRecordatorios(options);assert.equal(first.sent,1);assert.equal(calls,1);
 const reset=await admin.from('erp_shipping_jobs').update({status:'pending',due_at:'1990-01-01T00:00:00Z',lease_token:null,lease_until:null}).eq('id',id);assert.equal(reset.error,null);
 const restarted=await procesarRecordatorios({...options,cliente:new ErpCliente({baseUrl:appUrl,secret:appEnv.ERP_AGENT_SHARED_SECRET})});assert.equal(restarted.skipped,1);assert.equal(calls,1);
 const rows=await admin.from('erp_shipping_notification_deliveries').select('state,provider_message_id').eq('job_id',id);assert.equal(rows.error,null);assert.deepEqual(rows.data,[{state:'sent',provider_message_id:'synthetic-provider-'+prefix}]);
});
test('reinicio con envío sin ACK queda incierto y requiere revisión antes de reintentar',async()=>{
 const id=randomUUID();assert.equal((await admin.from('erp_shipping_jobs').insert({id,kind:'pending_guides',dedupe_key:'cross-uncertain:'+prefix,due_at:'1989-01-01T00:00:00Z',recipient_ids:[operator]})).error,null);
 const claimed=(await erp.enviarTrabajoEnvio({action:'claim',limit:1})).datos.data[0];assert.equal(claimed.id,id);
 const begun=(await erp.enviarTrabajoEnvio({action:'begin',jobId:id,leaseToken:claimed.lease_token,waId:wa})).datos.data;assert.equal(begun.skip,false);
 await admin.from('erp_shipping_jobs').update({lease_until:'2000-01-01T00:00:00Z'}).eq('id',id);
 let calls=0;const options={cliente:erp,destinatarios:[{profileId:operator,waId:wa}],limite:1,enviarPlantilla:async()=>{calls++;return {messageId:'synthetic-after-review-'+prefix};}};
 const retry=await procesarRecordatorios(options);assert.equal(retry.requiresReview,1);assert.equal(calls,0);
 await rpc(employee,'erp_shipping_review_notification',{p_job:id,p_profile:operator,p_outcome:'not_sent',p_provider_message:'',p_reason:'Prueba: se comprobó que el adaptador no fue invocado'});
 await admin.from('erp_shipping_jobs').update({due_at:'1989-01-01T00:00:00Z'}).eq('id',id);
 const allowed=await procesarRecordatorios(options);assert.equal(allowed.sent,1);assert.equal(calls,1);
});
