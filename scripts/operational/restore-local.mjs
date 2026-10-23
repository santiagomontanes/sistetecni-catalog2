import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdtemp,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
process.umask(0o077);
const dir=resolve(process.argv[2]??'');const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
if(manifest.scope!=='local-synthetic-operational'||manifest.productionBackup!==false)throw Error('restore_requires_local_synthetic_backup');
if((await stat(dir)).mode&0o077)throw Error('backup_directory_must_be_private');
for(const [name,expected]of Object.entries(manifest.files)){
 if(!/^[a-z_]+(?:-source)?\.(?:dump|tar)$/.test(name))throw Error('invalid_backup_filename');const hash=createHash('sha256');for await(const part of createReadStream(join(dir,name)))hash.update(part);if(hash.digest('hex')!==expected)throw Error('backup_integrity_failed');
}
async function run(cmd,args,inputFile){return new Promise((done,reject)=>{const p=spawn(cmd,args,{stdio:['pipe','pipe','pipe']});let output='';p.stdout.on('data',d=>output+=d);p.stderr.resume();p.on('error',reject);p.on('exit',code=>code===0?done(output):reject(Error('restore_command_failed')));if(inputFile)createReadStream(inputFile).pipe(p.stdin);else p.stdin.end();});}
const reports=[];const admin=new pg.Client({connectionString:'postgresql://postgres@127.0.0.1:55432/postgres'});await admin.connect();
for(const snapshot of manifest.databases){
 if(!['erp_test','erp_browser'].includes(snapshot.database))throw Error('unexpected_database');
 const target=`erp_restore_${snapshot.database}_${randomUUID().replaceAll('-','').slice(0,8)}`;
 await admin.query(`create database ${target}`);
 await run('docker',['exec','-i','sistetecni-operational-test','pg_restore','-U','postgres','--exit-on-error','--no-owner','--no-acl','-d',target],join(dir,snapshot.file));
 const client=new pg.Client({connectionString:`postgresql://postgres@127.0.0.1:55432/${target}`});await client.connect();
 for(const [table,n]of Object.entries(snapshot.counts)){if(!/^(public|auth|storage)\.[a-z_]+$/.test(table))throw Error('invalid_manifest_table');if((await client.query(`select count(*)::text n from ${table}`)).rows[0].n!==n)throw Error('restored_row_count_mismatch');}
 await client.end();reports.push({source:snapshot.database,restoredDatabase:target,tablesVerified:Object.keys(snapshot.counts).length});
}
await admin.end();
const entries=await run('tar',['-tf',join(dir,'storage.tar')]);for(const name of entries.trim().split('\n'))if(name.startsWith('/')||name.split('/').includes('..'))throw Error('unsafe_storage_archive');
const verbose=await run('tar',['-tvf',join(dir,'storage.tar')]);if(verbose.trim().split('\n').some(line=>!['d','-'].includes(line[0])))throw Error('storage_symlinks_not_allowed');
const restoredStorage=await mkdtemp(join(tmpdir(),'sistetecni-operational-storage-restore-'));await run('tar',['--no-same-owner','--no-same-permissions','-xf',join(dir,'storage.tar'),'-C',restoredStorage]);
console.log(JSON.stringify({scope:'local-synthetic-operational',productionTouched:false,restored:reports,storageRestoredTo:restoredStorage,archiveEntries:entries.trim().split('\n').length,sourceArchivesVerified:true}));
