#!/usr/bin/env python3
"""Builds one small static HTML page for every taxon and every trait, plus family index pages, an index, sitemap.xml and robots.txt.
Run at data-release time:  python3 build_static_pages.py --data data/7.0.0 --out site-pages [--base https://example.org]
Pages sit under  <out>/pages/  and link to the portal at  /portal/index.html  (root-absolute, so they work on any host that serves both folders)."""
import argparse, html, json, os, re, sys, urllib.parse
from collections import defaultdict
import duckdb

ap = argparse.ArgumentParser()
ap.add_argument("--data", default="data/7.0.0")
ap.add_argument("--out", default="site-pages")
ap.add_argument("--base", default="", help="public address of the site root, no trailing slash; used for canonical links and the sitemap")
ap.add_argument("--portal", default="/portal/index.html")
ap.add_argument("--limit", type=int, default=0, help="only build this many taxa (for tests)")
a = ap.parse_args()

D = a.data.rstrip("/") + "/"
OUT = a.out.rstrip("/")
P = OUT + "/pages"
esc = lambda s: html.escape("" if s is None else str(s), quote=True)
con = duckdb.connect()
q = lambda sql: con.execute(sql).fetchall()
pq = lambda n: f"read_parquet('{D}{n}.parquet')"

portal = json.load(open(D + "portal.json"))
extras = json.load(open(D + "taxon_extras.json"))
tdefs = json.load(open(D + "trait_definitions.json"))
groups = extras["trait_groups"]
apc_version = extras.get("apc_version")
data_version = portal.get("data_version", "")
doi = portal.get("zenodo_meta", {}).get("concept_doi", "10.5281/zenodo.3568417")
site = portal["links"]["site"]


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")
    return s or "x"


def uniq_slugs(names):
    seen, out = {}, {}
    for n in sorted(names):
        s = slugify(n)
        if s in seen:
            seen[s] += 1
            s = f"{s}-{seen[s]}"
        else:
            seen[s] = 1
        out[n] = s
    return out


def inline(s):  # same small markdown reader as the portal: **bold**, _italic_, [t](url), <url>
    s = esc(s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(^|[\s(])_([^_\n]+)_(?=[\s.,;:)]|$)", r"\1<em>\2</em>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?:[^)\s]+)\)", lambda m: f'<a href="{m.group(2)}" rel="noopener">{m.group(1)}</a>', s)
    s = re.sub(r"&lt;(https?:[^\s&]+)&gt;", lambda m: f'<a href="{m.group(1)}" rel="noopener">{m.group(1)}</a>', s)
    return s


def r2(v):
    try:
        n = float(v)
        n = round(n * 100) / 100
        return str(int(n)) if n == int(n) else str(n)
    except (TypeError, ValueError):
        return "" if v is None else str(v)


def portal_link(state):
    return a.portal + "#s=" + urllib.parse.quote(json.dumps(state, separators=(",", ":")), safe="")


def page(title, desc, path, body, kind):
    canon = f'<link rel="canonical" href="{esc(a.base)}{esc(path)}">\n' if a.base else ""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)} | AusTraits</title>
