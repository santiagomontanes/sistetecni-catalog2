# Tarjeta digital de Sistetecni: web, QR y NFC

Dirección permanente: **https://sistetecni.com/tarjeta**.

La tarjeta se aloja en la web de Sistetecni, de forma independiente a Sites y
a la suscripción de ChatGPT. Requiere mantener activos el dominio y el
alojamiento de la web. El visitante necesita conexión a internet.

## QR

- PNG de 1200 × 1200 px: `/tarjeta/sistetecni-qr.png`.
- SVG vectorial para imprenta: `/tarjeta/sistetecni-qr.svg`.
- Hoja A6 lista para imprimir: `/tarjeta/sistetecni-qr-imprimir.pdf`.
- La propia tarjeta tiene el botón «Ver mi QR» para mostrarlo o descargarlo.

El QR contiene directamente la dirección permanente, sin acortadores ni
servicios externos. Tiene corrección Q y margen blanco de cuatro módulos.
Conservar ese margen y el contraste; no recortar el código ni poner un logo
encima. Antes de imprimir una tirada, probar una muestra a tamaño real con
las cámaras de varios teléfonos y con la iluminación del lugar.

## NFC

Usar una etiqueta o tarjeta NFC compatible con NDEF, por ejemplo NTAG213,
NTAG215 o NTAG216. Una NTAG213 tiene espacio suficiente para esta URL.
Para instalar sobre metal, elegir una etiqueta adecuada para esa superficie.

1. En un teléfono o lector con escritura NFC, abrir una aplicación de
   programación NFC y crear **un registro de sitio web/URL (URI NDEF)**.
2. Escribir exactamente `https://sistetecni.com/tarjeta`.
3. Acercar la etiqueta al lector y completar la grabación.
4. Leerla con otro teléfono y comprobar que abre la tarjeta correcta.

El archivo `/tarjeta/enlace-nfc.txt` contiene el enlace para copiar o enviar
al proveedor. Guardar la URL como enlace, no como texto ni como una
automatización personal del teléfono. La grabación requiere acceso físico
a la etiqueta y un dispositivo compatible; no se realiza desde el servidor.

La lectura depende del equipo, de sus ajustes y de la posición de la antena.
En equipos compatibles puede mostrarse una notificación que el usuario debe
tocar para abrir la web. Probar con Android e iPhone antes de distribuirlas.

## Mantener la tarjeta

Editar `public/tarjeta/` y desplegar la web. No cambiar la dirección permanente:
así se pueden actualizar los datos y servicios sin reimprimir el QR ni
regrabar la etiqueta NFC. El contacto vCard se conserva en ese directorio.
No se usa Web NFC: abrir la tarjeta no requiere dar permisos NFC a la web.

`next.config.mjs` sirve `/tarjeta` mediante un rewrite al HTML estático; los
recursos usan rutas absolutas `/tarjeta/...` para funcionar sin barra final.
Compartir siempre usa la dirección canónica, incluso desde una vista previa.

Para regenerar QR, PDF y enlace: `npm run tarjeta:assets`.

Fuentes técnicas:

- [NXP NTAG213/215/216](https://www.nxp.com/products/NTAG213_215_216).
- [Apple: lectura NFC en segundo plano](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading).
