// HTTPS en red privada, con certificado/CA aportados por el operador del piloto.
// Usa exclusivamente las claves sintéticas y servicios Docker del banco local.
import {createServer} from 'node:https';
import {request as proxyRequest} from 'node:http';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {pilotEnvironment} from './pilot-network.mjs';
const env=pilotEnvironment(),origin=new URL(env.ERP_PILOT_ORIGIN);
if(!process.env.ERP_PILOT_TLS_CERT||!process.env.ERP_PILOT_TLS_KEY||!process.env.NODE_EXTRA_CA_CERTS)throw Error('pilot_certificate_key_and_trusted_ca_required');
const server=createServer({cert:readFileSync(process.env.ERP_PILOT_TLS_CERT),key:readFileSync(process.env.ERP_PILOT_TLS_KEY)},(req,res)=>{
 let port=3101,path=req.url;
 if(path.startsWith('/supabase/')){
  const routes=[['/supabase/auth/v1',55433],['/supabase/rest/v1',55434],['/supabase/storage/v1',55435]];
  const route=routes.find(([prefix])=>path===prefix||path.startsWith(prefix+'/')||path.startsWith(prefix+'?'));if(!route){res.writeHead(404);res.end();return;}
  port=route[1];path=path.slice(route[0].length)||'/';
 }
 const proxy=proxyRequest({hostname:'127.0.0.1',port,path,method:req.method,headers:{...req.headers,host:req.headers.host,'x-forwarded-proto':'https'}},upstream=>{res.writeHead(upstream.statusCode??502,upstream.headers);upstream.pipe(res);});
 proxy.on('error',()=>{res.writeHead(502);res.end('Servicio local no disponible');});req.pipe(proxy);
});
server.listen(Number(origin.port||443),origin.hostname);
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3101'],{env:{...process.env,...env},stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{child.kill(signal);server.close();});
child.on('exit',code=>{server.close();process.exitCode=code??1;});
