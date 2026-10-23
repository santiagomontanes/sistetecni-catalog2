import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const name='sistetecni-operational-test';
function run(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout;}
const action=process.argv[2]??'start';
if(action==='stop') {run(['stop',name]); console.log('PostgreSQL local detenido; contenedor y datos conservados.');process.exit(0);}
if(action!=='start')throw new Error('Usar start o stop');
const present=spawnSync('docker',['inspect',name],{encoding:'utf8'});
if(present.status===0)throw new Error('El contenedor de pruebas ya existe. Se conserva; no se borra ni reinicializa.');
run(['run','--name',name,'--label','sistetecni.test=operational','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=erp_test','-p','127.0.0.1:55432:5432','-d','postgres:17-alpine']);
for(let i=0;i<30;i++){const r=spawnSync('docker',['exec',name,'pg_isready','-U','postgres'],{encoding:'utf8'});if(r.status===0)break;await new Promise(r=>setTimeout(r,250));}
function sql(text){return run(['exec','-i',name,'psql','-U','postgres','-d','erp_test','-v','ON_ERROR_STOP=1'],text);}
sql(readFileSync(resolve(root,'scripts/operational/bootstrap.sql'),'utf8'));
// Las dos primeras migraciones son adopción/seguridad de una producción ya existente.
// Un servidor vacío parte de la baseline, tal como especifica migrations/README.md.
for(const file of readdirSync(resolve(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')&&f>='20260812220000').sort()){
 try{sql(readFileSync(resolve(root,'supabase/migrations',file),'utf8'));console.log('Aplicada',file);}
 catch(e){throw new Error(`Falló ${file}: ${e.message}`);}
}
console.log('BD sintética lista: postgresql://postgres@127.0.0.1:55432/erp_test. No se leyó ningún .env.');
