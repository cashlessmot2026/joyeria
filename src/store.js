import { createClient } from "@supabase/supabase-js";
import { ADMIN_FALLBACK_PASSWORD, SUPABASE_KEY, SUPABASE_URL } from "./config";
import seed from "./catalog.json";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const LOCAL_KEY = "roux-local-catalog";

const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
  } catch {
    return null;
  }
};
const writeLocal = (data) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
};

/** Convierte enlaces de Google Drive (u otros) en una URL de imagen que el navegador pueda mostrar. */
export function normalizeImageUrl(raw) {
  const url = (raw || "").trim();
  if (!url) return "";
  if (url.startsWith("/")) return import.meta.env.BASE_URL + url.slice(1);
  const patterns = [
    /drive\.google\.com\/file\/d\/([\w-]+)/,
    /drive\.google\.com\/open\?id=([\w-]+)/,
    /drive\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]+)/,
    /drive\.google\.com\/thumbnail\?(?:[^#]*&)?id=([\w-]+)/,
    /docs\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`;
  }
  return url;
}

/** Carga el catálogo: Supabase si está instalado; si no, copia local o el catálogo incluido. */
export async function loadCatalog() {
  try {
    const [c, p] = await Promise.all([
      supabase.from("categories").select("*").order("sort"),
      supabase.from("products").select("*").order("sort").order("name"),
    ]);
    if (!c.error && !p.error && p.data.length > 0) {
      return { source: "supabase", categories: c.data, products: p.data };
    }
  } catch {
    /* sin conexión o sin esquema */
  }
  const local = readLocal();
  if (local?.products?.length) return { source: "local", ...local };
  return { source: "seed", categories: seed.categories, products: seed.products };
}

/* ───────── Administración ───────── */
const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};

const isMissingSchema = (e) =>
  e && (e.code === "PGRST202" || e.code === "42883" || e.code === "PGRST205" || /could not find|schema cache|does not exist/i.test(e.message || ""));

export async function adminLogin(pwd) {
  try {
    return { ok: !!(await rpc("admin_check", { pwd })), remote: true };
  } catch (e) {
    if (isMissingSchema(e) || e?.message?.includes("Failed to fetch")) {
      return { ok: pwd === ADMIN_FALLBACK_PASSWORD, remote: false };
    }
    return { ok: false, remote: true };
  }
}

/** Guarda cambios; con Supabase vía RPC, sin él en localStorage (solo este navegador). */
export function adminApi(pwd, remote, state) {
  const persistLocal = (next) => {
    writeLocal({ categories: next.categories, products: next.products });
    return next;
  };
  return {
    async saveProduct(p) {
      if (remote) await rpc("admin_upsert_product", { pwd, p });
      const exists = state.products.some((x) => x.id === p.id);
      const products = exists
        ? state.products.map((x) => (x.id === p.id ? { ...x, ...p } : x))
        : [{ ...p }, ...state.products];
      return persistLocal({ ...state, products });
    },
    async deleteProduct(id) {
      if (remote) await rpc("admin_delete_product", { pwd, pid: id });
      return persistLocal({ ...state, products: state.products.filter((x) => x.id !== id) });
    },
    async saveCategory(c, oldName) {
      if (remote) await rpc("admin_upsert_category", { pwd, c, old_name: oldName || null });
      let categories;
      let products = state.products;
      if (oldName) {
        categories = state.categories.map((x) => (x.name === oldName ? { ...x, ...c } : x));
        if (oldName !== c.name) {
          products = products.map((p) => (p.category === oldName ? { ...p, category: c.name } : p));
        }
      } else {
        categories = [...state.categories, { sort: state.categories.length, ...c }];
      }
      return persistLocal({ ...state, categories, products });
    },
    async deleteCategory(name) {
      if (state.products.some((p) => p.category === name)) {
        throw new Error("La categoría tiene productos. Muévelos a otra categoría antes de borrarla.");
      }
      if (remote) await rpc("admin_delete_category", { pwd, cname: name });
      return persistLocal({ ...state, categories: state.categories.filter((x) => x.name !== name) });
    },
    async orders() {
      if (!remote) return [];
      return rpc("admin_orders", { pwd });
    },
    async setOrderStatus(id, status) {
      if (remote) await rpc("admin_set_order_status", { pwd, oid: id, new_status: status });
    },
    async changePassword(next) {
      if (!remote) throw new Error("Instala el esquema de Supabase para cambiar la clave.");
      await rpc("admin_change_password", { pwd, new_pwd: next });
    },
  };
}

export function newProductId() {
  return "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
