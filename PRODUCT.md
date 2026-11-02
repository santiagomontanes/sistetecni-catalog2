# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Estudiantes y personas naturales en Colombia que buscan un computador portátil confiable a buen precio y no quieren arriesgarse con un equipo usado sin respaldo. Llegan desde Instagram, Facebook o una recomendación, desde el celular, y cierran la compra o la consulta por WhatsApp. El público de empresas y profesionales existe (el sitio dice "+1000 empresas y profesionales"), pero no es el foco de este rediseño.

## Product Purpose
Sistetecni vende laptops corporativas reacondicionadas desde Bogotá (San Diego, Centro), con 8 meses de garantía, soporte postventa por WhatsApp y envío nacional. El sitio muestra el catálogo y lleva al visitante a escribir por WhatsApp. También presenta Sistetecni POS, su software de ventas e inventario. El éxito es que el visitante confíe lo suficiente como para escribir por WhatsApp.

## Positioning
Equipos corporativos verificados con garantía real de 8 meses y un negocio con gente real detrás: tienda física en Bogotá, video constante en Instagram y Facebook, y atención por WhatsApp que responde en minutos.

## Operating Context
- Catálogo y datos del negocio en Supabase (perfil, productos, testimonios, galería), leídos desde el cliente.
- Compra y soporte por WhatsApp (+57 311 599 6339).
- Instagram: https://www.instagram.com/sistetecni_oficial
- Facebook: https://www.facebook.com/share/1CKGvFvska/
- Panel de administración en /admin; configuración de redes en /admin/configuracion.
- Proyecto Next.js (App Router) + TypeScript + Tailwind, con carpeta `sites/sistetecni-tarjeta` (tarjeta digital NFC/QR) servida en /tarjeta.

## Capabilities and Constraints
- Idioma: español de Colombia.
- Mostrar el último video de Instagram y de Facebook con los embeds oficiales (sin tokens de API). El enlace del último post se actualiza manualmente (decisión del usuario).
- La rama ERP del repositorio (`erp/flujo-operativo-20261022`) está en uso; el rediseño vive en la rama `rediseno-home` y no se publica sin aprobación.
- El panel /admin no es parte de este rediseño.

## Brand Commitments
- Nombre: Sistetecni (el logo parte "Siste" + "tecni").
- Conservar `public/logo.svg` y el azul de marca #1A56DB (decisión del usuario).

## Evidence on Hand
- Fotos de galería en `public/gallery/1.jpg`–`6.jpg`, `public/hero.jpg`, capturas del POS (`public/pos*.png`).
- Cifras que el sitio ya publica: "+1000 equipos vendidos", "8 meses de garantía", "despacho en 24–48 h en Bogotá". No inventar cifras nuevas.
- Testimonios: se cargan desde la base de datos; si no hay, no se fabrican.

## Product Principles
1. La confianza se demuestra con prueba real (equipos, tienda, gente, video), no con adjetivos.
2. Del celular a WhatsApp en un toque: el camino a la conversación siempre está a la vista.
3. Las redes sociales son parte del sitio, no un enlace perdido en el pie.
4. Precio y garantía se dicen claro y sin letra pequeña.