<meta name="description" content="{esc(desc)}">
{canon}<link rel="stylesheet" href="/pages/pages.css">
</head><body class="{kind}">
<header class="top"><a class="brand" href="/pages/index.html">AusTraits</a><nav><a href="/pages/index.html">Browse</a><a href="{esc(a.portal)}">Data portal</a><a href="{esc(site)}">austraits.org</a></nav></header>
<main>
{body}
</main>
<footer><p>AusTraits data version {esc(data_version)}. Data are available at <a href="https://doi.org/{esc(doi)}" rel="noopener">doi: {esc(doi)}</a> under the CC BY 4.0 licence. Please cite the AusTraits data paper (Falster et al. 2021) and the datasets you use.</p></footer>
</body></html>
"""


def write(rel, text):
    fp = os.path.join(P, rel)
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    with open(fp, "w", encoding="utf-8") as f:
        f.write(text)


# ---------- load tables ----------
print("loading tables", flush=True)
taxa = {r[0]: r for r in q(f"SELECT taxon_name, family, scientific_name, taxon_distribution, taxon_id, taxon_rank, genus FROM {pq('taxa')}")}
dsets = defaultdict(list)
for t, d, nt, nr, ref in q(f"""SELECT r.taxon_name, r.dataset_id, count(DISTINCT r.trait_name), count(*), any_value(c.source_primary_citation)
  FROM {pq('raw_by_taxon')} r LEFT JOIN {pq('dataset_citations')} c USING (dataset_id) GROUP BY r.taxon_name, r.dataset_id"""):
    dsets[t].append((d, nt, nr, ref))
ntraits = {t: n for t, n in q(f"SELECT taxon_name, count(DISTINCT trait_name) FROM {pq('raw_by_taxon')} GROUP BY taxon_name")}
means = defaultdict(dict)
for t, tr, unit, mean, mn, mx, rng, ds, typ in q(f"SELECT taxon_name, trait_name, unit, value_mean, value_min, value_max, value_range, dataset_id, type FROM {pq('species_averages')}"):
    means[t][tr] = (unit, mean, mn, mx, rng, ds, typ)
syn = defaultdict(list)
for t, sn, st, kind in q(f"SELECT taxon_name, scientific_name, taxonomic_status, kind FROM {pq('taxon_synonyms')} ORDER BY kind, scientific_name"):
    syn[t].append((sn, st, kind))
flora = defaultdict(dict)
for t, src, url in q(f"SELECT taxon_name, source, url FROM {pq('flora_links')}"):
    if url:
        flora[t].setdefault(src, url)

names = [n for n in taxa if n in dsets]
if a.limit:
    names = sorted(names)[: a.limit]
tslug = uniq_slugs(names)
print(f"taxa with data: {len(names)} of {len(taxa)}", flush=True)


# ---------- taxon pages ----------
def profile_links(t, info):
    dist = info[3] or ""
    tid = info[4]
    L = [("APC", tid), ("Flora of Australia", "https://profiles.ala.org.au/opus/foa/profile/" + t.replace(" ", "%20")),
         ("ALA", "https://bie.ala.org.au/species/" + str(tid)),
         ("iNaturalist", "https://www.inaturalist.org/taxa/search?q=" + re.sub(r" var\. | subsp\. ", " ", t).replace(" ", "-"))]
    fl = flora[t]
    if re.search("NSW", dist, re.I): L.append(("NSW Flora", "https://plantnet.rbgsyd.nsw.gov.au/cgi-bin/NSWfl.pl?page=nswfl&lvl=sp&name=" + t.replace(" ", "~")))
    if re.search("NT", dist, re.I): L.append(("NT eFlora", fl.get("nt", "https://eflora.nt.gov.au/")))
    if re.search("SA", dist, re.I): L.append(("SA eFlora", "https://flora.sa.gov.au/"))
    if re.search("Vic", dist, re.I): L.append(("Vic Flora", fl.get("vic", "https://vicflora.rbg.vic.gov.au/flora/taxon/")))
    if re.search("WA", dist, re.I): L.append(("Florabase", "https://florabase.dbca.wa.gov.au/"))
    L.append(("ATRP", fl.get("atrp", "https://apps.lucidcentral.org/rainforest/")))
    return ", ".join(f'<a href="{esc(u)}" rel="noopener">{esc(s)}</a>' for s, u in L)


def synonyms_html(t):
    src = f"APC {apc_version}" if apc_version else "APC"
    out = ""
    for kind, label in (("synonym", "Synonyms"), ("misapplied", "Misapplied names")):
        x = [r for r in syn[t] if r[2] == kind]
        if x:
            out += f"<details><summary><strong>{label}</strong>: {len(x)} ({esc(src)})</summary><ul>" + "".join(f"<li>{esc(r[0])} ({esc(r[1])})</li>" for r in x) + "</ul></details>"
    return out or f"<p><strong>Synonyms</strong>: none listed in the {esc(src)}</p>"


def core_groups(t):
    core = defaultdict(list)
    for g in groups:
        if not g.get("core"): continue
        m = means[t].get(g["trait"])
        if not m or m[6] is None: continue
        unit, mean, mn, mx, rng, ds, typ = m
        link = f'<a href="/pages/trait/{tr_slug.get(g["trait"], slugify(g["trait"]))}.html">{esc(g["trait"])}</a>' if g["trait"] in tr_slug else esc(g["trait"])
        if typ == "categorical":
            line = f"<li>{link} (categorical): {esc(rng)} [sources: {esc(ds)}]</li>"
        else:
            u = unit or ""
            line = f"<li>{link} (numerical): {esc(r2(mean))} {esc(u)} ({esc(r2(mn))}-{esc(r2(mx))} {esc(u)}) [sources: {esc(ds)}]</li>"
        core[g["group"]].append(line)
    return "".join(f"<details><summary>{esc(k)}</summary><ul>{''.join(core[k])}</ul></details>" for k in sorted(core))


# trait list first, so taxon pages can link to trait pages
trait_cov = {r[0]: r[1:] for r in q(f"SELECT trait_name, count(*), count(DISTINCT taxon_name), count(DISTINCT family), count(DISTINCT dataset_id) FROM {pq('raw_by_trait')} GROUP BY trait_name")}
tr_slug = uniq_slugs(list(trait_cov))
print(f"traits with data: {len(trait_cov)}", flush=True)

fam = defaultdict(list)
for i, t in enumerate(sorted(names), 1):
    info = taxa[t]
    ds = sorted(dsets[t], key=lambda d: d[0])
    nrec = sum(d[2] for d in ds)
    nt = ntraits.get(t, 0)
    by_n = sorted(ds, key=lambda d: -d[2])
    table = "<table><thead><tr><th>dataset_id</th><th>n_traits</th><th>n_records</th><th>reference</th></tr></thead><tbody>" + "".join(
        f"<tr><td>{esc(d[0])}</td><td>{d[1]}</td><td>{d[2]}</td><td>{inline(d[3]) if d[3] else ''}</td></tr>" for d in by_n) + "</tbody></table>"
    state = {"dataset": "species", "rank": "taxon_name", "taxon_name": [t]}
    body = f"""<article class="prose">
