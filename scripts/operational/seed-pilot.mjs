import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import QRCode from 'qrcode';
import {baseUrl,anonKey,serviceKey,appUrl} from './browser-env.mjs';
process.umask(0o077);
if(!baseUrl.startsWith('http://127.0.0.1:'))throw Error('synthetic_loopback_only');
const dir=resolve('.operational-pilot');await mkdir(dir,{recursive:true,mode:0o700});
try{const previous=JSON.parse(await readFile(resolve(dir,'state.json'),'utf8'));console.log(JSON.stringify({preservedExistingPilot:true,appUrl,credentialsFile:resolve(dir,'credentials.json'),labelsFile:resolve(dir,'labels.html'),unitProductId:previous.productId}));process.exit(0);}catch(error){if(error.code!=='ENOENT')throw error;}
const admin=createClient(baseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}),accounts=[];
for(const role of ['admin','tecnico','vendedor','caja']){
 const email=`pilot-${role}-${randomUUID().slice(0,8)}@example.test`,password=randomBytes(24).toString('base64url');
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw Error('pilot_auth_user_failed');
 const id=created.data.user.id;const profile=await admin.from('profiles').insert({id,email,display_name:`PILOTO ${role}`,is_admin:role==='admin',erp_role:role,active:true});if(profile.error)throw Error('pilot_profile_failed');accounts.push({id,role,email,password});
}
const client=createClient(baseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await client.auth.signInWithPassword(accounts[0]);if(signed.error)throw Error('pilot_login_failed');
async function rpc(name,args){const r=await client.rpc(name,args);if(r.error)throw Error(`pilot_${name}_failed`);return r.data;}
const command=(action,payload)=>rpc('erp_workshop_command',{p_action:action,p_payload:payload,p_key:randomUUID()});
await command('configure',{enabled:true});
await rpc('erp_shipping_command',{p_action:'configure',p_arguments:{enabled:true,recipientIds:[accounts[0].id]},p_request_id:randomUUID()});
await rpc('attendance_command',{p_action:'settings',p_data:{enabled:true,retentionDays:1,reason:'PILOTO local sintético'},p_request_key:randomUUID()});
await rpc('attendance_command',{p_action:'rate',p_data:{employeeId:accounts[1].id,effectiveFrom:new Date(Date.now()-3600000).toISOString(),modality:'hourly',amountCop:'10000',paidLunch:false,reason:'Tarifa exclusivamente de piloto sintético'},p_request_key:randomUUID()});
const suffix=randomUUID().slice(0,5).toUpperCase(),locations=[];
for(const [code,name]of [['REC','Recepción'],['TEC','Preparación técnica'],['EST','Estética'],['BOD','Bodega']])locations.push({...await command('location',{code:`PILOT-${suffix}-${code}`,name:`PILOTO ${name}`}),code:`PILOT-${suffix}-${code}`,name});
const product=await admin.from('products').insert({title:`PILOTO local ${suffix} — equipo de prueba`,brand:'PILOTO',model:'Banco sintético',price:700000,visible_web:false,erp_stock_enabled:true}).select('id,title').single();if(product.error)throw Error('pilot_product_failed');
const components=[];for(let i=0;i<2;i++)components.push(await command('component_receive',{kind:'ram',locationId:locations[1].id,costCop:'30000',componentCondition:'functional',snapshot:{kind:'ram',capacityGb:4,generation:'DDR3',formFactor:'SO-DIMM',notes:'Pieza SINTÉTICA del piloto, no corresponde a stock real'}}));
const qr=await command('qr_batch',{count:3});
const labels=await Promise.all(qr.labels.map(async l=>`<article>${await QRCode.toString(l.code,{type:'svg',margin:3,width:180})}<strong>${l.code}</strong><small>Etiqueta PILOTO — datos de prueba</small></article>`));
await writeFile(resolve(dir,'labels.html'),`<!doctype html><html lang="es"><meta charset="utf-8"><title>QR del piloto local</title><style>body{font-family:sans-serif;display:flex;gap:20px}article{width:220px;text-align:center;break-inside:avoid}strong,small{display:block}@media print{body{gap:12mm}}</style>${labels.join('')}</html>`,{mode:0o600});
await writeFile(resolve(dir,'credentials.json'),JSON.stringify({scope:'local-synthetic-only',appUrl,accounts},null,2),{mode:0o600});
const state={scope:'local-synthetic-only',createdAt:new Date().toISOString(),productId:product.data.id,productTitle:product.data.title,locations,components,labels:qr.labels,roles:accounts.map(({password,...safe})=>safe)};
const temp=resolve(dir,'state.tmp');await writeFile(temp,JSON.stringify(state,null,2),{mode:0o600});await rename(temp,resolve(dir,'state.json'));
console.log(JSON.stringify({scope:state.scope,created:true,accounts:accounts.length,looseRamModules:2,locations:4,freeLabels:3,productPriceCop:'700000',appUrl,credentialsFile:resolve(dir,'credentials.json'),labelsFile:resolve(dir,'labels.html'),stateFile:resolve(dir,'state.json'),productionTouched:false}));
