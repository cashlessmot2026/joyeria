import { useEffect, useRef, useState } from "react";

// gold-api.com: precios spot gratuitos, sin llave y con CORS. USD por onza troy.
const METAL_URL = (s) => `https://api.gold-api.com/price/${s}`;
// open.er-api.com: tasa USD → COP gratuita y con CORS.
const FX_URL = "https://open.er-api.com/v6/latest/USD";
const OZ = 31.1034768;
const REFRESH_MS = 60_000;
const CACHE_KEY = "roux-metals";

const SYMBOLS = ["XAU", "XAG", "XPT", "XPD"];

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchMetals() {
  const [fx, ...metals] = await Promise.all([getJson(FX_URL), ...SYMBOLS.map((s) => getJson(METAL_URL(s)))]);
  const cop = fx?.rates?.COP;
  if (!cop) throw new Error("sin tasa COP");
  const usd = {};
  SYMBOLS.forEach((s, i) => (usd[s] = metals[i].price));
  return { usd, cop, at: Date.now() };
}

const perGram = (m, symbol) => (m.usd[symbol] / OZ) * m.cop;

/** Lista de precios por gramo en COP para mostrar en el banner. */
export function buildTicker(m) {
  const au = perGram(m, "XAU");
  return [
    ...[24, 22, 18, 14, 10].map((k) => ({
      key: `au${k}`,
      label: `Oro ${k}K`,
      value: au * (k / 24),
      kind: "gold",
    })),
    { key: "ag", label: "Plata 999", value: perGram(m, "XAG"), kind: "silver" },
    { key: "pt", label: "Platino", value: perGram(m, "XPT"), kind: "plat" },
    { key: "pd", label: "Paladio", value: perGram(m, "XPD"), kind: "plat" },
  ];
}

export function useMetals() {
  const [state, setState] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      return { data: cached, prev: null, status: cached ? "cache" : "loading" };
    } catch {
      return { data: null, prev: null, status: "loading" };
    }
  });
  const last = useRef(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const data = await fetchMetals();
        if (!alive) return;
        const prev = last.current;
        last.current = data;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          /* ignorar */
        }
        setState({ data, prev, status: "live" });
      } catch {
        if (alive) setState((s) => ({ ...s, status: s.data ? "stale" : "error" }));
      }
    };
    run();
    const id = setInterval(run, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state;
}
