import { useEffect, useMemo, useState } from "react";
import { ImageOff, KeyRound, Lock, Package, Pencil, Plus, Receipt, Settings, Tags, Trash2, X } from "lucide-react";
import { adminApi, adminLogin, newProductId, normalizeImageUrl } from "./store";
import { money } from "./ticket";

const EMPTY = { id: "", name: "", category: "", price: 0, detail: "", image: "", active: true };

function Thumb({ src, alt }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (!src || bad) return <span className="thumb-empty"><ImageOff size={16} /></span>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setBad(true)} />;
}

export default function Admin({ catalog, setCatalog, onClose }) {
  const [session, setSession] = useState(null); // { pwd, remote }
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("productos");
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("Todas");
  const [limit, setLimit] = useState(50);
  const [editing, setEditing] = useState(null);
  const [catEdit, setCatEdit] = useState(null);
  const [orders, setOrders] = useState([]);
  const [toast, setToast] = useState("");
  const [newPwd, setNewPwd] = useState("");

  const api = useMemo(
    () => (session ? adminApi(session.pwd, session.remote, catalog) : null),
    [session, catalog],
  );

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next?.products) setCatalog((c) => ({ ...c, ...next, source: session.remote ? "supabase" : "local" }));
      if (okMsg) flash(okMsg);
      return true;
    } catch (e) {
      flash(e.message || "No se pudo guardar");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await adminLogin(pwd);
    setBusy(false);
    if (r.ok) setSession({ pwd, remote: r.remote });
    else setErr("Clave incorrecta");
  };

  useEffect(() => {
    if (tab === "pedidos" && api) api.orders().then(setOrders).catch(() => setOrders([]));
  }, [tab, api]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !editing && !catEdit && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, catEdit, onClose]);

  /* ── acceso ── */
  if (!session) {
    return (
      <div className="admin-layer" role="dialog" aria-modal="true" aria-label="Acceso de administrador">
        <form className="admin-login glow-card" onSubmit={login}>
          <button type="button" className="icon-button admin-x" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
          <span className="admin-lock"><Lock size={22} /></span>
          <h2>Acceso privado</h2>
          <p>Escribe la clave de administrador.</p>
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Clave"
            aria-label="Clave de administrador"
          />
          {err && <small className="form-error">{err}</small>}
          <button className="pill-button solid" disabled={busy || !pwd}>{busy ? "Verificando…" : "Entrar"}</button>
        </form>
      </div>
    );
  }

  const { products, categories } = catalog;
  const q = query.trim().toLowerCase();
  const list = products.filter(
    (p) =>
      (catFilter === "Todas" || p.category === catFilter) &&
      (!q || `${p.name} ${p.category} ${p.detail}`.toLowerCase().includes(q)),
  );

  const saveProduct = async (e) => {
    e.preventDefault();
    const p = { ...editing, price: Math.max(0, Math.round(Number(editing.price) || 0)), image: normalizeImageUrl(editing.image) };
    if (!p.name.trim() || !p.category) return flash("Falta el nombre o la categoría");
    if (!p.id) {
      p.id = newProductId();
      p.sort = -Date.now();
    }
    if (await run(() => api.saveProduct(p), "Producto guardado")) setEditing(null);
  };

  const savePrice = (p, raw) => {
    const price = Math.max(0, Math.round(Number(raw) || 0));
    if (price !== p.price) run(() => api.saveProduct({ ...p, price }), `Precio de ${p.name} actualizado`);
  };

  const saveCategory = async (e) => {
    e.preventDefault();
    const name = catEdit.name.trim();
    if (!name) return;
    if (await run(() => api.saveCategory({ name, image: normalizeImageUrl(catEdit.image) }, catEdit.old), "Categoría guardada"))
      setCatEdit(null);
  };

  const TABS = [
    ["productos", "Productos", Package],
    ["categorias", "Categorías", Tags],
    ["pedidos", "Pedidos", Receipt],
    ["ajustes", "Ajustes", Settings],
  ];

  return (
    <div className="admin-layer admin-full" role="dialog" aria-modal="true" aria-label="Panel de administración">
      <div className="admin-shell">
        <header className="admin-head">
          <div>
            <span className="eyebrow dark">PANEL PRIVADO</span>
            <h2>Administrar <em>ROUX</em></h2>
          </div>
          <button className="pill-button ghost" onClick={onClose}><X size={16} /> Salir</button>
        </header>

        {!session.remote && (
          <div className="admin-note">
            Supabase aún no tiene el esquema instalado: los cambios se guardan solo en este navegador. Ejecuta
            <code> supabase/schema.sql </code> y <code> seed.sql </code> en Supabase para guardarlos para todos.
          </div>
        )}

        <nav className="admin-tabs">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>

        {tab === "productos" && (
          <section>
            <div className="admin-tools">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(50); }} placeholder="Buscar joya…" />
              <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setLimit(50); }}>
                <option>Todas</option>
                {categories.map((c) => <option key={c.name}>{c.name}</option>)}
              </select>
              <button className="pill-button solid" onClick={() => setEditing({ ...EMPTY, category: categories[0]?.name || "" })}>
                <Plus size={16} /> Nueva joya
              </button>
            </div>
            <p className="admin-count">{list.length} joyas</p>
            <ul className="admin-list">
              {list.slice(0, limit).map((p) => (
                <li key={p.id} className={`glow-row ${p.active === false ? "off" : ""}`}>
                  <Thumb src={p.image} alt={p.name} />
                  <div className="row-main">
                    <strong>{p.name}</strong>
                    <span>{p.category}{p.active === false ? " · oculto" : ""}</span>
                  </div>
                  <label className="price-edit" title="Editar precio">
                    <span>$</span>
                    <input
                      key={p.id + p.price}
                      type="number"
                      min="0"
                      step="1000"
                      defaultValue={p.price}
                      onBlur={(e) => savePrice(p, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    />
                  </label>
                  <button className="icon-button" aria-label={`Editar ${p.name}`} onClick={() => setEditing({ ...p })}><Pencil size={16} /></button>
                </li>
              ))}
            </ul>
            {list.length > limit && (
              <button className="pill-button ghost center" onClick={() => setLimit((n) => n + 50)}>Mostrar más</button>
            )}
          </section>
        )}

        {tab === "categorias" && (
          <section>
            <div className="admin-tools">
              <span className="admin-count">{categories.length} categorías</span>
              <button className="pill-button solid" onClick={() => setCatEdit({ name: "", image: "", old: null })}><Plus size={16} /> Nueva categoría</button>
            </div>
            <ul className="admin-list">
              {categories.map((c) => (
                <li key={c.name} className="glow-row">
                  <Thumb src={c.image} alt={c.name} />
                  <div className="row-main">
                    <strong>{c.name}</strong>
                    <span>{products.filter((p) => p.category === c.name).length} joyas</span>
                  </div>
                  <button className="icon-button" aria-label={`Editar ${c.name}`} onClick={() => setCatEdit({ ...c, old: c.name })}><Pencil size={16} /></button>
                  <button
                    className="icon-button danger"
                    aria-label={`Borrar ${c.name}`}
                    onClick={() => window.confirm(`¿Borrar la categoría "${c.name}"?`) && run(() => api.deleteCategory(c.name), "Categoría borrada")}
                  ><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === "pedidos" && (
          <section>
            {!session.remote ? (
              <p className="admin-empty">Los pedidos se guardan en Supabase. Instala el esquema para verlos aquí.</p>
            ) : orders.length === 0 ? (
              <p className="admin-empty">Aún no hay pedidos.</p>
            ) : (
              <ul className="admin-list orders">
                {orders.map((o) => (
                  <li key={o.id} className="glow-row">
                    <div className="row-main">
                      <strong>{o.id} · {money(o.total)}</strong>
                      <span>
                        {o.customer?.name} · {o.customer?.phone} · {o.customer?.city}<br />
                        {new Date(o.created_at).toLocaleString("es-CO")}
                      </span>
                      <span>
                        {o.pdf_url && <a href={o.pdf_url} target="_blank" rel="noreferrer">PDF</a>}
                        {o.image_url && <> · <a href={o.image_url} target="_blank" rel="noreferrer">Imagen</a></>}
                      </span>
                    </div>
                    <select
                      value={o.status}
                      onChange={(e) =>
                        run(async () => { await api.setOrderStatus(o.id, e.target.value); setOrders((all) => all.map((x) => (x.id === o.id ? { ...x, status: e.target.value } : x))); })
                      }
                    >
                      {["nuevo", "confirmado", "enviado", "entregado", "cancelado"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "ajustes" && (
          <section className="admin-settings">
            <div className="glow-card pad">
              <h3><KeyRound size={17} /> Cambiar clave de admin</h3>
              <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Nueva clave" />
              <button
                className="pill-button solid"
                disabled={busy || newPwd.length < 3}
                onClick={async () => {
                  if (await run(() => api.changePassword(newPwd), "Clave actualizada")) {
                    setSession({ ...session, pwd: newPwd });
                    setNewPwd("");
                  }
                }}
              >Guardar clave</button>
            </div>
            <div className="glow-card pad">
              <h3>Imágenes desde Google Drive</h3>
              <p>
                Sube la foto a Drive, compártela como <b>“Cualquier persona con el enlace”</b> y pega el enlace en el
                campo de imagen de la joya. ROUX lo convierte automáticamente.
              </p>
            </div>
            <div className="glow-card pad">
              <h3>Estado de la base de datos</h3>
              <p>{session.remote ? "Conectado a Supabase: los cambios los ven todos los clientes." : "Modo local: instala el esquema de Supabase para compartir los cambios."}</p>
              <p>Fuente actual del catálogo: <b>{catalog.source}</b></p>
            </div>
          </section>
        )}
      </div>

      {editing && (
        <div className="modal-layer" onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}>
          <form className="modal-card glow-card" onSubmit={saveProduct}>
            <header>
              <h3>{editing.id ? "Editar joya" : "Nueva joya"}</h3>
              <button type="button" className="icon-button" onClick={() => setEditing(null)} aria-label="Cerrar"><X size={18} /></button>
            </header>
            <div className="preview"><Thumb src={normalizeImageUrl(editing.image)} alt="Vista previa" /></div>
            <label>Nombre<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></label>
            <div className="two">
              <label>Categoría
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} required>
                  {categories.map((c) => <option key={c.name}>{c.name}</option>)}
                </select>
              </label>
              <label>Precio (COP)<input type="number" min="0" step="1000" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></label>
            </div>
            <label>Detalle (medidas, peso…)<textarea rows={2} value={editing.detail} onChange={(e) => setEditing({ ...editing, detail: e.target.value })} /></label>
            <label>Enlace de la imagen (Drive o URL)<input value={editing.image} onChange={(e) => setEditing({ ...editing, image: e.target.value })} placeholder="https://drive.google.com/file/d/…" /></label>
            <label className="check"><input type="checkbox" checked={editing.active !== false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Visible en la tienda</label>
            <div className="modal-actions">
              {editing.id && (
                <button
                  type="button"
                  className="pill-button danger"
                  onClick={async () => {
                    if (window.confirm(`¿Borrar "${editing.name}" definitivamente?`) && (await run(() => api.deleteProduct(editing.id), "Joya borrada"))) setEditing(null);
                  }}
                ><Trash2 size={15} /> Borrar</button>
              )}
              <button className="pill-button solid" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      )}

      {catEdit && (
        <div className="modal-layer" onMouseDown={(e) => e.target === e.currentTarget && setCatEdit(null)}>
          <form className="modal-card glow-card" onSubmit={saveCategory}>
            <header>
              <h3>{catEdit.old ? "Editar categoría" : "Nueva categoría"}</h3>
              <button type="button" className="icon-button" onClick={() => setCatEdit(null)} aria-label="Cerrar"><X size={18} /></button>
            </header>
            <div className="preview"><Thumb src={normalizeImageUrl(catEdit.image)} alt="Vista previa" /></div>
            <label>Nombre<input value={catEdit.name} onChange={(e) => setCatEdit({ ...catEdit, name: e.target.value })} required /></label>
            <label>Imagen de portada (Drive o URL)<input value={catEdit.image || ""} onChange={(e) => setCatEdit({ ...catEdit, image: e.target.value })} /></label>
            <div className="modal-actions"><button className="pill-button solid" disabled={busy}>Guardar</button></div>
          </form>
        </div>
      )}

      {toast && <div className="toast admin-toast" role="status">{toast}</div>}
    </div>
  );
}
