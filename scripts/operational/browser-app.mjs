import {createServer,request as proxyRequest} from 'node:http';
import {spawn} from 'node:child_process';
import {appEnv} from './browser-env.mjs';
const server=createServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3100');res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']??'authorization,apikey,content-type,x-client-info');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const routes=[['/auth/v1',55433],['/rest/v1',55434],['/storage/v1',55435]];
 const route=routes.find(([prefix])=>req.url.startsWith(prefix));if(!route){res.writeHead(404);res.end();return;}
 const target=proxyRequest({hostname:'127.0.0.1',port:route[1],path:req.url.slice(route[0].length)||'/',method:req.method,headers:{...req.headers,host:`127.0.0.1:${route[1]}`}},upstream=>{for(const [key,value]of Object.entries(upstream.headers))if(value!==undefined&&key!=='access-control-allow-origin')res.setHeader(key,value);res.statusCode=upstream.statusCode??502;upstream.pipe(res);});
 target.on('error',()=>{res.writeHead(502);res.end('local upstream unavailable');});req.pipe(target);
});
server.listen(55436,'127.0.0.1');
const mode=process.argv[2]??'dev';
if(!['dev','start'].includes(mode))throw new Error('Modo permitido: dev o start (build local previo).');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next',mode,'-H','127.0.0.1','-p','3100'],{env:{...process.env,...appEnv},stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{child.kill(signal);server.close();});
child.on('exit',code=>{server.close();process.exitCode=code??1;});
