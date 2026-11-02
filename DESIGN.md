# Design: Despacho Azul

Sistema visual de la home de sistetecni.com (rama `rediseno-home`). Idea: el sitio es la mesa de despacho de Sistetecni; cada laptop es un paquete listo para salir.

## Color
- **Azul de marca** `#1A56DB` (`primary`): campo dominante del hero y del cierre, como una bolsa de envío. Texto blanco encima (contraste 6,6:1).
- **Tinta** `#0B1020` (`ink`): texto principal, bordes de filas, sección de redes y pie.
- **Papel** `#EEF2FB` (`paper`): fondos de secciones de apoyo.
- **Cinta** `#FFD400` (`tape`): único acento cálido. Solo para la garantía (sticker), la cinta de embalaje y los estados activos sobre azul.
- Blanco para etiquetas y filas. Verde de WhatsApp sin cambios.

## Tipografía (next/font/google, en layout.tsx)
- **Barlow Condensed** 600–800 en mayúsculas: titulares, botones, nombres de equipo (`font-display`).
- **Barlow** 400–700: texto corrido (`font-body`).
- **Chivo Mono** 500/700: solo datos: precios, RAM, disco, códigos (`font-data`).
- El resto del sitio (admin, catálogo) conserva Inter.

## Componentes y materiales
- **Guía de envío** (HomeHero): etiqueta blanca rotada -2°, código de barras determinista, campos remite/destino/garantía; se imprime de arriba hacia abajo. Sticker amarillo "8 meses" que se despega al tocar.
- **Cinta de embalaje** (TapeMarquee): banda amarilla inclinada, desplazamiento CSS.
- **Seguimiento** (TrackingSteps): cuatro paradas en una línea, no tarjetas iguales.
- **Filas de catálogo** (CatalogRows): columnas fijas (foto · equipo · RAM · disco · precio); precio con dígitos que giran una vez; al pasar el cursor la fila se vuelve azul.
- **Redes** (SocialVideos): dos marcos de teléfono; al tocar cargan el embed oficial de Instagram/Facebook. Sin enlace configurado muestran el acceso al perfil.
- Botones: radio 12 px, 56 px de alto, mayúsculas condensadas. Primario: blanco sobre azul / azul sobre blanco; hover a amarillo o tinta.

## Movimiento
Un momento firmado (la guía que se imprime y el sticker). Entradas con ease-out exponencial; hover 150–200 ms. `prefers-reduced-motion` desactiva animaciones, cinta y barrido.

## Detalles del navegador
Selección amarilla con tinta, foco amarillo (azul sobre fondos claros), barra de scroll azul.

## Contenido y datos
- Último video: editar `src/config/social-feed.ts` (`latestInstagramPost`, `latestFacebookVideo`).
- Perfiles: se toman de `socialLinks` del perfil del negocio (admin) con respaldo en el mismo archivo.

## No hacer
Sin degradados en texto, sin cajas de ícono repetidas, sin cifras destacadas en grande, sin emojis como íconos, sin glassmorphism.
