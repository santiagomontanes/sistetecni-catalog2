# Sistetecni Catalog — Manual completo (Firebase + Admin RBAC)

Este proyecto usa **Next.js (App Router) + TypeScript + Tailwind + Firebase (Auth, Firestore, Storage, Hosting)**.
La salida es estática (`output: "export"`), por lo que el despliegue está pensado para **Firebase Hosting sirviendo `out/`**.

## 1) Prerrequisitos

- Node.js 20+
- npm 10+
- Firebase CLI

Instalar Firebase CLI globalmente:

```bash
npm install -g firebase-tools
```

Verificar:

```bash
node -v
npm -v
firebase --version
```

---

## 2) Instalación del proyecto

```bash
npm install
```

Crear variables de entorno locales:

```bash
cp .env.example .env.local
```

---

## 3) Configuración en Firebase Console

### 3.1 Crear proyecto

1. Ir a Firebase Console.
2. Crear un proyecto nuevo.
3. Registrar app Web y copiar configuración.

### 3.2 Habilitar Authentication (Email/Password)

1. **Authentication** → **Sign-in method**.
2. Activar **Email/Password**.

### 3.3 Crear Firestore Database

1. **Firestore Database** → **Create database**.
2. Seleccionar región.
3. Crear base (modo de prueba inicialmente si necesitas arrancar rápido, luego publica reglas seguras).

### 3.4 Crear Firebase Storage

1. **Storage** → **Get started**.
2. Seleccionar región.
3. Crear bucket.

---

## 4) Variables de entorno

Completa `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

> Si falta alguna variable, la app puede fallar al inicializar Firebase o lanzar errores de permisos.

---

## 5) Modelo de seguridad RBAC (Admin)

El control de acceso administrativo se basa en documentos de Firestore:

- Colección: `roles`
- Documento: `roles/{uid}` (donde `uid` = `auth.uid`)
- Campos esperados:

```json
{
  "role": "admin",
  "active": true,
  "email": "admin@tu-dominio.com"
}
```

### Reglas clave

- El frontend **no puede** auto-asignarse admin.
- `roles/{uid}` no se puede escribir desde cliente.
- Para operar como admin se exige:
  - usuario autenticado,
  - `roles/{uid}` existente,
  - `role == "admin"`,
  - `active == true`.

---

## 6) Crear usuario admin (paso a paso)

### 6.1 Crear usuario en Auth

1. Firebase Console → **Authentication** → **Users**.
2. **Add user** con email/contraseña.
3. Copiar el `uid` del usuario.

### 6.2 Crear documento `roles/{uid}`

1. Firebase Console → **Firestore** → colección `roles`.
2. Crear documento manual con ID igual al `uid`.
3. Campos:
   - `role`: `"admin"`
   - `active`: `true`
   - `email`: correo del admin

Con eso el usuario podrá acceder a `/admin/dashboard`.

---

## 7) Ejecutar en desarrollo

```bash
npm run dev
```

Rutas importantes:

- Público: `/`, `/catalog`, `/product?id=...`, `/contact`
- Admin login: `/admin/login`
- Admin dashboard (protegido): `/admin/dashboard`

Comportamiento esperado:

- Sin sesión en `/admin/dashboard` → redirige a `/admin/login`.
- Usuario autenticado sin rol admin activo → “Acceso denegado”.
- Usuario admin activo → acceso completo CRUD de productos + subida de imágenes.

---

## 8) CRUD de productos e imágenes

En el dashboard admin se puede:

- Crear productos.
- Editar productos.
- Eliminar productos (con confirmación).
- Subir imágenes a Storage en ruta:
  - `products/{productId}/{uuid}.ext`
- Guardar URLs públicas en `product.images[]`.

---

## 9) Build estático (`out/`)

```bash
npm run build
```

Con `output: "export"`, Next.js genera archivos estáticos en `out/`.

---

## 10) Configuración de Hosting + Rewrites

Se incluye `firebase.json` con:

- `hosting.public = "out"`
- rewrite global a `/index.html` para fallback SPA y evitar 404 en refresh de rutas.

Esto permite abrir directamente rutas como `/admin/login` o `/catalog` en Hosting sin errores de refresh.

---

## 11) Inicializar Firebase CLI en el repo

Inicia sesión:

```bash
firebase login
```

Usa el proyecto:

```bash
firebase use YOUR_FIREBASE_PROJECT_ID
```

> También puedes editar `.firebaserc` y reemplazar `YOUR_FIREBASE_PROJECT_ID`.

---

## 12) Deploy de reglas

Deploy de reglas Firestore:

```bash
firebase deploy --only firestore:rules
```

Deploy de reglas Storage:

```bash
firebase deploy --only storage
```

Deploy conjunto de reglas:

```bash
firebase deploy --only firestore:rules,storage
```

---

## 13) Deploy de Hosting

Primero genera build estático:

```bash
npm run build
```

Luego despliega Hosting:

```bash
firebase deploy --only hosting
```

Deploy completo (hosting + reglas):

```bash
firebase deploy --only hosting,firestore:rules,storage
```

---

## 14) Troubleshooting

### Error: `permission-denied`

- Verifica sesión iniciada en admin.
- Verifica que exista `roles/{uid}`.
- Verifica campos exactos:
  - `role: "admin"`
  - `active: true`
- Publica reglas actualizadas (`firebase deploy --only firestore:rules,storage`).

### Error por variables faltantes

- Revisa `.env.local`.
- Reinicia `npm run dev` tras cambiar variables.
- Confirma que `NEXT_PUBLIC_FIREBASE_PROJECT_ID` y `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` correspondan al mismo proyecto.

### Rutas 404 en Hosting al refrescar

- Asegura `firebase.json` con rewrite `"**" -> "/index.html"`.
- Recompila (`npm run build`) y redeploy (`firebase deploy --only hosting`).

### Login admin no avanza al dashboard

- Revisa si el login es correcto en Auth.
- Si entra pero ve “Acceso denegado”, falta rol admin activo en Firestore.

---

## 15) Comandos rápidos (resumen)

Desarrollo:

```bash
npm run dev
```

Build estático:

```bash
npm run build
```

Deploy reglas:

```bash
firebase deploy --only firestore:rules,storage
```

Deploy hosting:

```bash
firebase deploy --only hosting
```

Deploy completo:

```bash
firebase deploy --only hosting,firestore:rules,storage
```
