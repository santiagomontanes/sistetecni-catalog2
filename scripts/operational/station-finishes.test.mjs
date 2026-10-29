import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
// Deliberadamente fija a loopback/base sintética. Nunca lee .env ni acepta remoto.
const pool=new pg.Pool({connectionString:'postgresql://postgres@127.0.0.1:55432/erp_test',max:8});
const actor=randomUUID(),other=randomUUID();
const desktop=randomUUID(),mobile=randomUUID();
async function asUser(sql,args=[],user=actor,session=desktop,role='authenticated'){
 const c=await pool.connect();try{await c.query('begin');await c.query(`set local role ${role}`);await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role,session_id:session})]);const r=await c.query(sql,args);await c.query('commit');return r.rows[0]?.result;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
const workshop=(action,payload)=>asUser('select erp_workshop_command($1,$2,$3) as result',[action,payload,randomUUID()]);
const finish=(action,payload,key=randomUUID())=>asUser('select erp_finish_command($1,$2,$3) as result',[action,payload,key]);
const link=(action,payload,user=actor,session=desktop)=>asUser('select erp_station_link($1,$2) as result',[action,payload],user,session);
const unit=async id=>(await pool.query('select * from product_units where id=$1',[id])).rows[0];
let location,product;
before(async()=>{
 await pool.query("insert into profiles(id,is_admin,erp_role,active) values($1,true,'admin',true),($2,false,'tecnico',true)",[actor,other]);
 await workshop('configure',{enabled:true});
 location=(await workshop('location',{code:'T'+randomUUID().slice(0,8).toUpperCase(),name:'Pruebas estación'})).id;
 product=(await pool.query("insert into products(title,price,visible_web,erp_stock_enabled) values('TEST acabados',800000,true,true) returning id")).rows[0].id;
});
after(()=>pool.end());
async function receive(capacity=4){
 const batch=await workshop('qr_batch',{count:1});const r=await workshop('receive',{qrCode:batch.labels[0].code,locationId:location,condition:'good',snapshot:{physical:'good',screenType:'unknown',powersOn:'unchecked',video:'unchecked',chargerReceived:'unchecked',components:[{kind:'ram',capacityGb:capacity,generation:'DDR4'}]}});return r.unitId;
}
async function ready(id){
 for(const d of (await pool.query('select code from workshop_check_definitions where active and required')).rows){const u=await unit(id);await workshop('check',{unitId:id,version:Number(u.row_version),code:d.code,result:'passed',note:'Verificación sintética'});}
 const u=await unit(id);await workshop('phase',{unitId:id,version:Number(u.row_version),phase:'ready'});
}
test('vínculo temporal: misma unidad, aislamiento usuario/sesión/pestaña, un solo canje y revocación',async()=>{
 const id=await receive();const created=await link('create',{station:'Prueba computador'});
 assert.match(created.code,/^\d{5}$/);
 const joined=await link('join',{code:created.code},actor,mobile);
 await assert.rejects(()=>link('join',{code:created.code},actor,randomUUID()),/link_invalid/);
 await link('select',{id:created.id,token:joined.token,unitId:id},actor,mobile);
 const current=await link('read',{id:created.id,token:created.token});assert.equal(current.unitId,id);assert.equal(current.paired,true);
 await assert.rejects(()=>link('read',{id:created.id,token:created.token},actor,randomUUID()),/link_invalid/);
 await assert.rejects(()=>link('read',{id:created.id,token:created.token},other,desktop),/link_invalid/);
 await assert.rejects(()=>link('read',{id:created.id}),/link_invalid/);
 await assert.rejects(()=>link('read',{id:created.id,token:'bad'}),/link_invalid/);
 await link('revoke',{id:created.id,token:created.token});
 await assert.rejects(()=>link('read',{id:created.id,token:joined.token},actor,mobile),/link_invalid/);
});
test('vínculo expira y no concede lectura directa de secretos mediante RLS',async()=>{
 const created=await link('create',{station:'Temporal'});
 await pool.query("update erp_station_links set pair_until=now()-interval '1 second' where id=$1",[created.id]);
 await assert.rejects(()=>link('join',{code:created.code},actor,mobile),/link_invalid/);
 await pool.query("update erp_station_links set expires_at=now()-interval '1 second' where id=$1",[created.id]);
 await assert.rejects(()=>link('read',{id:created.id,token:created.token}),/link_invalid/);
 await assert.rejects(()=>asUser('select * from erp_station_links'),/permission denied/);
});
test('fotos privadas: solo referencia existente y cambio de versión para sincronización',async()=>{
 const id=await receive();const path=`units/${id}/${randomUUID()}.jpg`;
 await assert.rejects(()=>asUser('select erp_unit_photo_add($1,$2,$3,$4) as result',[id,path,'image/jpeg',100]),/upload_missing/);
 const prior=await unit(id);
 // Metadatos Storage sintéticos: este caso prueba persistencia/RLS; no el servicio de archivos.
 await pool.query("insert into storage.objects(bucket_id,name) values('workshop-private',$1)",[path]);
 await asUser('select erp_unit_photo_add($1,$2,$3,$4) as result',[id,path,'image/jpeg',100]);
 assert.equal(BigInt((await unit(id)).row_version),BigInt(prior.row_version)+BigInt(1));
 assert.equal((await pool.query('select count(*) from erp_unit_photos where unit_id=$1',[id])).rows[0].count,'1');
 await assert.rejects(()=>asUser('select erp_unit_photo_add($1,$2,$3,$4) as result',[id,path,'image/jpeg',100]),/duplicate key/);
 await assert.rejects(()=>asUser('select * from erp_unit_photos',[],actor,desktop,'anon'),/permission denied/);
});
test('dos acabados con mismo color: fotos, RAM/precio/stock por selección; stock reservado excluido',async()=>{
 const first=await receive(4),second=await receive(8),fs=[];
 for(const [i,id] of [first,second].entries()){
  const f=await finish('create',{productId:product,baseColor:'Gris',texture:i?'chinas':'3D',name:i?'Gris chinas':'Gris 3D'});fs.push(f.id);
  const path=`${f.id}/${randomUUID()}.jpg`;
  await pool.query("insert into storage.objects(bucket_id,name) values('catalog-finishes',$1)",[path]);
  await finish('photo',{finishId:f.id,path});
  const payload={unitId:id,version:Number((await unit(id)).row_version),finishId:f.id,priceCop:i?'900000':'800000',confirmed:true};
  const key=randomUUID();const result=await finish('assign',payload,key);assert.deepEqual(await finish('assign',payload,key),result);
  await ready(id);
 }
 await finish('publish',{productId:product,confirmed:true});
 let data=await asUser('select catalog_finish_options($1) as result',[product],actor,desktop,'anon');
 assert.equal(data.options.length,2);assert.deepEqual(data.options.map(o=>[o.name,o.configuration.ramGb,o.priceCop,o.stock]),[['Gris 3D',4,'800000',1],['Gris chinas',8,'900000',1]]);
 assert.notDeepEqual(data.options[0].imagePaths,data.options[1].imagePaths);
 await asUser("select erp_transition_product_unit($1,'reserved','Prueba reserva','Cliente sintético','3000000000',now()+interval '1 hour') as result",[first]);
 data=await asUser('select catalog_finish_options($1) as result',[product],actor,desktop,'anon');assert.equal(data.options.length,1);assert.equal(data.options[0].name,'Gris chinas');
 await assert.rejects(()=>asUser("update product_units set commercial_price_cop=1 where id=$1",[second]),/finish_use_command/);
 await assert.rejects(()=>finish('assign',{unitId:second,version:0,finishId:fs[1],priceCop:'1',confirmed:true}),/version_conflict/);
});
test('desconocidos nunca se publican como RAM total conocida y configuración no aprobada impide venta',async()=>{
 const id=await receive(null);const draft=await asUser('select erp_finish_read($1) as result',[id]);assert.equal(draft.draft.ramGb,null);
 const u=await unit(id);
 await assert.rejects(()=>workshop('phase',{unitId:id,version:Number(u.row_version),phase:'ready'}),/product_required|checks_missing/);
});
test('reporte operativo usa fuentes reales, importes texto y permisos efectivos',async()=>{
 const result=await asUser("select erp_operational_report(current_date-1,current_date,3) as result");
 assert.ok(result.phaseLocations.some(x=>x.phase==='reception'&&x.units>0));
 assert.ok(result.phaseHours.every(x=>Number(x.hours)>=0));
 assert.match(result.preparationCostCop,/^-?\d+$/);
 assert.match(result.shipping.netPendingCop,/^\d+$/);
 await assert.rejects(()=>asUser("select erp_operational_report(current_date-1,current_date,3) as result",[],other),/permission/);
 await assert.rejects(()=>asUser("select erp_operational_report(current_date,current_date-1,3) as result"),/invalid_report_range/);
});
test('stock canónico serializa ventas concurrentes sin depender de trigger de colores',async()=>{
 const p=(await pool.query("insert into products(title,price,erp_stock_enabled) values('TEST concurrencia stock',1,true) returning id")).rows[0].id;
 const ids=[];
 for(let i=0;i<2;i++)ids.push((await pool.query("insert into product_units(product_id,unit_code,status) values($1,$2,'available') returning id",[p,`TEST-STOCK-${randomUUID()}`])).rows[0].id);
 // Inhabilitar SOLO el trigger de colores en transacción sintética aislada
 // no es necesario: se invoca la función directamente después de los cambios
 // realizados con triggers deshabilitados SOLO en estas dos sesiones de test.
 async function sell(id){const c=await pool.connect();try{await c.query('begin');await c.query("set local session_replication_role='replica'");await c.query("update product_units set status='sold',sold_at=now() where id=$1",[id]);await c.query('select erp_sync_product_stock($1)',[p]);await c.query('commit');}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
 await Promise.all(ids.map(sell));
 const actual=(await pool.query("select stock,(select count(*) from product_units where product_id=$1 and status='available') actual from products where id=$1",[p])).rows[0];
 assert.equal(actual.stock,0);assert.equal(actual.actual,'0');
});
test('inventario valorizado excluye pieza instalada vendida, sin alterar costo histórico',async()=>{
 const parent=await receive();
 const piece=await workshop('component_receive',{kind:'ram',locationId:location,componentCondition:'functional',costCop:'27000',snapshot:{kind:'ram',capacityGb:4,generation:'DDR4'}});
 const id=piece.unitId;
 await workshop('component_move',{unitId:parent,version:Number((await unit(parent)).row_version),componentId:id,componentVersion:Number((await unit(id)).row_version),direction:'install',reason:'Prueba costo instalado'});
 const f=await finish('create',{productId:product,baseColor:'Gris',texture:'Prueba costo',name:'Costo '+randomUUID().slice(0,8)});
 await finish('assign',{unitId:parent,version:Number((await unit(parent)).row_version),finishId:f.id,priceCop:'800000',confirmed:true});
 await ready(parent);
 const before=await asUser('select erp_business_report(current_date-1,current_date) as result');
 await asUser(`select erp_create_sale_with_units(null,'Cliente SINTETICO','000','3000000000',null,$1::jsonb,0,'transferencia','pendiente',6,'Test costo',$2) as result`,[JSON.stringify([{itemType:'catalog',productId:product,productUnitId:parent,quantity:1,unitPriceCop:800000}]),randomUUID()]);
 const after=await asUser('select erp_business_report(current_date-1,current_date) as result');
 assert.equal(BigInt(before.inventoryAcquisitionValueCop)-BigInt(after.inventoryAcquisitionValueCop),BigInt(27000));
 const persisted=await unit(id);assert.equal(persisted.installed_in_unit_id,parent);assert.equal(persisted.acquisition_cost_cop,'27000');
 const ledger=await pool.query('select amount_cop from cost_entries where id=$1',[persisted.component_cost_entry_id]);assert.equal(ledger.rows[0].amount_cop,'27000');
});
