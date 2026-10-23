/** Opciones de red exclusivamente para piloto local. Sin secretos remotos. */
import {appEnv} from './browser-env.mjs';
import {isIP} from 'node:net';
export function pilotEnvironment(env=process.env){
 const url=new URL(env.ERP_PILOT_ORIGIN??'https://localhost:3443');
 const host=url.hostname;
 const privateHost=host==='localhost'||host==='127.0.0.1'||(isIP(host)===4&&(/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)));
 if(!privateHost||url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw Error('pilot_requires_private_https_origin');
 return {...appEnv,NEXT_PUBLIC_SUPABASE_URL:url.origin+'/supabase',ERP_PILOT_ORIGIN:url.origin};
}
