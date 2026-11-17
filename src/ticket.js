import { STORE_ADDRESS, STORE_INSTAGRAM, STORE_NAME } from "./config";
import { supabase } from "./store";

export const money = (value) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);

export function newOrderId() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RJ-${ymd}-${rand}`;
}

const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Dibuja el ticket del pedido en un canvas (PNG/PDF salen de aquí). */
export async function drawTicket(order) {
  const W = 520;
  const S = 2;
  const pad = 34;
  const inner = W - pad * 2;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = "500 15px 'DM Sans', Arial, sans-serif";

  const itemLines = order.items.map((it) => wrap(probe, it.name, inner - 150));
  const noteLines = order.customer.note ? wrap(probe, `Notas: ${order.customer.note}`, inner) : [];
  const addrLines = wrap(probe, `${order.customer.address}, ${order.customer.city}`, inner - 70);
  const itemsHeight = itemLines.reduce((s, l) => s + 22 * l.length + 30, 0);
  const H = 250 + 200 + addrLines.length * 20 + itemsHeight + noteLines.length * 20 + 190;

  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = H * S;
  const c = canvas.getContext("2d");
  c.scale(S, S);

  // papel
  c.fillStyle = "#f7f2e9";
  c.fillRect(0, 0, W, H);

  // cabecera petróleo con degradado
  const g = c.createLinearGradient(0, 0, W, 190);
  g.addColorStop(0, "#082e2d");
  g.addColorStop(1, "#0b625e");
  c.fillStyle = g;
  c.fillRect(0, 0, W, 190);
  c.fillStyle = "#bb9a61";
  c.fillRect(0, 190, W, 3);

  const logo = await loadImage("/assets/roux-logo.png");
  if (logo) c.drawImage(logo, W / 2 - 52, 22, 104, 104);
  c.textAlign = "center";
  c.fillStyle = "#d7bd8d";
  c.font = "600 13px 'DM Sans', Arial, sans-serif";
  c.fillText("TICKET DE PEDIDO", W / 2, 154);
  c.fillStyle = "#ffffff";
  c.font = "600 18px 'DM Sans', Arial, sans-serif";
  c.fillText(order.id, W / 2, 178);

  let y = 226;
  c.textAlign = "left";
  const label = (t, x, yy) => {
    c.fillStyle = "#8a8d86";
    c.font = "600 11px 'DM Sans', Arial, sans-serif";
    c.fillText(t, x, yy);
  };
  const text = (t, x, yy, opt = {}) => {
    c.fillStyle = opt.color || "#172b2a";
    c.font = `${opt.weight || 500} ${opt.size || 15}px 'DM Sans', Arial, sans-serif`;
    c.textAlign = opt.align || "left";
    c.fillText(t, x, yy);
    c.textAlign = "left";
  };

  const date = new Date(order.createdAt);
  label("FECHA", pad, y);
  text(date.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }), pad, y + 20);
  y += 56;

  label("CLIENTE", pad, y);
  text(order.customer.name, pad, y + 20, { weight: 700, size: 16 });
  y += 44;
  label("TELÉFONO", pad, y);
  text(order.customer.phone, pad, y + 20);
  y += 44;
  label("ENVÍO A", pad, y);
  addrLines.forEach((l, i) => text(l, pad, y + 20 + i * 20));
  y += 24 + addrLines.length * 20 + 6;

  // separador punteado
  const dashed = () => {
    c.strokeStyle = "rgba(23,43,42,.35)";
    c.setLineDash([5, 5]);
    c.beginPath();
    c.moveTo(pad, y);
    c.lineTo(W - pad, y);
    c.stroke();
    c.setLineDash([]);
  };
  dashed();
  y += 28;

  label("PRODUCTOS", pad, y);
  label("TOTAL", W - pad - 50, y);
  y += 26;
  order.items.forEach((it, i) => {
    itemLines[i].forEach((l, k) => text(l, pad, y + k * 22, { weight: 600 }));
    const lh = itemLines[i].length * 22;
    text(`${it.quantity} × ${money(it.price)}`, pad, y + lh, { size: 13, color: "#777c75" });
    text(money(it.price * it.quantity), W - pad, y + (lh - 22) / 2 + 22, { weight: 700, align: "right" });
    y += lh + 30 - 4;
  });
  y += 4;
  dashed();
  y += 36;

  text("TOTAL A PAGAR", pad, y, { weight: 700, size: 14, color: "#0b625e" });
  text(money(order.total), W - pad, y + 2, { weight: 700, size: 24, align: "right", color: "#082e2d" });
  y += 18;
  text("Envío y disponibilidad se confirman por WhatsApp", pad, y + 12, { size: 12, color: "#777c75" });
  y += 30;

  if (noteLines.length) {
    noteLines.forEach((l, i) => text(l, pad, y + 14 + i * 20, { size: 13, color: "#45524e" }));
    y += noteLines.length * 20 + 14;
  }

  // pie
  y += 22;
  c.fillStyle = "#082e2d";
  c.fillRect(0, y, W, H - y);
  c.textAlign = "center";
  c.fillStyle = "#d7bd8d";
  c.font = "italic 500 18px 'Playfair Display', Georgia, serif";
  c.fillText("El brillo de ser tú.", W / 2, y + 40);
  c.fillStyle = "#b8c4c0";
  c.font = "500 12px 'DM Sans', Arial, sans-serif";
  c.fillText(`${STORE_NAME} · @${STORE_INSTAGRAM}`, W / 2, y + 66);
  c.fillText(STORE_ADDRESS, W / 2, y + 86);

  return { canvas, width: W, height: H };
}

export const canvasToBlob = (canvas, type = "image/png", quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export async function makePdf({ canvas, width, height }) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "px", format: [width, height], orientation: "portrait", compress: true });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, width, height);
  return pdf.output("blob");
}

/** Sube PDF e imagen a Supabase Storage y devuelve sus enlaces públicos. */
export async function uploadTicket(id, pdfBlob, pngBlob) {
  const put = async (name, blob, type) => {
    const { error } = await supabase.storage.from("tickets").upload(name, blob, {
      contentType: type,
      upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from("tickets").getPublicUrl(name).data.publicUrl;
  };
  const [pdf, png] = await Promise.all([
    put(`${id}.pdf`, pdfBlob, "application/pdf"),
    put(`${id}.png`, pngBlob, "image/png"),
  ]);
  return { pdf, png };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