<h1>{esc(t)}</h1>
<p class="cta"><a class="btn" href="{esc(portal_link(state))}">Explore the data for this taxon in the portal</a></p>
<p><strong>Family</strong> {esc(info[1])}</p>
<p><strong>Taxonomy</strong>: {esc(info[2])}</p>
{synonyms_html(t)}
<p><strong>Distribution (APC)</strong>: {esc(info[3] or '')}</p>
<p><strong>Profiles</strong>: {profile_links(t, info)}</p>
<h2>Traits</h2>
<p><strong>Top source datasets</strong>: {', '.join(f'{esc(d[0])} ({d[2]})' for d in ds)}. See below for a full list of sources.<br>
<strong>Summary</strong>: AusTraits contains {nt} traits from {nrec:,} records in {len(ds)} datasets.</p>
<p><strong>Traits by category</strong> (click to expand). For categorical traits, the values are listed. For numerical traits, the mean and range are shown.</p>
{core_groups(t)}
<h2>Sources</h2>
<div class="tablewrap">{table}</div>
</article>"""
    desc = f"{t} ({info[1]}): AusTraits plant trait data. {nt} traits, {nrec:,} records from {len(ds)} datasets."
    write(f"taxon/{tslug[t]}.html", page(t, desc, f"/pages/taxon/{tslug[t]}.html", body, "taxon"))
    fam[info[1] or "(no family)"].append(t)
    if i % 5000 == 0: print(f"  taxon pages {i}", flush=True)

# ---------- trait pages ----------
for tr, (n, ntax, nfam, nds) in sorted(trait_cov.items()):
    d = tdefs.get(tr)
    items = ""
    if not d:
        items = "<p>No definition is available for this trait.</p>"
    else:
        def li(k, v): return f"<li><strong>{esc(k)}: </strong>{v}</li>"
        ul = li("Label", esc(d.get("label", ""))) + li("Entity URI", f'<a href="{esc(d.get("entity_URI",""))}" rel="noopener">{esc(d.get("entity_URI",""))}</a>')
        ul += li("Type", esc(d.get("type", ""))) + li("Definition", esc(d.get("description", ""))) + li("Additional comments", esc(d.get("comments") or "None"))
        if d.get("type") == "numeric":
            ul += li("units", esc(d.get("units", ""))) + li("allowable range", f"{esc(d.get('allowed_values_min'))} - {esc(d.get('allowed_values_max'))} {esc(d.get('units') or '')}")
        elif d.get("allowed_values_levels"):
            rows = "".join(f"<tr><td>{esc(k)}</td><td>{esc('' if v is None else v)}</td></tr>" for k, v in d["allowed_values_levels"].items())
            ul += f'<li><strong>Allowed values: </strong><div class="tablewrap"><table><thead><tr><th>value</th><th>description</th></tr></thead><tbody>{rows}</tbody></table></div></li>'
        items = f"<ul>{ul}</ul>"
        if d.get("entity_URI"):
            items += f'<p>See the AusTraits Plant Dictionary (<a href="{esc(d["entity_URI"])}" rel="noopener">{esc(d["entity_URI"])}</a>) for additional information about this trait.</p>'
    state = {"dataset": "species", "rank": "all", "trait_name": [tr]}
    body = f"""<article class="prose">
