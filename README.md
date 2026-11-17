# ROUX Joyas 18K — tienda PWA (React + Vite + Supabase)

Tienda de joyería con catálogo real (267 piezas del catálogo de Canva), **precio del oro y metales en vivo**, carrito, **ticket en PDF e imagen** y envío del pedido por **WhatsApp**. Es una PWA instalable en el celular.

## Funcionalidades

- **Banner en vivo** de oro 24K / 22K / 18K / 14K / 10K, plata, platino y paladio, en COP por gramo. Se actualiza cada 60 s.
- Catálogo por categorías (13), búsqueda, orden por precio/nombre y "Ver más".
- Carrito persistente y formulario de envío (nombre, teléfono, ciudad, dirección, nota).
- Al terminar el pedido se crea un **ticket en PDF y PNG**, se suben a Supabase Storage y se abre WhatsApp al **3226532681** con el mensaje y los **enlaces** al ticket.
- **Panel de administración oculto**: toca **3 veces seguidas el logo** (cabecera) → clave de administrador. Permite editar precios (en línea), editar/crear/borrar joyas, categorías, pegar enlaces de imagen de Google Drive, ver pedidos y cambiar la clave.
- Diseño dinámico: botones tipo píldora, tarjetas redondeadas con retroiluminación dorada que sigue al cursor.
- PWA: instalable, funciona sin conexión (tienda y fotos vistas), íconos y manifiesto.

## Fuente del precio de los metales

- Metales: [gold-api.com](https://api.gold-api.com/price/XAU) (gratis, sin llave, CORS habilitado). Símbolos `XAU`, `XAG`, `XPT`, `XPD`, en USD por onza troy.
- Dólar → peso: [open.er-api.com](https://open.er-api.com/v6/latest/USD).
- Cálculo: `USD/oz ÷ 31,1034768 × COP por USD`. Kilates: 24K = 100 %, 22K = 91,67 %, 18K = 75 %, 14K = 58,3 %, 10K = 41,7 %.
- Son precios spot de referencia internacional (no incluyen margen de mercado local).

## Base de datos — Supabase

| Dato | Valor |
| --- | --- |
| Proyecto | https://zvgklnfyhflsdtybdwhz.supabase.co |
| Llave pública (publishable) | `sb_publishable_Rhzzhh7H0ywsylcg_hxp-Q_0dTTuP-8` |
| Correo de la cuenta de Supabase | eventox2023@gmail.com |

La llave *publishable* está hecha para usarse en el navegador; la seguridad real la dan las políticas RLS y las funciones de `supabase/schema.sql`. **Nunca pongas la llave `secret`/`service_role` en este repositorio.**

### Instalar la base (una sola vez)

1. Entra a Supabase con el correo de arriba → proyecto → **SQL Editor**.
2. Pega y ejecuta `supabase/schema.sql` (tablas, políticas, funciones de admin y bucket `tickets`).
3. Pega y ejecuta `supabase/seed.sql` (13 categorías y 267 productos con precios de ejemplo).

Hasta que lo hagas, la tienda funciona con el catálogo incluido; los tickets se descargan y el cliente los adjunta a mano; y los cambios de admin se guardan solo en ese navegador.

### Clave del administrador

Por defecto es `123` y se valida **en el servidor** (función `admin_check`, guardada con hash bcrypt). Cámbiala en el panel (Ajustes) o con SQL:

```sql
update public.app_secrets set value = extensions.crypt('TU_NUEVA_CLAVE', extensions.gen_salt('bf')) where key = 'admin_hash';
```

> Una clave corta como `123` se puede adivinar. Cámbiala por una más larga antes de publicar la tienda.

### Imágenes desde Google Drive

Sube la foto a Drive → Compartir → **"Cualquier persona con el enlace"** → pega el enlace en el campo de imagen. La tienda lo convierte a una URL visible (`drive.google.com/thumbnail?id=…`).

## Ejecutar localmente

Requiere Node.js 18+.

```bash
npm install
npm run dev
```

Variables opcionales (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`.

## Publicar

```bash
npm run build
```

Sube la carpeta `dist/` a cualquier hosting estático (Vercel, Netlify, Cloudflare Pages…). Debe servirse por HTTPS para que la PWA y el service worker funcionen.

## Si la página sale en blanco

- **No abras `index.html` ni `dist/index.html` con doble clic.** Los módulos de JavaScript no cargan desde `file://`. Usa `npm run dev` (desarrollo) o `npm run preview` (versión compilada), o publica la carpeta `dist/`.
- Después de actualizar el código ejecuta `npm install` otra vez (hay dependencias nuevas: Supabase y jsPDF).
- El hosting debe servir los `.js` con tipo `text/javascript`. El servidor simple de Python en Windows los sirve como texto y deja la página en blanco; usa `npm run preview` o un hosting real (Vercel, Netlify, GitHub Pages).
- La tienda funciona en la raíz del dominio o en una subcarpeta (por ejemplo GitHub Pages).
- Si ves una versión vieja o rota, borra los datos del sitio: DevTools → Application → Service Workers → *Unregister*, y recarga con Ctrl+Shift+R.

## Estructura

```
src/App.jsx        tienda, carrito, checkout y ticket
src/Admin.jsx      panel oculto de administración
src/GoldBar.jsx    banner de metales en vivo (src/metals.js = datos)
src/ticket.js      ticket en canvas → PNG y PDF, subida a Supabase Storage
src/store.js       Supabase + respaldo local + enlaces de Drive
src/catalog.json   catálogo inicial (también en supabase/seed.sql)
public/catalogo/   fotos recortadas del catálogo de Canva
public/sw.js       service worker (PWA)
supabase/          schema.sql y seed.sql
```

## Notas

- Precios del catálogo: **aleatorios de ejemplo** por categoría; el administrador los ajusta desde el panel.
- Las fotos fueron capturadas del catálogo de Canva a la resolución de pantalla; para mayor nitidez, reemplázalas con enlaces de Drive desde el panel.
- Contacto de la tienda: Instagram @Rouxjoyas18k · C.C Pioneros Cra 51 #45-75 local 209.
