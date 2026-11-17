export const STORE_NAME = "ROUX Joyas 18K";

// WhatsApp que recibe los pedidos (código de país + número, solo dígitos).
export const WHATSAPP_NUMBER = "573226532681";

// Datos públicos de la tienda (del catálogo).
export const STORE_INSTAGRAM = "Rouxjoyas18k";
export const STORE_ADDRESS = "C.C Pioneros Cra 51 #45-75 local 209";

// Supabase. La llave "publishable" está pensada para el navegador (la seguridad real
// la dan las políticas RLS de supabase/schema.sql). Puedes sobreescribirlas con .env.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://zvgklnfyhflsdtybdwhz.supabase.co";
export const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_Rhzzhh7H0ywsylcg_hxp-Q_0dTTuP-8";

// Respaldo local de la clave de admin cuando Supabase aún no tiene el esquema instalado.
// (Con Supabase listo, la clave se valida en el servidor.)
export const ADMIN_FALLBACK_PASSWORD = "123";
