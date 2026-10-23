import {spawn,spawnSync} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {chmod,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import pg from 'pg';
process.umask(0o077);
const container='sistetecni-operational-test',storage='sistetecni-operational-storage';
const inspected=spawnSync('docker',['inspect',container],{encoding:'utf8'});
if(inspected.status!==0)throw Error('local_test_container_missing');
const info=JSON.parse(inspected.stdout)[0];
if(info.Config.Labels?.['sistetecni.test']!=='operational'||!info.NetworkSettings.Ports['5432/tcp']?.every(x=>x.HostIp==='127.0.0.1'&&x.HostPort==='55432'))throw Error('not_isolated_test_database');
const dir=await mkdtemp(join(tmpdir(),'sistetecni-operational-backup-'));await chmod(dir,0o700);
async function archive(command,args,file,input){const output=createWriteStream(join(dir,file),{mode:0o600});const p=spawn(command,args,{stdio:['pipe','pipe','pipe']});p.stdout.pipe(output);p.stderr.resume();p.stdin.end(input);
 await Promise.all([new Promise((done,reject)=>{p.on('error',reject);p.on('exit',code=>code===0?done():reject(Error('backup_command_failed')));}),new Promise((done,reject)=>{output.on('finish',done);output.on('error',reject);})]);
}
async function digest(file){const hash=createHash('sha256');for await(const part of createReadStream(join(dir,file)))hash.update(part);return hash.digest('hex');}
const tables=['public.profiles','public.products','public.product_units','public.sales','public.sale_items','public.cost_entries','public.cash_movements','public.erp_shipments','public.erp_shipping_transport','public.erp_shipping_deposits','public.erp_shipping_allocations','public.erp_shipping_differences','public.erp_shipping_jobs','public.erp_shipping_notifications','public.erp_shipping_notification_deliveries','public.attendance_shifts','public.attendance_evidence','auth.users','storage.objects'];
const manifest={scope:'local-synthetic-operational',createdAt:new Date().toISOString(),productionBackup:false,databases:[],files:{},source:[]};
for(const database of ['erp_test','erp_browser']){
 const client=new pg.Client({connectionString:`postgresql://postgres@127.0.0.1:55432/${database}`});await client.connect();const counts={};
 for(const table of tables)if((await client.query('select to_regclass($1) name',[table])).rows[0].name)counts[table]=(await client.query(`select count(*)::text n from ${table}`)).rows[0].n;
 await client.end();const file=`${database}.dump`;await archive('docker',['exec',container,'pg_dump','-U','postgres','-Fc','--no-owner','--no-acl',database],file);manifest.databases.push({database,file,counts});manifest.files[file]=await digest(file);
}
await archive('docker',['exec',storage,'tar','-C','/var/lib/storage','-cf','-','.'],'storage.tar');manifest.files['storage.tar']=await digest('storage.tar');
for(const [name,repo] of [['erp',process.cwd()],['bot',resolve(process.cwd(),'../sistetecni-bot-operativo')]]){
 const files=spawnSync('git',['-C',repo,'ls-files','-c','-o','--exclude-standard','-z']);if(files.status!==0)throw Error('source_repository_missing');
 const paths=[...new Set(files.stdout.toString().split('\0').filter(p=>p&&!p.split('/').some(part=>part.startsWith('.env')||part==='node_modules'||part==='.git')))];
 const file=`${name}-source.tar`;await archive('tar',['-C',repo,'--null','-T','-','-cf','-'],file,Buffer.from(paths.join('\0')+'\0'));manifest.source.push({name,files:paths.length,file});manifest.files[file]=await digest(file);
}
await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
console.log(JSON.stringify({backupDirectory:dir,scope:manifest.scope,productionBackup:false,databases:manifest.databases.map(d=>d.database),sourceArchives:manifest.source.map(s=>s.name),storage:true}));
