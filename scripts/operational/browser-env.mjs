import {createHmac} from 'node:crypto';
// Credenciales EXCLUSIVAS del entorno sintético loopback. No sirven en Supabase remoto.
export const jwtSecret='local-synthetic-operational-test-secret-minimum-32';
function jwt(role){const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const body=Buffer.from(JSON.stringify({role,iss:'supabase',iat:1700000000,exp:2200000000})).toString('base64url');const value=`${header}.${body}`;return `${value}.${createHmac('sha256',jwtSecret).update(value).digest('base64url')}`;}
export const anonKey=jwt('anon'),serviceKey=jwt('service_role');
export const baseUrl='http://127.0.0.1:55436',appUrl='http://127.0.0.1:3100';
export const browserDatabase='postgresql://postgres@127.0.0.1:55432/erp_browser';
export const testPassword='Local-synthetic-only-2026!';
export const appEnv={NEXT_PUBLIC_SUPABASE_URL:baseUrl,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,SUPABASE_SERVICE_ROLE_KEY:serviceKey,
 NEXT_PUBLIC_APP_ENV:'staging',APP_ENV:'staging',ERP_SHIPPING_ENABLED:'true',
 ERP_AGENT_CONTROL_ENABLED:'true',ERP_AGENT_SHARED_SECRET:'local-shipping-agent-test-secret-minimum-32-characters',ATTENDANCE_RETENTION_SECRET:'local-retention-test-secret-at-least-32-characters',
 ERP_SHIPPING_CRON_SECRET:'local-shipping-test-secret-at-least-32-characters'};
