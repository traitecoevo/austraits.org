// recreate.R: R code that rebuilds a download with the austraits package, from the same release (loaded by its DOI)
// and the same filters. It prints, as dplyr::filter() conditions, the rules toSql.ts turns into SQL (the same
// rules, in the same order, as the Shiny portal's filter_expressions() and recreate_script()). Kept free of
// browser APIs so the release tests can run it in V8 (browser-portal-src/R/recreate.R).
import { matchingTraits } from "./toSql.mjs";

// JSON string literals are valid R string literals
const rStr = (x) => JSON.stringify(String(x));
// one value prints as "x", several as c("x", "y"), as R's deparse() does
const rVec = (v) => (v.length === 1 ? rStr(v[0]) : "c(" + v.map(rStr).join(", ") + ")");
const rName = (col) => (/^[A-Za-z.][A-Za-z0-9._]*$/.test(col) ? col : "`" + col + "`");
const escRegex = (x) => x.replace(/[\]\[{}()+*^$|\\?.]/g, "\\$&");
const nonEmpty = (a) => !!a && a.length > 0;

export function downloadStem(version, dataset) {
  return `austraits-${version}-${dataset === "species" ? "species-means" : "data"}`;
}

/** The dplyr::filter() conditions for a filter state, as R code. */
export function filterConditions(state, spec, features) {
  const ds = state.dataset, out = [];
  const custom = spec.filters.find((f) => f.id === "custom");
  const vocab = custom.controlled_vocabulary_columns;
  const tr = matchingTraits(state, features);
  if (tr !== null) out.push(`trait_name %in% ${tr.length ? rVec(tr) : "character(0)"}`);
  const tt = state.taxon_type;
  if (tt && ["family", "genus", "taxon_name"].includes(tt) && nonEmpty(state[tt])) out.push(`${tt} %in% ${rVec(state[tt])}`);
  for (const k of ["basis_of_record", "life_stage"]) if (nonEmpty(state[k]) && ds === "raw") out.push(`${k} %in% ${rVec(state[k])}`);
  if (state.location === "georeferenced" && ds === "raw") {
    out.push("!is.na(`latitude (deg)`) & !is.na(`longitude (deg)`)");
    for (const [k, col, op] of [["min_latitude", "latitude (deg)", ">="], ["max_latitude", "latitude (deg)", "<="], ["min_longitude", "longitude (deg)", ">="], ["max_longitude", "longitude (deg)", "<="]]) {
      const v = state[k];
      if (v !== undefined && v !== null && !Number.isNaN(v)) out.push(`\`${col}\` ${op} ${Number(v)}`);
    }
  }
  if (state.location === "apc" && nonEmpty(state.apc_taxon_distribution))
    out.push(`stringr::str_detect(taxon_distribution, ${rStr(state.apc_taxon_distribution.map(escRegex).join("|"))})`);
  for (const cf of state.custom ?? []) {
    const { column, value } = cf;
    if (vocab.includes(column)) {
      if (column === "dataset_id" && ds === "species") // species rows hold several IDs joined with "; ": match whole IDs only
        out.push(`stringr::str_detect(dataset_id, ${rStr("(^|; )(" + value.map(escRegex).join("|") + ")(;|$)")})`);
      else out.push(`${rName(column)} %in% ${rVec(value)}`);
    } else {
      const parts = value.join("|").toLowerCase().split("|").map((p) => p.trim()).filter(Boolean);
      if (parts.length) out.push(`stringr::str_detect(tolower(${rName(column)}), ${rStr(parts.map(escRegex).join("|"))})`);
    }
  }
  return out;
}

/**
 * The whole script. `meta` is portal.json's zenodo_meta (version, doi, concept_doi, austraits_package).
 * `load = false` leaves out the install and load lines, so tests can supply `austraits` or `means`.
 */
export function recreateScript(state, spec, features, meta, day, load = true) {
  const species = state.dataset === "species";
  const conds = filterConditions(state, spec, features), text = conds.join("\n");
  const uses = (col) => text.includes(col);
  const doiText = meta.doi ? `doi:${meta.doi}` : "no Zenodo record (development build)";
  const loadArg = meta.doi ? `doi = ${rStr(meta.doi)}` : `version = ${rStr(meta.version)}`;
  const pkg = meta.austraits_package ? `traitecoevo/austraits@${meta.austraits_package}` : "traitecoevo/austraits";
  const needsDatabase = !species || uses("taxon_distribution");
  const needsCitation = !species && (uses("source_primary_citation") || uses("source_primary_key"));
  const georef = uses("latitude (deg)") || uses("longitude (deg)");

  const L = [
    `# Recreates ${downloadStem(meta.version, state.dataset)}.csv, downloaded from the AusTraits Data Portal on ${day}.`,
    `# Data: AusTraits ${meta.version}, ${doiText}`,
    "# The filters below are the ones the portal applied.",
    ...(species ? ["# Species means are the observed means published with the release; see its observed-means dictionary for each column."] : []),
    "# The portal's file also carries the taxon columns from its taxa table and the citation columns it adds.",
    "",
  ];
  if (load) {
    L.push("# install.packages(\"remotes\")", `# remotes::install_github(${rStr(pkg)})`, "");
    if (needsDatabase) L.push(`austraits <- austraits::load_austraits(${loadArg})`);
    if (species) L.push(`means <- austraits::load_austraits(${loadArg}, means = TRUE)`);
    L.push("");
  }
  L.push(`data <- ${species ? "means" : "austraits"} |>`);
  if (species) {
    if (uses("taxon_distribution")) L.push(
      "  # The APC distribution, from the database's taxa table",
      "  dplyr::left_join(",
      "    dplyr::distinct(dplyr::select(austraits$taxa, taxon_name, taxon_distribution), taxon_name, .keep_all = TRUE),",
      "    by = \"taxon_name\"",
      "  ) |>");
  } else {
    L.push("  austraits::flatten_database() |>");
    if (needsCitation) L.push(
      "  # Each dataset's own reference, as the portal names it",
      "  dplyr::mutate(source_primary_key = dataset_id, source_primary_citation = dataset_id_citation) |>");
  }
  L.push(
    "  # Hybrid formulas \"(Genus species x ...)\" carry the genus \"(Genus\"; the portal strips the bracket",
    "  dplyr::mutate(genus = sub(\"^[(]\", \"\", genus)) |>");
  if (georef) L.push(
    "  # Coordinates are stored as text; the portal compares them as numbers",
    "  dplyr::mutate(",
    "    `latitude (deg)` = suppressWarnings(as.numeric(`latitude (deg)`)),",
    "    `longitude (deg)` = suppressWarnings(as.numeric(`longitude (deg)`))",
    "  ) |>");
  if (!conds.length) L.push("  dplyr::filter()  # no filters: the whole table");
  else L.push("  dplyr::filter(", conds.map((c) => "    " + c).join(",\n"), "  )");
  L.push("");
  return L.join("\n");
}
