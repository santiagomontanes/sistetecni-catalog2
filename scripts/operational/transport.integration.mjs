import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const pool=new pg.Pool({connectionString:'postgresql://postgres@127.0.0.1:55432/erp_test',max:8});
const actor=randomUUID(),seller=randomUUID(),key=()=>randomUUID();
async function command(action,args={},request=key(),who=actor){const c=await pool.connect();try{
 await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[who]);
 const r=await c.query('select erp_shipping_command($1,$2,$3) result',[action,args,request]);await c.query('commit');return r.rows[0].result;
}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
async function sql(text,args=[]){const c=await pool.connect();try{await c.query('reset role');return (await c.query(text,args)).rows;}finally{c.release();}}
before(async()=>{await sql("insert into profiles(id,is_admin,erp_role,active) values($1,true,'admin',true),($2,false,'vendedor',true)",[actor,seller]);await command('configure',{enabled:true});});
after(()=>pool.end());
const freight=(amount='30000',extra={})=>({code:'freight',kind:'freight',description:'Flete de prueba sintética',amountCop:amount,costBearer:'sistetecni',settlement:'withheld',provisional:false,customerChargeCop:'0',customerChargeMode:'none',...extra});
async function fixture({amount='700000',concept=freight(),paid=false,other=[]}={}){
 const p=(await sql("insert into products(title,price,erp_stock_enabled) values('PRUEBA transporte',700000,true) returning id"))[0].id;
 const unit=(await sql("insert into product_units(product_id,unit_code,status,acquisition_cost_cop) values($1,$2,'available',100000) returning id",[p,`TRANSPORT-${key()}`]))[0].id;
 const c=await pool.connect();let sale;try{await c.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await c.query('set role authenticated');sale=(await c.query("select erp_create_sale_with_units(null,'Cliente FICTICIO','00001','3000000000',null,$1,0,'transferencia',$2,6,'Prueba transporte',$3) id",[JSON.stringify([{itemType:'catalog',productId:p,productUnitId:unit,unitPriceCop:amount,quantity:1}]),paid?'pagado':'pendiente',key()])).rows[0].id;}finally{await c.query('reset role');c.release();}
 let s=await command('create',{saleId:sale,name:'Cliente FICTICIO',document:'00001',phone:'3000000000',city:'Ciudad sintética',department:'Departamento sintético',officePickup:true,address:'Oficina sintética',carrier:'Transportadora TEST',paymentMode:paid?'prepaid':'cod',collectCop:paid?'0':amount});
 s=await command('guide',{id:s.id,version:s.version,guide:`000${key()}`,freightCop:concept.amountCop,deductionsCop:other.reduce((n,t)=>n+BigInt(t.amountCop??'0'),BigInt(0)).toString(),deductionReason:other.length?'Otros conceptos de prueba':undefined,transport:[concept,...other]});
 return s;
}
async function deliver(s){s=await command('dispatch',{id:s.id,version:s.version});return command('deliver',{id:s.id,version:s.version,deliveredAt:new Date().toISOString(),expectedNetCop:s.payment_mode==='prepaid'?'0':(BigInt(s.collect_cop)-BigInt(s.carrier_withheld_cop)).toString(),evidence:'Entrega sintética verificada'});}
const deposit=(s,amount=s.balance_cop,extra={})=>({amountCop:amount,depositedOn:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date()),account:'Cuenta FICTICIA transporte',reference:key(),confirmed:true,allocations:[{shipmentId:s.id,version:s.version,amountCop:amount,...extra}]});
const costs=async s=>(await sql('select coalesce(sum(amount_cop),0)::text total,count(*)::int entries from cost_entries where sale_id=$1',[s.sale_id]))[0];
test('700000 venta, 30000 costo una vez, 670000 entrada única sin salida adicional',async()=>{
 let s=await fixture();assert.deepEqual(await costs(s),{total:'0',entries:0});s=await deliver(s);
 assert.deepEqual(await costs(s),{total:'30000',entries:1});assert.equal(s.expected_net_cop,'670000');
 const args=deposit(s),id=key();const responses=await Promise.all([command('reconcile',args,id),command('reconcile',args,id)]);
 assert.equal(responses[0].depositId,responses[1].depositId);
 assert.deepEqual(await costs(s),{total:'30000',entries:1});
 assert.equal((await sql('select total_cop::text total from sales where id=$1',[s.sale_id]))[0].total,'700000');
 const cash=await sql('select amount_cop::text amount from cash_movements where metadata->>\'shippingDepositId\'=$1',[responses[0].depositId]);assert.deepEqual(cash,[{amount:'670000'}]);
 assert.equal((await sql("select count(*)::int n from cash_movements where sale_id=$1 or metadata->>'shippingDepositId'=$2",[s.sale_id,responses[0].depositId]))[0].n,1);
 s=await command('detail',{id:s.id});assert.equal(s.transport_company_cost_cop,'30000');assert.equal(s.collection_status,'reconciled');assert.equal(s.transport_review_required,false);
});
test('provisional se reconoce, confirmar sin cambio no duplica y correcciones preservan reversos',async()=>{
 let s=await deliver(await fixture({concept:freight('30000',{provisional:true})}));assert.equal(s.transport_review_required,true);
 s=await command('transport_save',{id:s.id,version:s.version,concept:freight(),confirmed:true,reason:'Flete final confirmado'});
 assert.deepEqual(await costs(s),{total:'30000',entries:1});assert.equal(s.transport_review_required,false);
 s=await command('transport_save',{id:s.id,version:s.version,concept:freight('32000'),confirmed:true,reason:'Comprobante final actualizado'});
 assert.deepEqual(await costs(s),{total:'32000',entries:2});assert.equal(s.expected_net_cop,'668000');
 s=await command('transport_save',{id:s.id,version:s.version,concept:freight('28000'),confirmed:true,reason:'Corrección a la baja comprobada'});
 assert.equal((await costs(s)).total,'28000');assert.equal(s.expected_net_cop,'672000');
 const original=(await sql("select id from cost_entries ce where sale_id=$1 and entry_kind='cost' and not exists(select 1 from cost_entries r where r.reversal_of_id=ce.id) order by created_at desc limit 1",[s.sale_id]))[0].id;
 const c=await pool.connect();try{await c.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await c.query('set role authenticated');await assert.rejects(c.query("select erp_reverse_cost_entry($1,'Intento fuera del flujo')",[original]),/shipping_adjust_cost|already_reversed/);}finally{c.release();}
});
test('costo manual anterior exige revisión y se vincula sin volver a contabilizarlo',async()=>{
 let s=await fixture();const c=await pool.connect();let existing;
 try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);existing=(await c.query("select erp_add_cost_entry('sale',$1,'transport','Transporte manual anterior de prueba',30000,now()) id",[s.sale_id])).rows[0].id;await c.query('commit');}finally{c.release();}
 s=await command('dispatch',{id:s.id,version:s.version});
 await assert.rejects(command('deliver',{id:s.id,version:s.version,deliveredAt:new Date().toISOString(),expectedNetCop:'670000',evidence:'Entrega sintética'}),/shipping_existing_cost_requires_review/);
 assert.deepEqual(await costs(s),{total:'30000',entries:1});
 s=await command('transport_save',{id:s.id,version:s.version,concept:freight('30000',{existingCostEntryId:existing}),confirmed:true,reason:'Vincular CST anterior verificado, sin duplicar'});
 s=await command('deliver',{id:s.id,version:s.version,deliveredAt:new Date().toISOString(),expectedNetCop:'670000',evidence:'Entrega sintética verificada'});
 assert.deepEqual(await costs(s),{total:'30000',entries:1});assert.equal(s.transport_company_cost_cop,'30000');
 s=await command('transport_save',{id:s.id,version:s.version,concept:freight('28000',{existingCostEntryId:existing}),confirmed:true,reason:'Corrección real del concepto adoptado'});
 assert.equal((await costs(s)).total,'28000');assert.equal(s.transport_company_cost_cop,'28000');
});
test('flete pagado directamente por cliente no baja el recaudo ni genera costo propio',async()=>{
 let s=await deliver(await fixture({concept:freight('30000',{costBearer:'customer',settlement:'customer_direct',customerChargeCop:'30000',customerChargeMode:'direct_to_carrier'})}));
 assert.equal(s.expected_net_cop,'700000');assert.deepEqual(await costs(s),{total:'0',entries:0});
 s=await command('detail',{id:s.id});assert.equal(s.transport[0].customer_charge_mode,'direct_to_carrier');
});
test('cobro incluido en venta se conserva como ingreso y no se descuenta dos veces del costo',async()=>{
 const s=await deliver(await fixture({concept:freight('30000',{customerChargeCop:'30000',customerChargeMode:'included_in_sale'})}));
 assert.equal((await costs(s)).total,'30000');assert.equal((await sql('select total_cop::text total from sales where id=$1',[s.sale_id]))[0].total,'700000');assert.equal(s.expected_net_cop,'670000');
});
test('pago anticipado vincula salida existente, entrega no crea otra salida ni descuento COD',async()=>{
 const movement=(await sql("insert into cash_movements(movement_number,movement_type,payment_method,amount_cop,description,created_by) values('MOV-'||lpad(nextval('cash_movement_number_seq')::text,6,'0'),'manual_out','transferencia',-30000,'Anticipo transporte sintético',$1) returning id",[actor]))[0].id;
 const s=await deliver(await fixture({concept:freight('30000',{settlement:'prepaid',prepaymentMovementId:movement})}));
 assert.equal(s.expected_net_cop,'700000');assert.equal((await costs(s)).total,'30000');
 assert.equal((await sql('select count(*)::int n from cash_movements where id=$1 or reversal_of_id=$1',[movement]))[0].n,1);
 await assert.rejects(fixture({concept:freight('30000',{settlement:'prepaid',prepaymentMovementId:movement})}),/prepayment_overallocated/);
});
test('entrega fallida y devolución pueden reconocer costos sin venta entregada ni movimiento de caja',async()=>{
 let s=await fixture();s=await command('dispatch',{id:s.id,version:s.version});
 s=await command('incident',{id:s.id,version:s.version,reason:'Intento fallido comprobado',recognizeTransport:true});
 assert.equal(s.status,'incident');assert.equal((await costs(s)).total,'30000');
 s=await command('return',{id:s.id,version:s.version,reason:'Devolución física sintética',recognizeTransport:true});assert.equal((await costs(s)).total,'30000');
 s=await command('transport_save',{id:s.id,version:s.version,concept:{...freight('12000',{settlement:'payable'}),code:'return',kind:'return',description:'Retorno confirmado transportadora'},confirmed:true,reason:'Costo adicional de retorno'});
 assert.equal((await costs(s)).total,'42000');assert.equal(s.received_cop,'0');assert.equal(s.status,'returned');
 assert.equal((await sql('select count(*)::int n from cash_movements where sale_id=$1',[s.sale_id]))[0].n,0);
});
test('anticipo ya registrado como gasto se asigna al margen sin duplicar gasto, ledger ni caja',async()=>{
 const c=await pool.connect();let expense;
 try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);expense=(await c.query("select erp_create_operating_expense('transporte','Flete anticipado TEST',30000,'transferencia',null,null,(now() at time zone 'America/Bogota')::date) id")).rows[0].id;await c.query('commit');}finally{c.release();}
 const movement=(await sql("select id from cash_movements where expense_id=$1 and movement_type='expense'",[expense]))[0].id;
 let s=await fixture({concept:freight('30000',{settlement:'prepaid',prepaymentMovementId:movement})});
 async function report(){const c=await pool.connect();try{await c.query('begin');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);const r=(await c.query('select erp_business_report(current_date-1,current_date) data')).rows[0].data;await c.query('commit');return r;}finally{c.release();}}
 const before=await report();s=await deliver(s);const after=await report();
 assert.equal(s.transport_company_cost_cop,'30000');assert.equal(s.transport[0].allocated_expense_cop,'30000');assert.equal((await costs(s)).total,'0');
 assert.equal(after.knownNetResultCop,before.knownNetResultCop);assert.equal(after.operatingExpensesCop,before.operatingExpensesCop);
 const allocated=await sql("select set_config('request.jwt.claim.sub',$1,false)",[actor]);assert.ok(allocated);
 const margin=await sql('select * from erp_shipping_expense_allocations($1)',[[s.sale_id]]);assert.equal(margin[0].amount_cop,'30000');
 assert.equal((await sql('select count(*)::int n from cash_movements where expense_id=$1',[expense]))[0].n,1);assert.equal(s.expected_net_cop,'700000');
});
test('diferencia sin causa queda pendiente y no se transforma en gasto',async()=>{
 let s=await deliver(await fixture());const result=await command('reconcile',deposit(s,'665000',{finalSettlement:true}));s=await command('detail',{id:s.id});
 assert.equal(s.received_cop,'665000');assert.equal(s.balance_cop,'5000');assert.equal(s.collection_differences[0].difference_cop,'-5000');assert.equal(s.collection_differences[0].status,'pending');assert.equal((await costs(s)).total,'30000');
 await command('difference_review',{id:s.collection_differences[0].id,reason:'Se solicita explicación; no existe concepto confirmado',confirmed:true});assert.equal((await costs(s)).total,'30000');
 const row=await sql('select amount_cop::text amount from cash_movements where id=$1',[result.cashMovementId]);assert.equal(row[0].amount,'665000');
 await command('reverse_deposit',{id:result.depositId,confirmed:true,reason:'Consignación de prueba revertida para revisar saldo'});
 s=await command('detail',{id:s.id});assert.equal(s.transport_review_required,false);assert.equal(s.received_cop,'0');assert.equal(s.collection_differences[0].status,'reversed');assert.equal((await costs(s)).total,'30000');
});
test('exceso conserva efectivo como crédito y su aplicación no crea otra entrada',async()=>{
 let s=await deliver(await fixture());const d=await command('reconcile',deposit(s,'675000',{finalSettlement:true}));
 assert.equal((await sql('select unallocated_cop::text credit from erp_shipping_deposits where id=$1',[d.depositId]))[0].credit,'5000');
 s=await command('detail',{id:s.id});s=await command('transport_save',{id:s.id,version:s.version,concept:freight('25000'),confirmed:true,reason:'Se confirmó flete menor'});
 const args={id:s.id,version:s.version,depositId:d.depositId,amountCop:'5000',confirmed:true};const outcomes=await Promise.allSettled([command('apply_deposit_credit',args),command('apply_deposit_credit',args)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 assert.equal((await costs(s)).total,'25000');s=await command('detail',{id:s.id});assert.equal(s.received_cop,'675000');assert.equal(s.collection_status,'reconciled');
 assert.equal((await sql("select count(*)::int n from cash_movements where metadata->>'shippingDepositId'=$1",[d.depositId]))[0].n,1);
});
test('permisos, versión e idempotencia impiden dos imputaciones simultáneas',async()=>{
 let s=await deliver(await fixture());const args={id:s.id,version:s.version,concept:freight('32000'),confirmed:true,reason:'Ajuste concurrente confirmado'};
 await assert.rejects(command('transport_save',args,key(),seller),/permission_denied/);
 const outcomes=await Promise.allSettled([command('transport_save',args),command('transport_save',args)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal((await costs(s)).total,'32000');
});
