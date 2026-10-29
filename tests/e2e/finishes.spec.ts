import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createOperator,localAdmin,login,rpc} from './helpers';

test('estética web, dos acabados, fotos reales, stock público y snapshot de venta',async({page,request})=>{
 test.setTimeout(150000);
 const operator=await createOperator();
 const command=(action:string,payload:Record<string,unknown>)=>rpc(operator.client,'erp_workshop_command',{p_action:action,p_payload:payload,p_key:randomUUID()});
 const finish=(action:string,payload:Record<string,unknown>)=>rpc(operator.client,'erp_finish_command',{p_action:action,p_payload:payload,p_key:randomUUID()});
 const read=(unit:string)=>rpc(operator.client,'erp_workshop_read',{p_unit_id:unit});
 await command('configure',{enabled:true});
 const location=await command('location',{code:`F-${randomUUID().slice(0,8).toUpperCase()}`,name:'Estética sintética'});
 const title=`FICTICIO acabado ${randomUUID().slice(0,8)}`;
 const product=await localAdmin.from('products').insert({title,price:100000,ram:64,cpu:'CPU genérica NO publicar',visible_web:false,erp_stock_enabled:true}).select('id').single();
 if(product.error)throw product.error;
 const units:string[]=[],finishIds:string[]=[];
 await login(page,operator);
 for(let i=0;i<2;i++){
  const qr=await command('qr_batch',{count:1});
  const received=await command('receive',{qrCode:qr.labels[0].code,locationId:location.id,condition:'good',snapshot:{physical:'good',powersOn:'unchecked',video:'unchecked',screenType:'unknown',chargerReceived:'unchecked',components:[{kind:'ram',capacityGb:i?8:4,generation:'DDR4'}]}});
  units.push(received.unitId);
  await page.goto(`/admin/taller?unit=${received.unitId}`);
  await page.getByRole('tab',{name:/Fase 3/}).click();
  const aesthetic=page.locator('section').filter({has:page.getByRole('heading',{name:'Estética y catálogo',exact:true})}).last();
  await aesthetic.getByLabel('Buscar producto en estética').fill(title);
  await aesthetic.getByRole('button',{name:'Buscar',exact:true}).click();
  await aesthetic.getByLabel(/^Producto/).selectOption(product.data.id);
  await aesthetic.getByText('Crear acabado',{exact:true}).click();
  await aesthetic.getByLabel('Nombre del acabado').fill(i?'Gris chinas':'Gris 3D');
  await aesthetic.getByLabel('Color base').fill('Gris');
  await aesthetic.getByLabel('Diseño o textura').fill(i?'chinas':'3D');
  await aesthetic.getByRole('button',{name:'Guardar acabado',exact:true}).click();
  await expect(aesthetic.getByText('Guardado.',{exact:true})).toBeVisible();
  const finishes=await operator.client.from('product_finishes').select('id,name').eq('product_id',product.data.id).eq('name',i?'Gris chinas':'Gris 3D').single();
  if(finishes.error)throw finishes.error;finishIds.push(finishes.data.id);
  await aesthetic.getByLabel(/^Acabado/).selectOption(finishes.data.id);
  await aesthetic.getByLabel(/Fotos públicas del acabado/).setInputFiles({name:`acabado-${i}.png`,mimeType:'image/png',buffer:await page.screenshot()});
  await expect(aesthetic.getByText('Foto del acabado guardada.',{exact:true})).toBeVisible();
  await aesthetic.getByLabel('Precio de configuración').fill(i?'120000':'100000');
  await aesthetic.getByLabel('Revisé el acabado, las características y el precio de esta unidad.').check();
  await aesthetic.getByRole('button',{name:'Asociar y validar unidad',exact:true}).click();
  await expect(aesthetic.getByText('Guardado.',{exact:true})).toBeVisible();
  for(const d of (await read(received.unitId)).definitions.filter((x:{active:boolean;required:boolean})=>x.active&&x.required)){
   await command('check',{unitId:received.unitId,version:(await read(received.unitId)).unit.row_version,code:d.code,result:'passed',note:'Prueba sintética del flujo'});
  }
  await command('phase',{unitId:received.unitId,version:(await read(received.unitId)).unit.row_version,phase:'ready'});
 }
 await finish('publish',{productId:product.data.id,confirmed:true});
 await page.goto(`/product?id=${product.data.id}`);
 await expect(page.getByRole('heading',{name:'Gris 3D',exact:true})).toBeVisible();
 const first=page.getByAltText(`${title} Gris 3D`,{exact:true});const firstUrl=await first.getAttribute('src');
 expect((await request.get(firstUrl!)).ok()).toBe(true);
 await page.getByRole('button',{name:/Gris chinas/}).click();
 await expect(page.getByRole('heading',{name:'Gris chinas',exact:true})).toBeVisible();
 const secondUrl=await page.getByAltText(`${title} Gris chinas`,{exact:true}).getAttribute('src');
 expect(secondUrl).not.toBe(firstUrl);expect((await request.get(secondUrl!)).ok()).toBe(true);
 await expect(page.getByText('64 GB',{exact:true})).toHaveCount(0);
 await expect(page.getByText('CPU genérica NO publicar',{exact:true})).toHaveCount(0);
 const saleId=await rpc(operator.client,'erp_create_sale_with_units',{
  p_customer_id:null,p_customer_name:'Cliente FICTICIO acabados',p_customer_document:'00001',p_customer_phone:'3000000000',p_customer_email:null,
  p_items:[{itemType:'catalog',productId:product.data.id,productUnitId:units[1],quantity:1,unitPriceCop:120000}],p_discount_cop:0,p_payment_method:'transferencia',p_payment_status:'pendiente',p_warranty_months:6,p_notes:'Prueba sintética',p_idempotency_key:randomUUID()
 });
 const item=await operator.client.from('sale_items').select('*').eq('sale_id',saleId).single();if(item.error)throw item.error;
 expect(item.data.product_specs.ram).toBe(8);expect(item.data.original_unit_price_cop).toBe(120000);expect(item.data.product_name).toContain('Gris chinas');
 expect(item.data.unit_spec_overrides_snapshot.finishId).toBe(finishIds[1]);
 await page.reload();await expect(page.getByRole('button',{name:/Gris chinas/})).toHaveCount(0);
 await expect(page.locator('[aria-label="Acabados disponibles"]').getByRole('button',{name:/Gris 3D/})).toBeVisible();
 const pdf=await request.get('/api/admin/catalog/pdf',{headers:{Authorization:`Bearer ${operator.token}`}});
 expect(pdf.status()).toBe(200);expect((await pdf.body()).subarray(0,4).toString()).toBe('%PDF');
 for(let i=0;i<2;i++){
  const receipt=await request.get(`/api/admin/sales/${saleId}/pdf`,{headers:{Authorization:`Bearer ${operator.token}`}});
  expect(receipt.status()).toBe(200);expect((await receipt.body()).subarray(0,4).toString()).toBe('%PDF');
 }
 const sales=await operator.client.from('sales').select('id',{count:'exact'}).eq('id',saleId);
 expect(sales.count).toBe(1);
 await page.goto('/admin/reportes');
 await page.getByRole('button',{name:'Consultar operación',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Ventas por acabado',exact:true})).toBeVisible();
});
