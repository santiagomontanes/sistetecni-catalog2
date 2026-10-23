import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
const pool=new pg.Pool({connectionString:'postgresql://postgres@127.0.0.1:55432/erp_test'}),actor=randomUUID(),other=randomUUID(),wa='57'+String(Date.now()).slice(-11),hash=createHash('sha256').update(wa).digest('hex');
const query=async(sql,args=[])=>(await pool.query(sql,args)).rows;
const rpc=async(action,args)=>(await query('select erp_shipping_reminder_command($1,$2) data',[action,args]))[0].data;
let shipment,job;
before(async()=>{
 await query("insert into profiles(id,is_admin,erp_role,active) values($1,true,'admin',true),($2,false,'vendedor',true)",[actor,other]);
 await query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await query('select erp_agent_upsert_operator($1,$2,$3,true)',[actor,hash,'Operador TEST avisos']);
 const sale=(await query("insert into sales(customer_name,customer_document,customer_phone,subtotal_cop,total_cop,payment_method,payment_status,created_by) values('TEST avisos','0001','3000000000',100000,100000,'transferencia','pendiente',$1) returning id",[actor]))[0].id;
 shipment=(await query("insert into erp_shipments(sale_id,recipient_name,recipient_document,recipient_phone,city,department,address,carrier,payment_mode,sale_value_cop,collect_cop,freight_cop,guide,status,guide_registered_at,created_by) values($1,'TEST ficticio','0001','3000000000','TEST','TEST','Oficina TEST','TEST','cod',100000,100000,10000,$2,'dispatched',now()-interval '7 days',$3) returning id",[sale,'000'+randomUUID(),actor]))[0].id;
 job=(await query("insert into erp_shipping_jobs(kind,dedupe_key,shipment_id,due_at,recipient_ids) values('verify_delivery',$1,$2,now()-interval '30 years',array[$3::uuid]) returning id",['test-notice:'+randomUUID(),shipment,actor]))[0].id;
 await query('update erp_shipping_settings set enabled=true');
});
after(()=>pool.end());
test('publicación persistente e idempotente por destinatario no confirma entrega',async()=>{
 await query('select erp_shipping_publish_notifications()');await query('select erp_shipping_publish_notifications()');
 assert.equal((await query('select count(*)::int n from erp_shipping_notifications where job_id=$1',[job]))[0].n,1);
 const row=(await query('select body from erp_shipping_notifications where job_id=$1',[job]))[0];assert.match(row.body,/no confirma entrega/);
 assert.equal((await query('select status from erp_shipments where id=$1',[shipment]))[0].status,'dispatched');
});
test('RLS mantiene avisos propios y deniega lectura ajena',async()=>{
 const c=await pool.connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);assert.equal((await c.query('select count(*)::int n from erp_shipping_notifications where job_id=$1',[job])).rows[0].n,0);await c.query('rollback');}finally{c.release();}
});
let lease,send;
test('un único envío por destinatario sobrevive a pérdida de ACK y reinicio',async()=>{
 const jobs=await rpc('claim',{limit:50});lease=jobs.find(j=>j.id===job).lease_token;
 const args={jobId:job,leaseToken:lease,waIdHash:hash};send=await rpc('begin',args);assert.equal(send.skip,false);
 await query("update erp_shipping_jobs set lease_until=now()-interval '1 second' where id=$1",[job]);
 const reclaimed=await rpc('claim',{limit:50});lease=reclaimed.find(j=>j.id===job).lease_token;
 const retry=await rpc('begin',{...args,leaseToken:lease});assert.equal(retry.skip,true);assert.equal(retry.requiresReview,true);
 assert.equal((await query('select attempts from erp_shipping_notification_deliveries where job_id=$1',[job]))[0].attempts,1);
 await rpc('finish',{jobId:job,sendToken:send.sendToken,waIdHash:hash,outcome:'sent',providerMessageId:'TEST-provider-message'});
 const replay=await rpc('begin',{...args,leaseToken:lease});assert.equal(replay.alreadySent,true);
 await rpc('ack',{jobId:job,leaseToken:lease,success:true});assert.equal((await query('select status from erp_shipping_jobs where id=$1',[job]))[0].status,'done');
});
test('destinatario no vinculado, token antiguo y usuario desactivado no reciben contenido',async()=>{
 await assert.rejects(rpc('begin',{jobId:job,leaseToken:lease,waIdHash:'a'.repeat(64)}),/recipient_not_authorized/);
 await assert.rejects(rpc('finish',{jobId:job,sendToken:randomUUID(),waIdHash:hash,outcome:'sent',providerMessageId:'TEST-invalid'}),/token_invalid/);
 await query('update profiles set active=false where id=$1',[actor]);await assert.rejects(rpc('begin',{jobId:job,leaseToken:lease,waIdHash:hash}),/recipient_not_authorized/);await query('update profiles set active=true where id=$1',[actor]);
});
test('una entrega posterior retira la necesidad del aviso sin marcar una entrega por el job',async()=>{
 await query("update erp_shipments set status='delivered',delivered_at=now() where id=$1",[shipment]);
 assert.equal((await query('select erp_shipping_reminder_body($1) body',[job]))[0].body,null);
});
