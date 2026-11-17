import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  FileText,
  Menu,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import GoldBar from "./GoldBar";
import { loadCatalog, normalizeImageUrl, supabase } from "./store";
import { STORE_ADDRESS, STORE_INSTAGRAM, STORE_NAME, WHATSAPP_NUMBER } from "./config";
import { canvasToBlob, downloadBlob, drawTicket, makePdf, money, newOrderId, uploadTicket } from "./ticket";

const Admin = lazy(() => import("./Admin"));
const PAGE = 24;

function readCart() {
  try {
    return JSON.parse(localStorage.getItem("roux-cart") || "[]");
  } catch {
    return [];
  }
}

const HERO_IDS = [
  "anillos-rolex-2-p9",
  "esmeraldas-dije-esmeralda-y-diamantes-p32",
  "dijes-guadalupe-3-p41",
];

export default function App() {
  const [catalog, setCatalog] = useState({ source: "loading", categories: [], products: [] });
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState("recomendado");
  const [visible, setVisible] = useState(PAGE);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cart, setCart] = useState(readCart);
  const [customer, setCustomer] = useState({ name: "", phone: "", city: "", address: "", note: "" });
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null); // pedido terminado
  const [adminOpen, setAdminOpen] = useState(false);
  const taps = useRef({ n: 0, t: 0 });

  useEffect(() => {
    loadCatalog().then(setCatalog);
  }, []);

  useEffect(() => {
    localStorage.setItem("roux-cart", JSON.stringify(cart));
  }, [cart]);

  const flash = useCallback((msg) => {
    setNotice(msg);
    window.clearTimeout(flash.t);
    flash.t = window.setTimeout(() => setNotice(""), 2800);
  }, []);

  const shown = useMemo(() => catalog.products.filter((p) => p.active !== false), [catalog.products]);
  const byId = useMemo(() => new Map(shown.map((p) => [p.id, p])), [shown]);

  const counts = useMemo(() => {
    const m = {};
    shown.forEach((p) => (m[p.category] = (m[p.category] || 0) + 1));
    return m;
  }, [shown]);

  const categories = useMemo(
    () => catalog.categories.filter((c) => counts[c.name]),
    [catalog.categories, counts],
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let list = shown.filter(
      (p) =>
        (activeCategory === "Todos" || p.category === activeCategory) &&
        (!q || `${p.name} ${p.category} ${p.detail}`.toLowerCase().includes(q)),
    );
    if (sort === "menor") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "mayor") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "nombre") list = [...list].sort((a, b) => a.name.localeCompare(b.name, "es"));
    return list;
  }, [shown, activeCategory, searchTerm, sort]);

  useEffect(() => setVisible(PAGE), [activeCategory, searchTerm, sort]);

  const cartItems = cart
    .map((e) => ({ ...e, product: byId.get(e.id) }))
    .filter((e) => e.product);
  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  const subtotal = cartItems.reduce((s, i) => s + i.product.price * i.quantity, 0);

  const addToCart = (product) => {
    setCart((cur) => {
      const found = cur.find((i) => i.id === product.id);
      return found
        ? cur.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i))
        : [...cur, { id: product.id, quantity: 1 }];
    });
    flash(`${product.name} se agregó a tu bolsa`);
  };
  const changeQuantity = (id, d) =>
    setCart((cur) => cur.map((i) => (i.id === id ? { ...i, quantity: i.quantity + d } : i)).filter((i) => i.quantity > 0));
  const removeFromCart = (id) => setCart((cur) => cur.filter((i) => i.id !== id));

  const goCatalog = (category) => {
    if (category) setActiveCategory(category);
    setMenuOpen(false);
    document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" });
  };

  /* Tres toques al logo = panel oculto de administración */
  const onLogo = (e) => {
    e.preventDefault();
    const now = Date.now();
    const t = taps.current;
    t.n = now - t.t < 900 ? t.n + 1 : 1;
    t.t = now;
    if (t.n >= 3) {
      t.n = 0;
      setAdminOpen(true);
      setMenuOpen(false);
    } else {
      window.setTimeout(() => {
        if (taps.current.n < 3 && Date.now() - taps.current.t >= 880) window.scrollTo({ top: 0, behavior: "smooth" });
      }, 900);
    }
  };

  const glowMove = (e) => {
    const card = e.target.closest?.(".glow-card, .category-card");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  /* ───────── Pedido: ticket PDF + imagen + enlace por WhatsApp ───────── */
  const handleOrder = async (event) => {
    event.preventDefault();
    if (!cartItems.length || sending) return;
    const c = {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      city: customer.city.trim(),
      address: customer.address.trim(),
      note: customer.note.trim(),
    };
    if (!c.name || !c.city || !c.address) return flash("Completa nombre, ciudad y dirección.");
    if (c.phone.replace(/\D/g, "").length < 7) return flash("Escribe un teléfono válido.");

    setSending(true);
    try {
      const order = {
        id: newOrderId(),
        createdAt: new Date().toISOString(),
        customer: c,
        items: cartItems.map(({ product, quantity }) => ({
          id: product.id,
          name: product.name,
          category: product.category,
          price: product.price,
          quantity,
        })),
        total: subtotal,
      };

      const ticket = await drawTicket(order);
      const [pngBlob, pdfBlob] = await Promise.all([canvasToBlob(ticket.canvas), makePdf(ticket)]);

      let links = null;
      let saved = false;
      try {
        links = await uploadTicket(order.id, pdfBlob, pngBlob);
        const { error } = await supabase.from("orders").insert({
          id: order.id,
          customer: c,
          items: order.items,
          total: order.total,
          pdf_url: links.pdf,
          image_url: links.png,
        });
        saved = !error;
      } catch {
        links = null; // sin Supabase listo: el cliente descarga y adjunta el ticket a mano
      }

      setDone({
        order,
        links,
        saved,
        pdfBlob,
        pngBlob,
        preview: URL.createObjectURL(pngBlob),
      });
      setCart([]);
      setCartOpen(false);
    } catch (err) {
      console.error(err);
      flash("No pudimos generar el ticket. Intenta de nuevo.");
    } finally {
      setSending(false);
    }
  };

  const whatsappUrl = (d) => {
    const { order, links } = d;
    const lines = order.items.map((i) => `• ${i.name} x${i.quantity} — ${money(i.price * i.quantity)}`);
    const msg = [
      `Hola ${STORE_NAME} 👋 Quiero confirmar mi pedido *${order.id}*`,
      "",
      ...lines,
      "",
      `*Total: ${money(order.total)}*`,
      "",
      `Nombre: ${order.customer.name}`,
      `Teléfono: ${order.customer.phone}`,
      `Envío: ${order.customer.address}, ${order.customer.city}`,
      order.customer.note ? `Notas: ${order.customer.note}` : null,
      "",
      links ? `🧾 Ticket PDF: ${links.pdf}` : "🧾 Te adjunto mi ticket (PDF e imagen).",
      links ? `🖼️ Ticket imagen: ${links.png}` : null,
    ]
      .filter((l) => l !== null)
      .join("\n");
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  };

  const closeDone = () => {
    if (done?.preview) URL.revokeObjectURL(done.preview);
    setDone(null);
  };

  const heroProducts = HERO_IDS.map((id) => byId.get(id)).filter(Boolean);

  return (
    <div className="site-shell" onMouseMove={glowMove}>
      <GoldBar />

      <header className="main-header">
        <button className="icon-button mobile-menu-trigger" aria-label="Abrir menú" onClick={() => setMenuOpen((v) => !v)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <a className="brand-lockup" href="#inicio" aria-label="ROUX inicio" onClick={onLogo}>
          <img src="/assets/roux-logo.png" alt="ROUX Joyas 18K" draggable="false" />
        </a>
        <nav className={`main-nav ${menuOpen ? "is-open" : ""}`}>
          <a href="#inicio" onClick={() => setMenuOpen(false)}>Inicio</a>
          <a href="#categorias" onClick={() => setMenuOpen(false)}>Categorías</a>
          <a href="#catalogo" onClick={() => setMenuOpen(false)}>Colección</a>
          <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button" aria-label="Buscar joyas" onClick={() => { setSearchOpen((v) => !v); goCatalog(); }}>
            <Search size={19} strokeWidth={1.7} />
          </button>
          <button className="bag-button" aria-label={`Abrir bolsa, ${cartCount} productos`} onClick={() => setCartOpen(true)}>
            <ShoppingBag size={18} strokeWidth={1.7} />
            <span>Mi bolsa</span>
            <b>{cartCount}</b>
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="inicio">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> JOYAS 18K <span className="eyebrow-line" /></div>
            <h1>El brillo de<br /><em>ser tú.</em></h1>
            <p>Sutileza y elegancia en cada detalle. Encuentra esa pieza que habla de ti, de tu esencia y de tus momentos.</p>
            <div className="hero-cta">
              <a className="pill-button solid big" href="#catalogo" onClick={(e) => { e.preventDefault(); goCatalog(); }}>
                Descubrir colección <ArrowRight size={17} />
              </a>
              <span className="hero-pill"><Sparkles size={14} /> {shown.length || 267} joyas en catálogo</span>
            </div>
          </div>
          <div className="hero-visual" aria-hidden={heroProducts.length === 0}>
            {heroProducts.map((p, i) => (
              <figure className={`hero-card glow-card h${i}`} key={p.id}>
                <img src={normalizeImageUrl(p.image)} alt={p.name} />
                <figcaption>{p.name}</figcaption>
              </figure>
            ))}
            <div className="hero-orb" />
          </div>
        </section>

        <section className="category-section section-pad" id="categorias">
          <div className="section-heading">
            <div>
              <span className="eyebrow dark">ENCUENTRA TU FAVORITA</span>
              <h2>Explora por <em>categoría</em></h2>
            </div>
            <p>Cada pieza tiene su propio encanto.<br />¿Cuál cuenta tu historia?</p>
          </div>
          <div className="category-rail">
            {categories.map((c) => (
              <button
                key={c.name}
                className={`category-card ${activeCategory === c.name ? "selected" : ""}`}
                onClick={() => goCatalog(c.name)}
              >
                <img src={normalizeImageUrl(c.image)} alt="" loading="lazy" />
                <span className="cat-name">{c.name}</span>
                <span className="cat-count">{counts[c.name]} piezas</span>
              </button>
            ))}
          </div>
        </section>

        <section className="catalog-section section-pad" id="catalogo">
          <div className="section-heading catalog-heading">
            <div>
              <span className="eyebrow dark">LA SELECCIÓN ROUX</span>
              <h2>Piezas para <em>brillar</em></h2>
            </div>
            <div className="catalog-tools">
              <label className="search-field">
                <Search size={16} />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar cadenas, topos, dijes…"
                  aria-label="Buscar productos"
                  autoFocus={searchOpen}
                />
                {searchTerm && <button type="button" aria-label="Limpiar" onClick={() => setSearchTerm("")}><X size={14} /></button>}
              </label>
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
                <option value="recomendado">Recomendados</option>
                <option value="menor">Precio: menor a mayor</option>
                <option value="mayor">Precio: mayor a menor</option>
                <option value="nombre">Nombre A–Z</option>
              </select>
            </div>
          </div>

          <div className="chips" role="tablist" aria-label="Categorías">
            <button className={`chip ${activeCategory === "Todos" ? "active" : ""}`} onClick={() => setActiveCategory("Todos")}>
              Todos <small>{shown.length}</small>
            </button>
            {categories.map((c) => (
              <button key={c.name} className={`chip ${activeCategory === c.name ? "active" : ""}`} onClick={() => setActiveCategory(c.name)}>
                {c.name} <small>{counts[c.name]}</small>
              </button>
            ))}
          </div>

          <p className="result-count">{filtered.length} piezas{searchTerm ? ` para “${searchTerm}”` : ""}</p>

          {catalog.source === "loading" && <div className="skeleton-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" />)}</div>}

          <div className="product-grid">
            {filtered.slice(0, visible).map((p, i) => (
              <article className="product-card glow-card" key={p.id} style={{ "--i": i % PAGE }}>
                <div className="product-image-wrap">
                  <img src={normalizeImageUrl(p.image)} alt={p.name} loading="lazy" decoding="async" />
                  <span className="product-tag">{p.category}</span>
                  <button className="quick-add" onClick={() => addToCart(p)} aria-label={`Agregar ${p.name} a la bolsa`}>
                    <Plus size={20} />
                  </button>
                </div>
                <div className="product-info">
                  <h3>{p.name}</h3>
                  <p>{p.detail}</p>
                  <div className="product-bottom">
                    <strong>{money(p.price)}</strong>
                    <button className="pill-button solid small" onClick={() => addToCart(p)}>Agregar</button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {filtered.length > visible && (
            <div className="more-wrap">
              <button className="pill-button ghost big" onClick={() => setVisible((v) => v + PAGE)}>
                Ver más piezas ({filtered.length - visible})
              </button>
            </div>
          )}

          {catalog.source !== "loading" && filtered.length === 0 && (
            <div className="empty-search glow-card">
              <Search size={26} />
              <h3>No encontramos esa joya</h3>
              <p>Prueba con otro nombre o elige una categoría diferente.</p>
              <button className="pill-button solid" onClick={() => { setSearchTerm(""); setActiveCategory("Todos"); }}>Ver toda la colección</button>
            </div>
          )}
          <p className="price-note">Precios referenciales. Confirma disponibilidad y valor final al hacer tu pedido.</p>
        </section>

        <section className="essence-section" id="nuestra-esencia">
          <div className="essence-image glow-card">
            {byId.get("candongas-candonga-2-p84") && <img src={byId.get("candongas-candonga-2-p84").image} alt="Candongas ROUX" loading="lazy" />}
          </div>
          <div className="essence-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> NUESTRA ESENCIA</span>
            <h2>Sutileza,<br /><em>elegancia.</em></h2>
            <p>Nuestras joyas celebran la belleza en su forma más pura: líneas limpias, detalles sutiles. Cada pieza es un equilibrio cuidadosamente creado, donde la autenticidad y la artesanía se entrelazan.</p>
            <a href="#catalogo" className="pill-button gold" onClick={(e) => { e.preventDefault(); goCatalog(); }}>Encuentra tu pieza <ArrowRight size={16} /></a>
          </div>
        </section>

        <section className="promise-strip">
          <div className="glow-card"><span className="promise-icon">✦</span><div><strong>Joyas 18K</strong><small>Estilo que permanece</small></div></div>
          <div className="glow-card"><span className="promise-icon">◇</span><div><strong>Atención cercana</strong><small>Te acompañamos a elegir</small></div></div>
          <div className="glow-card"><span className="promise-icon">↗</span><div><strong>Envíos nacionales</strong><small>ROUX llega a tu ciudad</small></div></div>
        </section>
      </main>

      <footer className="footer" id="contacto">
        <div className="footer-top">
          <div className="footer-brand">
            <img src="/assets/roux-logo.png" alt="ROUX Joyas 18K" />
            <p>El brillo de ser tú.</p>
          </div>
          <div className="footer-column"><span>EXPLORA</span><a href="#categorias">Categorías</a><a href="#catalogo">Colección</a><a href="#nuestra-esencia">Nuestra esencia</a></div>
          <div className="footer-column">
            <span>CONTACTO</span>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noreferrer">WhatsApp pedidos</a>
            <a href={`https://instagram.com/${STORE_INSTAGRAM}`} target="_blank" rel="noreferrer">@{STORE_INSTAGRAM}</a>
            <a href="#contacto">{STORE_ADDRESS}</a>
          </div>
          <div className="footer-note"><span>UNA JOYA, UNA HISTORIA.</span><p>Gracias por hacer parte del universo ROUX.</p></div>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} ROUX Joyas 18K</span><span>BRILLA A TU MANERA</span></div>
      </footer>

      {notice && <div className="toast" role="status"><Check size={16} /> {notice}</div>}

      {cartOpen && (
        <div className="drawer-layer" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setCartOpen(false)}>
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Tu bolsa de compras">
            <div className="drawer-header">
              <div><span className="eyebrow dark">ROUX JOYAS 18K</span><h2>Tu <em>bolsa</em> <span>({cartCount})</span></h2></div>
              <button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Cerrar bolsa"><X size={21} /></button>
            </div>
            {cartItems.length === 0 ? (
              <div className="empty-cart">
                <div className="empty-bag-icon"><ShoppingBag size={26} /></div>
                <h3>Tu bolsa está esperando</h3>
                <p>Descubre esa joya que te hace sentir especial.</p>
                <button className="pill-button solid" onClick={() => { setCartOpen(false); goCatalog(); }}>Explorar colección <ArrowRight size={16} /></button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cartItems.map(({ product, quantity }) => (
                    <div className="cart-item" key={product.id}>
                      <img src={normalizeImageUrl(product.image)} alt={product.name} />
                      <div className="cart-item-copy">
                        <span>{product.category}</span>
                        <h3>{product.name}</h3>
                        <strong>{money(product.price)}</strong>
                        <div className="quantity-control">
                          <button onClick={() => changeQuantity(product.id, -1)} aria-label="Restar una unidad"><Minus size={13} /></button>
                          <span>{quantity}</span>
                          <button onClick={() => changeQuantity(product.id, 1)} aria-label="Agregar una unidad"><Plus size={13} /></button>
                        </div>
                      </div>
                      <button className="remove-item" onClick={() => removeFromCart(product.id)} aria-label={`Eliminar ${product.name}`}><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <div className="subtotal-row"><span>Total</span><strong>{money(subtotal)}</strong></div>
                  <p>El envío y la disponibilidad se confirman por WhatsApp.</p>
                  <form className="checkout-form" onSubmit={handleOrder}>
                    <label>Tu nombre<input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="¿Cómo te llamas?" autoComplete="name" required /></label>
                    <div className="form-two">
                      <label>Teléfono<input type="tel" inputMode="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="300 123 4567" autoComplete="tel" required /></label>
                      <label>Ciudad<input value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} placeholder="Ej. Medellín" autoComplete="address-level2" required /></label>
                    </div>
                    <label>Dirección de envío<input value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="Calle, barrio, apto…" autoComplete="street-address" required /></label>
                    <label>Nota <span>(opcional)</span><textarea value={customer.note} onChange={(e) => setCustomer({ ...customer, note: e.target.value })} placeholder="Talla, referencia o indicaciones…" rows={2} /></label>
                    <button className="pill-button whatsapp big" type="submit" disabled={sending}>
                      {sending ? "Generando tu ticket…" : <>Generar ticket y enviar <Send size={16} /></>}
                    </button>
                  </form>
                  <div className="secure-note"><Check size={13} /> Se crea tu ticket en PDF e imagen y lo envías por WhatsApp.</div>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {done && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Pedido listo">
          <div className="modal-card glow-card done-card">
            <header>
              <div><span className="eyebrow dark">PEDIDO LISTO</span><h3>{done.order.id}</h3></div>
              <button className="icon-button" onClick={closeDone} aria-label="Cerrar"><X size={18} /></button>
            </header>
            <img className="ticket-preview" src={done.preview} alt={`Ticket ${done.order.id}`} />
            <a className="pill-button whatsapp big" href={whatsappUrl(done)} target="_blank" rel="noopener noreferrer">
              Enviar por WhatsApp <Send size={16} />
            </a>
            <div className="done-row">
              <button className="pill-button ghost" onClick={() => downloadBlob(done.pdfBlob, `${done.order.id}.pdf`)}><FileText size={15} /> PDF</button>
              <button className="pill-button ghost" onClick={() => downloadBlob(done.pngBlob, `${done.order.id}.png`)}><Download size={15} /> Imagen</button>
            </div>
            <small className="done-hint">
              {done.links
                ? "El mensaje lleva el enlace de tu ticket en PDF e imagen."
                : "Descarga tu ticket y adjúntalo en el chat de WhatsApp."}
            </small>
          </div>
        </div>
      )}

      {adminOpen && (
        <Suspense fallback={<div className="admin-layer"><div className="admin-login glow-card"><p>Cargando…</p></div></div>}>
          <Admin catalog={catalog} setCatalog={setCatalog} onClose={() => setAdminOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
