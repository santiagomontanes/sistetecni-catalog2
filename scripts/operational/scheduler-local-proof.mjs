// Instala sólo un timer TRANSITORIO de prueba, URL loopback y secretos sintéticos.
// Se detiene en finally; nunca instala los timers definitivos ni envía WhatsApp.
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {appEnv,appUrl} from './browser-env.mjs';
if(!appUrl.startsWith('http://127.0.0.1:'))throw Error('local_app_required');
const name='sistetecni-operational-test-'+randomUUID().slice(0,8),dir=await mkdtemp(join(tmpdir(),'sistetecni-operational-timer-'));
const envFile=join(dir,'jobs.env'),state=join(dir,'state');
await writeFile(envFile,`ERP_JOBS_BASE_URL=${appUrl}\nERP_SHIPPING_CRON_SECRET=${appEnv.ERP_SHIPPING_CRON_SECRET}\nATTENDANCE_RETENTION_SECRET=${appEnv.ATTENDANCE_RETENTION_SECRET}\nERP_JOBS_STATE_DIR=${state}\n`,{mode:0o600});
function run(command,args){const r=spawnSync(command,args,{encoding:'utf8'});if(r.status!==0)throw Error('local_scheduler_command_failed');return r.stdout;}
try{
 run('systemd-run',['--user','--collect','--unit='+name,'--on-active=1s','--on-unit-active=5s','--timer-property=AccuracySec=1s','--property=WorkingDirectory='+process.cwd(),'--property=EnvironmentFile='+envFile,process.execPath,resolve('scripts/operational/run-jobs.mjs'),'--run']);
 let status;const deadline=Date.now()+45000;
 while(Date.now()<deadline){try{status=JSON.parse(await readFile(join(state,'status.json'),'utf8'));if(status.runs>=2)break;}catch{}await new Promise(done=>setTimeout(done,500));}
 if(!status||status.runs<2||status.errors.length)throw Error('local_scheduler_not_verified');
 console.log(JSON.stringify({installedTemporarily:true,scope:'loopback-synthetic',unit:name,runs:status.runs,lastSuccessAt:status.lastSuccessAt,shipping:status.shipping,retention:status.retention,messagesSent:0,stateDirectory:state,permanentTimersInstalled:false,stoppedAfterVerification:true}));
}finally{
 spawnSync('systemctl',['--user','stop',name+'.timer',name+'.service'],{stdio:'ignore'});
 spawnSync('systemctl',['--user','reset-failed',name+'.service'],{stdio:'ignore'});
}
