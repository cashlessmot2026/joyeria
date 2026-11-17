import { useMemo } from "react";
import { buildTicker, useMetals } from "./metals";
import { money } from "./ticket";

const STATUS_TEXT = {
  live: "EN VIVO",
  cache: "ÚLTIMO PRECIO",
  stale: "SIN CONEXIÓN · ÚLTIMO PRECIO",
  loading: "CARGANDO…",
  error: "PRECIOS NO DISPONIBLES",
};

export default function GoldBar() {
  const { data, prev, status } = useMetals();

  const items = useMemo(() => {
    if (!data) return [];
    const now = buildTicker(data);
    const before = prev ? buildTicker(prev) : null;
    return now.map((it, i) => {
      let dir = 0;
      if (before) {
        const d = it.value - before[i].value;
        dir = Math.abs(d) < 0.5 ? 0 : d > 0 ? 1 : -1;
      }
      return { ...it, dir };
    });
  }, [data, prev]);

  const time = data
    ? new Date(data.at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  const track = items.map((it) => (
    <span className={`gold-chip ${it.kind}`} key={it.key}>
      <b>{it.label}</b>
      <span>{money(Math.round(it.value))}<small>/g</small></span>
      {it.dir !== 0 && <i className={it.dir > 0 ? "up" : "down"}>{it.dir > 0 ? "▲" : "▼"}</i>}
    </span>
  ));

  return (
    <div className="gold-bar" role="region" aria-label="Precio de los metales preciosos en tiempo real">
      <div className={`gold-live ${status}`}>
        <span className="pulse" />
        <strong>{STATUS_TEXT[status]}</strong>
        {time && <small>{time}</small>}
      </div>
      <div className="gold-marquee">
        {items.length ? (
          <div className="gold-track">
            <div className="gold-group">{track}</div>
            <div className="gold-group" aria-hidden="true">{track}</div>
          </div>
        ) : (
          <span className="gold-empty">Consultando oro, plata y metales preciosos…</span>
        )}
      </div>
      {data && (
        <div className="gold-fx" title="Tasa de cambio usada para convertir de USD a COP">
          USD ${Math.round(data.cop).toLocaleString("es-CO")}
        </div>
      )}
    </div>
  );
}
