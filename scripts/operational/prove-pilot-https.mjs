// Prueba de HTTPS local con CA temporal confiada sólo por estos procesos.
// No instala certificados en el sistema ni abre el banco a la red.
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.umask(0o077);
const dir=await mkdtemp(join(tmpdir(),'sistetecni-pilot-tls-'));await chmod(dir,0o700);
const cert=join(dir,'cert.pem'),key=join(dir,'key.pem');
const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=SISTETECNI LOCAL PILOT TEST','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
if(generated.status!==0)throw Error('local_certificate_generation_failed');
const env={...process.env,ERP_PILOT_ORIGIN:'https://localhost:3443',ERP_PILOT_TLS_CERT:cert,ERP_PILOT_TLS_KEY:key,NODE_EXTRA_CA_CERTS:cert};
async function completed(child){return new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('local_https_proof_failed')));});}
await completed(spawn(process.execPath,['scripts/operational/pilot-build.mjs'],{env,stdio:'inherit'}));
const server=spawn(process.execPath,['scripts/operational/pilot-server.mjs'],{env,stdio:'inherit'});
try{
 const proof=`
 import assert from 'node:assert/strict';
 import {readFile} from 'node:fs/promises';
 import {createClient} from '@supabase/supabase-js';
 import {anonKey,serviceKey} from './scripts/operational/browser-env.mjs';
 const origin='https://localhost:3443';let response;
 for(let i=0;i<60;i++){try{response=await fetch(origin+'/admin/login');if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
 assert.equal(response?.status,200);
 const credentials=JSON.parse(await readFile('.operational-pilot/credentials.json','utf8'));
 const operator=credentials.accounts.find(x=>x.role==='admin');
 const client=createClient(origin+'/supabase',anonKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const session=await client.auth.signInWithPassword({email:operator.email,password:operator.password});assert.equal(session.error,null);
 const profile=await client.from('profiles').select('id').eq('id',operator.id).single();assert.equal(profile.error,null);assert.equal(profile.data.id,operator.id);
 const dashboard=await fetch(origin+'/api/admin/attendance',{headers:{Authorization:'Bearer '+session.data.session.access_token}});assert.equal(dashboard.status,200);
 const admin=createClient(origin+'/supabase',serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
 assert.equal((await admin.storage.from('attendance-private').list(operator.id,{limit:1})).error,null);
 console.log(JSON.stringify({scope:'local-synthetic-only',httpsTrustedInProcess:true,auth:true,rest:true,storage:true,serverApi:true,physicalDevicesVerified:false,systemTrustModified:false}));
 `;
 await completed(spawn(process.execPath,['--input-type=module','-e',proof],{env,stdio:'inherit'}));
}finally{
 server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));
}
