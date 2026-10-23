import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function runOperationalJobs({baseUrl,shippingSecret,retentionSecret,stateDir,maxBatches=20,allowRemote=false,fetchImpl=fetch}){
 const target=new URL(baseUrl);const local=['127.0.0.1','localhost','[::1]'].includes(target.hostname);
 if(target.username||target.password||target.search||target.hash||target.pathname!=='/')throw Error('invalid_jobs_origin');
 if(!local&&(!allowRemote||target.protocol!=='https:'))throw Error('remote_jobs_require_explicit_https_activation');
 if(local&&!['http:','https:'].includes(target.protocol))throw Error('invalid_jobs_origin');
 if([shippingSecret,retentionSecret].some(v=>typeof v!=='string'||v.length<32))throw Error('job_secrets_not_configured');
 if(!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>100)throw Error('job_batch_limit_invalid');
 async function post(path,secret){
  let last;for(let attempt=0;attempt<3;attempt++){
   try{const response=await fetchImpl(target.origin+path,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(20000)});
    if(!response.ok){const e=Error(`job_http_${response.status}`);if(response.status<500)throw e;last=e;continue;}
    return await response.json();
   }catch(error){last=error;if(/^job_http_4/.test(error.message))throw error;}
  }throw last;
 }
 const startedAt=new Date().toISOString(),result={startedAt,finishedAt:null,shipping:null,retention:{examined:0,deleted:0,failed:0,batches:0,limited:false},errors:[]};
 try{result.shipping=await post('/api/admin/shipments/jobs',shippingSecret);}catch{result.errors.push('shipping_job_failed');}
 try{for(let i=0;i<maxBatches;i++){const batch=await post('/api/internal/attendance/retention',retentionSecret);result.retention.batches++;for(const k of ['examined','deleted','failed'])result.retention[k]+=Number(batch[k]??0);if(!batch.hasMore)break;if(i===maxBatches-1)result.retention.limited=true;}}catch{result.errors.push('retention_job_failed');}
 result.finishedAt=new Date().toISOString();
 if(stateDir){const dir=resolve(stateDir);await mkdir(dir,{recursive:true,mode:0o700});let prior={};try{prior=JSON.parse(await readFile(resolve(dir,'status.json'),'utf8'));}catch{}
  const status={...result,runs:Number(prior.runs??0)+1,lastSuccessAt:result.errors.length?prior.lastSuccessAt??null:result.finishedAt};
  const temporary=resolve(dir,`status-${process.pid}.tmp`);await writeFile(temporary,JSON.stringify(status,null,2),{mode:0o600});await rename(temporary,resolve(dir,'status.json'));
 }
 return result;
}
async function cli(){
 if(!process.argv.includes('--run')){console.log(JSON.stringify({mode:'check',implemented:true,installed:false,messagesSent:0,configured:Boolean(process.env.ERP_JOBS_BASE_URL&&process.env.ERP_SHIPPING_CRON_SECRET&&process.env.ATTENDANCE_RETENTION_SECRET)}));return;}
 const result=await runOperationalJobs({baseUrl:process.env.ERP_JOBS_BASE_URL,shippingSecret:process.env.ERP_SHIPPING_CRON_SECRET,retentionSecret:process.env.ATTENDANCE_RETENTION_SECRET,stateDir:process.env.ERP_JOBS_STATE_DIR,allowRemote:process.argv.includes('--allow-remote')});
 console.log(JSON.stringify(result));if(result.errors.length||result.retention.failed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await cli();
