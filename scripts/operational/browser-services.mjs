import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import pg from 'pg';
import {anonKey,serviceKey,jwtSecret,browserDatabase,baseUrl} from './browser-env.mjs';
// Crear sólo la base sintética con nombre fijo, sin sobrescribir una existente.
const setup=new pg.Client({connectionString:'postgresql://postgres@127.0.0.1:55432/postgres'});await setup.connect();
if(!(await setup.query("select 1 from pg_database where datname='erp_browser'")).rowCount)await setup.query('create database erp_browser');
await setup.end();
const db=new pg.Client({connectionString:browserDatabase});await db.connect();
await db.query('alter database erp_browser set search_path=public,auth,storage,extensions');
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim();}
async function wait(url){for(let i=0;i<60;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error(`Servicio no inició: ${url}`);}
function container(name,image,env,ports=[]){const prior=spawnSync('docker',['inspect',name],{encoding:'utf8'});if(prior.status===0){docker(['start',name]);return;}docker(['run','--name',name,'--label','sistetecni.test=operational','--network','sistetecni-operational',...ports.flatMap(p=>['-p',p]),...Object.entries(env).flatMap(([k,v])=>['-e',`${k}=${v}`]),'-d',image]);}
if(spawnSync('docker',['network','inspect','sistetecni-operational'],{stdio:'ignore'}).status!==0)docker(['network','create','sistetecni-operational']);
const networks=JSON.parse(docker(['inspect','sistetecni-operational-test']))[0].NetworkSettings.Networks;
if(!networks['sistetecni-operational'])docker(['network','connect','sistetecni-operational','sistetecni-operational-test']);
await db.query('create schema if not exists auth; create schema if not exists storage; create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists "uuid-ossp" with schema extensions;');
// GoTrue es un servicio real. El contenedor iniciado manualmente también es reutilizable.
container('sistetecni-operational-auth','public.ecr.aws/supabase/gotrue:v2.195.0',{
 GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:baseUrl,
 GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgresql://postgres@sistetecni-operational-test:5432/erp_browser',
 GOTRUE_SITE_URL:'http://127.0.0.1:3100',GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',
},['127.0.0.1:55433:9999']);
await wait('http://127.0.0.1:55433/health');
container('sistetecni-operational-rest','public.ecr.aws/supabase/postgrest:v16.1',{
 PGRST_DB_URI:'postgresql://postgres@sistetecni-operational-test:5432/erp_browser',PGRST_DB_SCHEMAS:'public,storage',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtSecret,PGRST_DB_EXTRA_SEARCH_PATH:'public,extensions',
},['127.0.0.1:55434:3000']);
container('sistetecni-operational-storage','public.ecr.aws/supabase/storage-api:v1.69.0',{
 ANON_KEY:anonKey,SERVICE_KEY:serviceKey,POSTGREST_URL:'http://sistetecni-operational-rest:3000',AUTH_JWT_SECRET:jwtSecret,
 DATABASE_URL:'postgresql://postgres@sistetecni-operational-test:5432/erp_browser',STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',GLOBAL_S3_BUCKET:'operational-test',TENANT_ID:'operational-test',REGION:'local',FILE_SIZE_LIMIT:'5242880',ENABLE_IMAGE_TRANSFORMATION:'false',
},['127.0.0.1:55435:5000']);
await wait('http://127.0.0.1:55435/status');
// Funciones de claims idénticas al contrato Supabase/PostgREST; identidad JWT real de GoTrue.
await db.query(`create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
grant all on all tables in schema storage to service_role;
grant select,insert,update,delete on storage.objects to authenticated;
grant select on storage.objects to anon;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,service_role;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage,select on sequences to authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;`);
await db.query('create table if not exists public._operational_test_migrations(name text primary key)');
for(const name of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f>='20260812220000').sort()){
 if((await db.query('select 1 from _operational_test_migrations where name=$1',[name])).rowCount)continue;
 try{await db.query(readFileSync(`supabase/migrations/${name}`,'utf8'));await db.query('insert into _operational_test_migrations values($1)',[name]);console.log('Aplicada en navegador local:',name);}catch(e){throw new Error(`${name}: ${e.message}`);}
}
await db.query("notify pgrst,'reload schema'");await db.end();
console.log('Auth, REST y Storage reales listos en loopback. Iniciar gateway y Next con browser-app.mjs.');
