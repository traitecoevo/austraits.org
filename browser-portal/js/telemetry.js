// Usage counting through Supabase (REST, anon key). Same table and event names as the Shiny portal:
// telemetry_events(type, timestamp, details, session_id); counts are read from the telemetry_monthly view.
// Nothing is sent unless config.json has a telemetry url and key, and never during automated tests or with ?notrack.
let cfg = null, session = null;
const enabled = () => !!(cfg && cfg.url && cfg.key);
const base = () => cfg.url.replace(/\/$/, "") + "/rest/v1/";
const hdr = () => ({ apikey: cfg.key, Authorization: "Bearer " + cfg.key });

export function initTelemetry(c) {
  cfg = c && c.url && c.key ? c : null;
  let off = false;
  try { off = navigator.webdriver === true || /[?&]notrack\b/.test(location.search); } catch {}
  if (off) cfg = cfg ? { ...cfg, sendOff: true } : null;
  session = "session_" + (Date.now() / 1000).toFixed(5);
}

export function track(type, details) {
  if (!enabled() || cfg.sendOff) return;
  try {
    const body = { type, timestamp: new Date().toISOString().replace(/\.\d+Z$/, "Z"), session_id: session };
    body.details = { ...(details || {}), portal: "browser" }; // tells this portal apart from the Shiny portal in the shared table
    fetch(base() + "telemetry_events", { method: "POST", keepalive: true, headers: { ...hdr(), "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(body) }).catch(() => {});
  } catch {}
}

let cache = null;
export async function monthly() {
  if (!enabled()) return null;
  if (cache && Date.now() - cache.t < 60000) return cache.rows;
  const r = await fetch(base() + "telemetry_monthly?select=month,type,n&limit=10000", { headers: hdr() });
  if (!r.ok) throw new Error("Usage counts could not be read (" + r.status + ")");
  const raw = await r.json();
  const by = new Map();
  for (const x of raw) { const m = by.get(x.month) || { month: x.month, logins: 0, searches: 0, downloads: 0 }; const n = Number(x.n) || 0; if (x.type === "login") m.logins += n; else if (x.type === "search") m.searches += n; else if (x.type === "download") m.downloads += n; by.set(x.month, m); }
  const rows = [...by.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
  cache = { t: Date.now(), rows };
  return rows;
}

export const counterCsv = (rows) => ["Reporting_Period,Metric_Type_Investigations,Investigations_Count,Metric_Type_Requests,Requests_Count,Searches,Downloads"].concat(rows.map((r) => `"${r.month}","Investigations",${r.logins},"Requests",${r.searches + r.downloads},${r.searches},${r.downloads}`)).join("\n") + "\n";
export const counterJson = (rows) => JSON.stringify(rows.map((r) => ({ reporting_period: r.month, investigations: r.logins, requests_total: r.searches + r.downloads, searches: r.searches, downloads: r.downloads })), null, 2);