<h1>{esc(tr)}</h1>
<p class="cta"><a class="btn" href="{esc(portal_link(state))}">Explore the data for this trait in the portal</a></p>
{items}
<h2>Coverage</h2>
<p>For this trait, AusTraits includes a total of <strong>{n:,}</strong> records. This includes:</p>
<ul><li>data for <strong>{ntax:,}</strong> species.</li><li>data for <strong>{nfam:,}</strong> families.</li><li>data from <strong>{nds:,}</strong> datasets (see the portal Citations tab for a list of sources)</li></ul>
</article>"""
    label = (d or {}).get("label") or tr
    desc = f"{tr} ({label}): AusTraits trait definition and coverage. {n:,} records for {ntax:,} species from {nds} datasets."
    write(f"trait/{tr_slug[tr]}.html", page(tr, desc, f"/pages/trait/{tr_slug[tr]}.html", body, "trait"))

# ---------- family and index pages ----------
fslug = uniq_slugs(list(fam))
for f, ts in fam.items():
    lis = "".join(f'<li><a href="/pages/taxon/{tslug[t]}.html">{esc(t)}</a></li>' for t in sorted(ts))
    write(f"family/{fslug[f]}.html", page(f, f"{f}: {len(ts):,} taxa with plant trait data in AusTraits.", f"/pages/family/{fslug[f]}.html",
          f'<article class="prose"><h1>{esc(f)}</h1><p>{len(ts):,} taxa with trait data.</p><ul class="cols">{lis}</ul></article>', "family"))
fl_li = "".join(f'<li><a href="/pages/family/{fslug[f]}.html">{esc(f)}</a> <span class="n">{len(fam[f]):,}</span></li>' for f in sorted(fam))
tr_li = "".join(f'<li><a href="/pages/trait/{tr_slug[t]}.html">{esc(t)}</a></li>' for t in sorted(trait_cov))
# search index: names only; a slug is added only where it is not just the lower-cased name (see slugify in the page script)
def _entry(n, slugs):
    return n if slugs[n] == slugify(n) else [n, slugs[n]]
write("search-index.json", json.dumps({"t": [_entry(n, tslug) for n in sorted(names)], "f": [_entry(n, fslug) for n in sorted(fam)], "r": [_entry(n, tr_slug) for n in sorted(trait_cov)]}, ensure_ascii=False, separators=(",", ":")))
SEARCH_BOX = """<div class="search"><label for="q">Search taxa, traits and families</label><input id="q" type="search" autocomplete="off" placeholder="For example Acacia melanoxylon, leaf area, Fabaceae" aria-controls="results"><ul id="results" class="results" role="listbox" hidden></ul><p id="qnote" class="n" aria-live="polite"></p></div>
<script>
(function () {
  var q = document.getElementById("q"), box = document.getElementById("results"), note = document.getElementById("qnote"), idx = null, loading = null, sel = -1, shown = [];
  var KINDS = [["f", "family", "family"], ["r", "trait", "trait"], ["t", "taxon", "taxon"]];
  function slug(n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x"; }
  function load() {
    if (!loading) loading = fetch("/pages/search-index.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) { idx = j; }).catch(function () { loading = null; note.textContent = "The search list could not be loaded. Please try again, or use the lists below."; });
    return loading;
  }
  function find(text) {
    var out = [];
    KINDS.forEach(function (k, ki) {
      (idx[k[0]] || []).forEach(function (e) {
        var name = typeof e === "string" ? e : e[0], low = name.toLowerCase().replace(/_/g, " "), at = low.indexOf(text);
        if (at < 0) return;
        var score = low === text ? -1 : at === 0 ? 0 : /[ (-]/.test(low.charAt(at - 1)) ? 1 : 2;
        out.push({ score: score, ki: ki, name: name, url: "/pages/" + k[1] + "/" + (typeof e === "string" ? slug(name) : e[1]) + ".html", label: k[2] });
      });
    });
    out.sort(function (a, b) { return a.score - b.score || a.ki - b.ki || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    return out;
  }
  function draw() {
    box.textContent = ""; sel = -1; shown = [];
    var text = q.value.trim().toLowerCase().replace(/[_ ]+/g, " ");
    if (text.length < 2) { box.hidden = true; note.textContent = ""; return; }
    if (!idx) { note.textContent = "Loading the search list…"; return; }
    var all = find(text); shown = all.slice(0, 20);
    shown.forEach(function (r) {
      var li = document.createElement("li"), a = document.createElement("a"), b = document.createElement("span");
      li.setAttribute("role", "option"); a.href = r.url; a.textContent = r.name; b.className = "tag"; b.textContent = r.label; li.append(a, b); box.append(li);
    });
    box.hidden = !shown.length;
    note.textContent = all.length ? (all.length > shown.length ? "Showing the first " + shown.length + " of " + all.length.toLocaleString("en-AU") + " matches. Type more letters to narrow the list." : all.length + (all.length === 1 ? " match" : " matches")) : "No matches.";
  }
  function mark(i) { var items = box.children; if (!items.length) return; sel = (i + items.length) % items.length; Array.prototype.forEach.call(items, function (li, k) { li.classList.toggle("on", k === sel); }); items[sel].scrollIntoView({ block: "nearest" }); }
  q.addEventListener("focus", load);
  q.addEventListener("input", function () { load().then(draw); draw(); });
  q.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); mark(sel + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); mark(sel - 1); }
    else if (e.key === "Enter" && shown.length) { e.preventDefault(); location.href = shown[sel < 0 ? 0 : sel].url; }
    else if (e.key === "Escape") { q.value = ""; draw(); }
  });
})();
</script>"""
write("index.html", page("Browse taxa and traits", f"Browse {len(names):,} plant taxa and {len(trait_cov):,} traits in the AusTraits database.", "/pages/index.html",
      f'<article class="prose"><h1>Browse AusTraits</h1><p>{len(names):,} taxa and {len(trait_cov):,} traits. To filter, view and download data, use the <a href="{esc(a.portal)}">data portal</a>.</p>{SEARCH_BOX}'
      f'<h2>Families</h2><ul class="cols">{fl_li}</ul><h2>Traits</h2><ul class="cols">{tr_li}</ul></article>', "index"))

# ---------- style, sitemap, robots ----------
css = f""":root{{--ink:#2b332f;--muted:#64726b;--green:#2f7d55;--green-dark:#235c43;--line:#e5e8e5;--cream:#f7f7f4;--bg:#fff}}
@media (prefers-color-scheme:dark){{:root{{--ink:#e6ebe8;--muted:#9fb0a8;--green:#6fc29a;--green-dark:#8fd6b3;--line:#2f3a35;--cream:#1d2421;--bg:#141a17}}}}
*{{box-sizing:border-box}}body{{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg)}}
a{{color:var(--green-dark)}}.top{{display:flex;gap:1rem;align-items:center;justify-content:space-between;padding:.7rem 1rem;border-bottom:1px solid var(--line);background:var(--cream);flex-wrap:wrap}}
.brand{{font-weight:700;text-decoration:none;font-size:1.1rem}}.top nav{{display:flex;gap:1rem}}main{{max-width:60rem;margin:0 auto;padding:1rem}}
h1{{font-size:1.7rem;margin:.6rem 0}}h2{{font-size:1.25rem;margin-top:1.6rem}}.btn{{display:inline-block;background:var(--green);color:#fff;padding:.5rem .9rem;border-radius:8px;text-decoration:none}}
details{{margin:.3rem 0;border:1px solid var(--line);border-radius:8px;padding:.3rem .7rem}}summary{{cursor:pointer;font-weight:600}}
.tablewrap{{overflow-x:auto}}table{{border-collapse:collapse;font-size:.9rem;width:100%}}th,td{{border-bottom:1px solid var(--line);padding:.35rem .5rem;text-align:left;vertical-align:top}}
.cols{{columns:16rem;list-style:none;padding:0}}.cols li{{break-inside:avoid;padding:.1rem 0}}.n{{color:var(--muted);font-size:.85rem}}
.search{{margin:1rem 0}}.search label{{display:block;font-weight:600;margin-bottom:.3rem}}.search input{{width:100%;padding:.6rem .8rem;font:inherit;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}}
.results{{list-style:none;margin:.3rem 0 0;padding:0;border:1px solid var(--line);border-radius:8px;max-height:22rem;overflow:auto;background:var(--bg)}}.results li{{display:flex;justify-content:space-between;gap:1rem;padding:.35rem .7rem;border-bottom:1px solid var(--line)}}.results li:last-child{{border-bottom:0}}.results li.on,.results li:hover{{background:var(--cream)}}.results a{{flex:1}}.tag{{color:var(--muted);font-size:.8rem}}
footer{{max-width:60rem;margin:2rem auto;padding:1rem;color:var(--muted);font-size:.85rem;border-top:1px solid var(--line)}}
"""
write("pages.css", css)
if a.base:
    urls = [f"/pages/{x}" for x in ["index.html"]] + [f"/pages/taxon/{s}.html" for s in tslug.values()] + [f"/pages/trait/{s}.html" for s in tr_slug.values()] + [f"/pages/family/{s}.html" for s in fslug.values()]
    with open(OUT + "/sitemap.xml", "w") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"<url><loc>{esc(a.base)}{u}</loc></url>\n" for u in urls) + "</urlset>\n")
    with open(OUT + "/robots.txt", "w") as f:
        f.write(f"User-agent: *\nAllow: /pages/\nDisallow: /data/\nDisallow: /site/\nSitemap: {a.base}/sitemap.xml\n")
n_files = sum(len(fs) for _, _, fs in os.walk(OUT))
print(f"done: {len(names)} taxon pages, {len(trait_cov)} trait pages, {len(fam)} family pages, {n_files} files")
