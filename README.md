# Sistetecni V1

Sitio web V1 de Sistetecni construido con **Next.js (App Router) + TypeScript + Tailwind + Firebase SDK v9 modular**.

## Requisitos

- Node.js 20+
- npm 10+

## Configuración

1. Instala dependencias:

```bash
npm install
```

2. Crea tu archivo de entorno local:

```bash
cp .env.example .env.local
```

3. Completa las variables de Firebase en `.env.local`.

## Variables de entorno

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## Desarrollo

```bash
npm run dev
```

## Build de producción (estático)

```bash
npm run build
```

La configuración de Next genera salida estática con `output: "export"` y assets listos para deploy en Firebase Hosting.
