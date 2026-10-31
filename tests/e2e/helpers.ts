import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {anonKey,serviceKey,baseUrl,testPassword} from '../../scripts/operational/browser-env.mjs';
export const localAdmin=createClient(baseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
export async function createOperator(role='admin'){
 const email=`erp-${randomUUID()}@example.test`;
 const created=await localAdmin.auth.admin.createUser({email,password:testPassword,email_confirm:true});
 if(created.error||!created.data.user)throw created.error??new Error('No user');
 const id=created.data.user.id;
 const p=await localAdmin.from('profiles').insert({id,email,is_admin:role==='admin',erp_role:role,active:true,display_name:'Empleado sintético'});if(p.error)throw p.error;
 const client=createClient(baseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const session=await client.auth.signInWithPassword({email,password:testPassword});if(session.error||!session.data.session)throw session.error??new Error('No session');
 return {id,email,password:testPassword,client,token:session.data.session.access_token};
}
export async function login(page:Page,operator:{email:string;password:string;client?:SupabaseClient;token?:string}){
 await page.goto('/admin/login');
 await page.locator('input[type="email"]').fill(operator.email);await page.locator('input[type="password"]').fill(operator.password);
 await page.getByRole('button',{name:/ingresar|entrar|iniciar sesión/i}).click();
 await page.waitForURL(url=>url.pathname.startsWith('/admin')&&url.pathname!=='/admin/login');
 // Una sola sesión por usuario: el ingreso por pantalla cierra la sesión creada por createOperator; se renueva para las llamadas directas.
 if(operator.client){const again=await operator.client.auth.signInWithPassword({email:operator.email,password:operator.password});if(again.data.session)operator.token=again.data.session.access_token;}
}
export async function rpc(client:SupabaseClient,name:string,args:Record<string,unknown>){const r=await client.rpc(name,args);if(r.error)throw new Error(`${name}: ${r.error.message}`);return r.data;}
