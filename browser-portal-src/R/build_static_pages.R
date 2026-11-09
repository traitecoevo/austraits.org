#' Build the static Browse pages
#'
#' Writes one small HTML page per taxon and per trait, a page per family, an
#' index with a search box, `search-index.json`, `pages.css`, and (when `base`
#' is given) `sitemap.xml` and `robots.txt`. Search engines index these pages;
#' each links into the browser portal. Pages go under `<out>/pages/`, and links
#' are root-absolute, so the folder works on any host that serves both.
#'
#' @param data A data folder built by [build_browser_data()].
#' @param out Output folder.
#' @param base Public address of the site root, no trailing slash; used for
#'   canonical links and the sitemap. Leave empty to skip both.
#' @param portal Address of the portal page.
#' @param limit Build only this many taxon pages (for tests); 0 builds all.
#' @return `out`, invisibly.
build_static_pages <- function(data, out, base = "", portal = "/portal/index.html", limit = 0) {
  P <- file.path(out, "pages")
  con <- DBI::dbConnect(duckdb::duckdb())
  on.exit(DBI::dbDisconnect(con, shutdown = TRUE), add = TRUE)
  pq <- function(n) sprintf("read_parquet(%s)", sql_str(file.path(data, paste0(n, ".parquet"))))
  q <- function(sql) db_get(con, sql)

  portal_meta <- read_json_file(file.path(data, "portal.json"))
  extras <- read_json_file(file.path(data, "taxon_extras.json"))
  tdefs <- read_json_file(file.path(data, "trait_definitions.json"))
  groups <- extras$trait_groups
  apc_version <- extras$apc_version
  data_version <- portal_meta$data_version %||% ""
  doi <- portal_meta$zenodo_meta$concept_doi %||% "10.5281/zenodo.3568417"
  site <- portal_meta$links$site

  write_page_file <- function(rel, text) {
    fp <- file.path(P, rel)
    dir.create(dirname(fp), showWarnings = FALSE, recursive = TRUE)
    write_utf8(text, fp)
  }
  page <- function(title, desc, path, body, kind) {
    canon <- if (nzchar(base)) paste0('<link rel="canonical" href="', esc(base), esc(path), '">\n') else ""
    paste0('<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>', esc(title), ' | AusTraits</title>
<meta name="description" content="', esc(desc), '">
', canon, '<link rel="stylesheet" href="/pages/pages.css">
</head><body class="', kind, '">
<header class="top"><a class="brand" href="/pages/index.html">AusTraits</a><nav><a href="/pages/index.html">Browse</a><a href="', esc(portal), '">Data portal</a><a href="', esc(site), '">austraits.org</a></nav></header>
<main>
', body, '
</main>
<footer><p>AusTraits data version ', esc(data_version), '. Data are available at <a href="https://doi.org/', esc(doi), '" rel="noopener">doi: ', esc(doi), '</a> under the CC BY 4.0 licence. Please cite the AusTraits data paper (Falster et al. 2021) and the datasets you use.</p></footer>
</body></html>
')
  }
  portal_link <- function(state) paste0(portal, "#s=", utils::URLencode(state, reserved = TRUE))

  # ---------- load tables ----------
  message("Loading the tables…")
  taxa <- q(sprintf("SELECT taxon_name, family, scientific_name, taxon_distribution, taxon_id, taxon_rank, genus FROM %s", pq("taxa")))
  # per-taxon tables, held in hashed environments: looking a name up in a long R list scans the whole list
  by_taxon <- function(df) list2env(split(df, df$taxon_name), hash = TRUE)
  look <- function(env, key) get0(key, envir = env, inherits = FALSE)
  taxa <- by_taxon(taxa)
  dsets <- q(sprintf("SELECT r.taxon_name, r.dataset_id, count(DISTINCT r.trait_name) AS nt, count(*) AS nr, any_value(c.source_primary_citation) AS ref
    FROM %s r LEFT JOIN %s c USING (dataset_id) GROUP BY r.taxon_name, r.dataset_id", pq("raw_by_taxon"), pq("dataset_citations")))
  dsets <- by_taxon(dsets)
  ntraits <- q(sprintf("SELECT taxon_name, count(DISTINCT trait_name) AS n FROM %s GROUP BY taxon_name", pq("raw_by_taxon")))
  means <- by_taxon(q(sprintf("SELECT taxon_name, trait_name, unit, value_mean, value_min, value_max, value_range, dataset_id, type FROM %s", pq("species_averages"))))
  syn <- by_taxon(q(sprintf("SELECT taxon_name, scientific_name, taxonomic_status, kind FROM %s ORDER BY kind, scientific_name", pq("taxon_synonyms"))))
  # the first link per taxon and source, in file order
  flora <- q(sprintf("SELECT taxon_name, source, url FROM read_parquet(%s, file_row_number = true) WHERE url IS NOT NULL AND url <> '' ORDER BY file_row_number",
                     sql_str(file.path(data, "flora_links.parquet"))))
  flora <- by_taxon(flora[!duplicated(flora[c("taxon_name", "source")]), ])

  names_all <- sort_c(intersect(ls(taxa, all.names = TRUE), ls(dsets, all.names = TRUE)))
  if (limit > 0) names_all <- utils::head(names_all, limit)
  tslug <- uniq_slugs(names_all)
  nt_all <- ntraits$n[match(names_all, ntraits$taxon_name)]
  nt_all[is.na(nt_all)] <- 0
  message(sprintf("Taxa with data: %d of %d", length(names_all), length(ls(taxa, all.names = TRUE))))

  # ---------- taxon pages ----------
  profile_links <- function(t, info) {
    dist <- na_to(info$taxon_distribution, "")
    tid <- info$taxon_id
    fl <- look(flora, t)
    fl_get <- function(src, default) if (!is.null(fl) && src %in% fl$source) fl$url[match(src, fl$source)] else default
    L <- list(c("APC", na_to(tid, "")),
              c("Flora of Australia", paste0("https://profiles.ala.org.au/opus/foa/profile/", gsub(" ", "%20", t, fixed = TRUE))),
              c("ALA", paste0("https://bie.ala.org.au/species/", na_to(tid, "None"))),
              c("iNaturalist", paste0("https://www.inaturalist.org/taxa/search?q=", gsub(" ", "-", gsub(" var\\. | subsp\\. ", " ", t, perl = TRUE), fixed = TRUE))))
    has <- function(p) grepl(p, dist, ignore.case = TRUE)
    if (has("NSW")) L <- c(L, list(c("NSW Flora", paste0("https://plantnet.rbgsyd.nsw.gov.au/cgi-bin/NSWfl.pl?page=nswfl&lvl=sp&name=", gsub(" ", "~", t, fixed = TRUE)))))
    if (has("NT")) L <- c(L, list(c("NT eFlora", fl_get("nt", "https://eflora.nt.gov.au/"))))
    if (has("SA")) L <- c(L, list(c("SA eFlora", "https://flora.sa.gov.au/")))
    if (has("Vic")) L <- c(L, list(c("Vic Flora", fl_get("vic", "https://vicflora.rbg.vic.gov.au/flora/taxon/"))))
    if (has("WA")) L <- c(L, list(c("Florabase", "https://florabase.dbca.wa.gov.au/")))
    L <- c(L, list(c("ATRP", fl_get("atrp", "https://apps.lucidcentral.org/rainforest/"))))
    paste(vapply(L, function(x) paste0('<a href="', esc(x[2]), '" rel="noopener">', esc(x[1]), "</a>"), ""), collapse = ", ")
  }

  synonyms_html <- function(t) {
    src <- if (!is.null(apc_version) && nzchar(apc_version)) paste("APC", apc_version) else "APC"
    out_html <- ""
    s <- look(syn, t)
    for (k in list(c("synonym", "Synonyms"), c("misapplied", "Misapplied names"))) {
      x <- if (is.null(s)) s else s[s$kind == k[1], ]
      if (!is.null(x) && nrow(x)) {
        out_html <- paste0(out_html, "<details><summary><strong>", k[2], "</strong>: ", nrow(x), " (", esc(src), ")</summary><ul>",
                           paste0("<li>", esc_v(x$scientific_name), " (", esc_v(x$taxonomic_status), ")</li>", collapse = ""), "</ul></details>")
      }
    }
    if (nzchar(out_html)) out_html else paste0("<p><strong>Synonyms</strong>: none listed in the ", esc(src), "</p>")
  }

  # trait list first, so taxon pages can link to trait pages
  trait_cov <- q(sprintf("SELECT trait_name, count(*) AS n, count(DISTINCT taxon_name) AS ntax, count(DISTINCT family) AS nfam, count(DISTINCT dataset_id) AS nds FROM %s GROUP BY trait_name", pq("raw_by_trait")))
  trait_cov <- trait_cov[order(trait_cov$trait_name, method = "radix"), ]
  tr_slug <- uniq_slugs(trait_cov$trait_name)
  message(sprintf("Traits with data: %d", nrow(trait_cov)))

  # the core traits, in the order of the trait groups file, each with its link
  is_core <- vapply(groups, function(g) isTRUE(g$core), TRUE)
  core_tbl <- data.frame(trait = vapply(groups[is_core], function(g) g$trait, ""),
                         group = vapply(groups[is_core], function(g) g$group %||% NA_character_, ""))
  core_tbl$link <- ifelse(core_tbl$trait %in% names(tr_slug),
                          paste0('<a href="/pages/trait/', tr_slug[core_tbl$trait], '.html">', esc_v(core_tbl$trait), "</a>"),
                          esc_v(core_tbl$trait))

  core_groups <- function(t) {
    m_all <- look(means, t)
    if (is.null(m_all)) return("")
    i <- match(core_tbl$trait, m_all$trait_name)
    keep <- !is.na(i) & !is.na(m_all$type[i])
    if (!any(keep)) return("")
    g <- core_tbl[keep, ]
    m <- m_all[i[keep], ]
    u <- esc_v(ifelse(is.na(m$unit), "", m$unit))
    r2v <- function(x) esc_v(vapply(x, r2, ""))
    line <- ifelse(!is.na(m$type) & m$type == "categorical",
                   paste0("<li>", g$link, " (categorical): ", esc_v(m$value_range), " [sources: ", esc_v(m$dataset_id), "]</li>"),
                   paste0("<li>", g$link, " (numerical): ", r2v(m$value_mean), " ", u, " (", r2v(m$value_min), "-", r2v(m$value_max), " ", u, ") [sources: ", esc_v(m$dataset_id), "]</li>"))
    paste0(vapply(sort_c(unique(g$group)), function(k) paste0("<details><summary>", esc(k), "</summary><ul>", paste0(line[g$group == k], collapse = ""), "</ul></details>"), ""), collapse = "")
  }

  fam_of <- character(length(names_all))
  for (i in seq_along(names_all)) {
    t <- names_all[i]
    info <- look(taxa, t)[1, ]
    ds <- look(dsets, t)
    ds <- ds[order(ds$dataset_id, method = "radix"), ]
    nrec <- sum(ds$nr)
    nt <- nt_all[i]
    by_n <- ds[order(-ds$nr, method = "radix"), ]
    table <- paste0("<table><thead><tr><th>dataset_id</th><th>n_traits</th><th>n_records</th><th>reference</th></tr></thead><tbody>",
                    paste0("<tr><td>", esc_v(by_n$dataset_id), "</td><td>", fmt_int(by_n$nt), "</td><td>", fmt_int(by_n$nr), "</td><td>",
                           vapply(by_n$ref, function(r) if (is.na(r) || !nzchar(r)) "" else inline_md(r), ""), "</td></tr>", collapse = ""),
                    "</tbody></table>")
    state <- paste0('{"dataset":"species","rank":"taxon_name","taxon_name":[', json_str(t, ascii = TRUE), "]}")
    body <- paste0('<article class="prose">
<h1>', esc(t), '</h1>
<p class="cta"><a class="btn" href="', esc(portal_link(state)), '">Explore the data for this taxon in the portal</a></p>
<p><strong>Family</strong> ', esc(info$family), '</p>
<p><strong>Taxonomy</strong>: ', esc(info$scientific_name), '</p>
', synonyms_html(t), '
<p><strong>Distribution (APC)</strong>: ', esc(na_to(info$taxon_distribution, "")), '</p>
<p><strong>Profiles</strong>: ', profile_links(t, info), '</p>
<h2>Traits</h2>
<p><strong>Top source datasets</strong>: ', paste0(esc_v(ds$dataset_id), " (", fmt_int(ds$nr), ")", collapse = ", "), '. See below for a full list of sources.<br>
<strong>Summary</strong>: AusTraits contains ', fmt_int(nt), ' traits from ', fmt_comma(nrec), ' records in ', nrow(ds), ' datasets.</p>
<p><strong>Traits by category</strong> (click to expand). For categorical traits, the values are listed. For numerical traits, the mean and range are shown.</p>
', core_groups(t), '
<h2>Sources</h2>
<div class="tablewrap">', table, '</div>
</article>')
    desc <- paste0(t, " (", na_to(info$family, "None"), "): AusTraits plant trait data. ", fmt_int(nt), " traits, ", fmt_comma(nrec), " records from ", nrow(ds), " datasets.")
    write_page_file(paste0("taxon/", tslug[i], ".html"), page(t, desc, paste0("/pages/taxon/", tslug[i], ".html"), body, "taxon"))
    fam_of[i] <- if (is.na(info$family) || !nzchar(info$family)) "(no family)" else info$family
    if (i %% 5000 == 0) message(sprintf("  taxon pages %d", i))
  }
  fam <- split(names_all, fam_of)

  # ---------- trait pages ----------
  for (j in seq_len(nrow(trait_cov))) {
    tr <- trait_cov$trait_name[j]
    n <- trait_cov$n[j]; ntax <- trait_cov$ntax[j]; nfam <- trait_cov$nfam[j]; nds <- trait_cov$nds[j]
    d <- tdefs[[tr]]
    if (length(d) == 0) {
      items <- "<p>No definition is available for this trait.</p>"
    } else {
      li <- function(k, v) paste0("<li><strong>", esc(k), ": </strong>", v, "</li>")
      uri <- d[["entity_URI"]] %||% ""
      ul <- paste0(li("Label", esc(d[["label"]] %||% "")), li("Entity URI", paste0('<a href="', esc(uri), '" rel="noopener">', esc(uri), "</a>")))
      comments <- d[["comments"]]
      if (is.null(comments) || identical(comments, "")) comments <- "None"
      ul <- paste0(ul, li("Type", esc(d[["type"]] %||% "")), li("Definition", esc(d[["description"]] %||% "")), li("Additional comments", esc(comments)))
      if (identical(d[["type"]], "numeric")) {
        ul <- paste0(ul, li("units", esc(d[["units"]] %||% "")),
                     li("allowable range", paste0(esc(d[["allowed_values_min"]]), " - ", esc(d[["allowed_values_max"]]), " ", esc(if (is.null(d[["units"]]) || identical(d[["units"]], "")) "" else d[["units"]]))))
      } else if (length(d[["allowed_values_levels"]])) {
        lv <- d[["allowed_values_levels"]]
        rows <- paste0(vapply(names(lv), function(k) paste0("<tr><td>", esc(k), "</td><td>", esc(lv[[k]] %||% ""), "</td></tr>"), ""), collapse = "")
        ul <- paste0(ul, '<li><strong>Allowed values: </strong><div class="tablewrap"><table><thead><tr><th>value</th><th>description</th></tr></thead><tbody>', rows, "</tbody></table></div></li>")
      }
      items <- paste0("<ul>", ul, "</ul>")
      if (!is.null(d[["entity_URI"]]) && nzchar(d[["entity_URI"]])) {
        items <- paste0(items, '<p>See the AusTraits Plant Dictionary (<a href="', esc(d[["entity_URI"]]), '" rel="noopener">', esc(d[["entity_URI"]]), "</a>) for additional information about this trait.</p>")
      }
    }
    state <- paste0('{"dataset":"species","rank":"all","trait_name":[', json_str(tr, ascii = TRUE), "]}")
    body <- paste0('<article class="prose">
<h1>', esc(tr), '</h1>
<p class="cta"><a class="btn" href="', esc(portal_link(state)), '">Explore the data for this trait in the portal</a></p>
', items, '
<h2>Coverage</h2>
<p>For this trait, AusTraits includes a total of <strong>', fmt_comma(n), '</strong> records. This includes:</p>
<ul><li>data for <strong>', fmt_comma(ntax), '</strong> species.</li><li>data for <strong>', fmt_comma(nfam), '</strong> families.</li><li>data from <strong>', fmt_comma(nds), '</strong> datasets (see the portal Citations tab for a list of sources)</li></ul>
</article>')
    label <- d[["label"]]
    if (is.null(label) || identical(label, "")) label <- tr
    desc <- paste0(tr, " (", label, "): AusTraits trait definition and coverage. ", fmt_comma(n), " records for ", fmt_comma(ntax), " species from ", fmt_int(nds), " datasets.")
    write_page_file(paste0("trait/", tr_slug[[tr]], ".html"), page(tr, desc, paste0("/pages/trait/", tr_slug[[tr]], ".html"), body, "trait"))
  }

  # ---------- family and index pages ----------
  fslug <- uniq_slugs(names(fam))
  for (f in names(fam)) {
    ts <- sort_c(fam[[f]])
    lis <- paste0('<li><a href="/pages/taxon/', unlist(tslug[ts]), '.html">', esc_v(ts), "</a></li>", collapse = "")
    write_page_file(paste0("family/", fslug[[f]], ".html"),
                    page(f, paste0(f, ": ", fmt_comma(length(ts)), " taxa with plant trait data in AusTraits."), paste0("/pages/family/", fslug[[f]], ".html"),
                         paste0('<article class="prose"><h1>', esc(f), "</h1><p>", fmt_comma(length(ts)), ' taxa with trait data.</p><ul class="cols">', lis, "</ul></article>"), "family"))
  }
  fam_sorted <- sort_c(names(fam))
  fl_li <- paste0('<li><a href="/pages/family/', unlist(fslug[fam_sorted]), '.html">', esc_v(fam_sorted), '</a> <span class="n">',
                  vapply(fam_sorted, function(f) fmt_comma(length(fam[[f]])), ""), "</span></li>", collapse = "")
  tr_li <- paste0('<li><a href="/pages/trait/', unlist(tr_slug[trait_cov$trait_name]), '.html">', esc_v(trait_cov$trait_name), "</a></li>", collapse = "")
  # search index: names only; a slug is added only where it is not just the lower-cased name (see slug() in the page script)
  entries <- function(ns, slugs) {
    s <- unname(slugs[ns])
    nj <- vapply(ns, json_str, "", USE.NAMES = FALSE)
    paste0(ifelse(s == slugify(ns), nj, paste0("[", nj, ",", vapply(s, json_str, "", USE.NAMES = FALSE), "]")), collapse = ",")
  }
  write_page_file("search-index.json", paste0('{"t":[', entries(names_all, tslug), '],"f":[', entries(fam_sorted, fslug), '],"r":[', entries(trait_cov$trait_name, tr_slug), "]}"))
  write_page_file("index.html", page("Browse taxa and traits",
    paste0("Browse ", fmt_comma(length(names_all)), " plant taxa and ", fmt_comma(nrow(trait_cov)), " traits in the AusTraits database."), "/pages/index.html",
    paste0('<article class="prose"><h1>Browse AusTraits</h1><p>', fmt_comma(length(names_all)), " taxa and ", fmt_comma(nrow(trait_cov)),
           ' traits. To filter, view and download data, use the <a href="', esc(portal), '">data portal</a>.</p>', search_box_html,
           '<h2>Families</h2><ul class="cols">', fl_li, '</ul><h2>Traits</h2><ul class="cols">', tr_li, "</ul></article>"), "index"))

  # ---------- style, sitemap, robots ----------
  write_page_file("pages.css", pages_css)
  if (nzchar(base)) {
    urls <- c("/pages/index.html", paste0("/pages/taxon/", unlist(tslug), ".html"), paste0("/pages/trait/", unlist(tr_slug), ".html"),
              paste0("/pages/family/", unlist(fslug[sort_c(names(fslug))]), ".html"))
    write_utf8(paste0('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n',
                      paste0("<url><loc>", esc(base), urls, "</loc></url>\n", collapse = ""), "</urlset>\n"), file.path(out, "sitemap.xml"))
    write_utf8(paste0("User-agent: *\nAllow: /pages/\nDisallow: /data/\nDisallow: /site/\nSitemap: ", base, "/sitemap.xml\n"), file.path(out, "robots.txt"))
  }
  invisible(out)
}

# ---------- helpers for the pages ----------

`%||%` <- function(a, b) if (is.null(a)) b else a

na_to <- function(x, value) if (is.null(x) || length(x) == 0 || is.na(x)) value else x

write_utf8 <- function(text, path) {
  con <- file(path, open = "wb")
  on.exit(close(con))
  writeBin(charToRaw(enc2utf8(text)), con)
}

# HTML-escape one value, as Python's html.escape(quote = TRUE); NULL and NA become ""
esc <- function(s) {
  if (is.null(s) || length(s) == 0 || (length(s) == 1 && is.na(s))) return("")
  esc_v(if (is.numeric(s)) num_str(s) else as.character(s))
}

# A number as text the way Python prints it: plain decimals from 0.0001 up, scientific only below
# (R switches at 0.0001 itself, printing 1e-04)
num_str <- function(x) {
  if (is.integer(x)) return(as.character(x))
  if (x == trunc(x) && abs(x) < 1e16) return(sprintf("%.0f", x))
  if (abs(x) >= 1e-4 && abs(x) < 1e16) return(format(x, digits = 15, scientific = FALSE, trim = TRUE))
  as.character(x)
}
esc_v <- function(s) {
  s <- ifelse(is.na(s), "", as.character(s))
  s <- gsub("&", "&amp;", s, fixed = TRUE)
  s <- gsub("<", "&lt;", s, fixed = TRUE)
  s <- gsub(">", "&gt;", s, fixed = TRUE)
  s <- gsub('"', "&quot;", s, fixed = TRUE)
  gsub("'", "&#x27;", s, fixed = TRUE)
}

fmt_int <- function(x) sprintf("%.0f", as.numeric(x))
fmt_comma <- function(x) formatC(as.numeric(x), format = "f", digits = 0, big.mark = ",")

slugify <- function(s) {
  s <- gsub("^-+|-+$", "", gsub("[^a-z0-9]+", "-", tolower(s)))
  ifelse(nzchar(s), s, "x")
}

# Slugs for a set of names, made unique with -2, -3 … in sorted-name order; a named character vector
uniq_slugs <- function(ns) {
  ns <- sort_c(ns)
  s <- slugify(ns)
  k <- stats::ave(seq_along(s), s, FUN = seq_along)
  stats::setNames(ifelse(k > 1, paste0(s, "-", k), s), ns)
}

# The portal's small markdown reader: **bold**, _italic_, [text](url), <url>
inline_md <- function(s) {
  s <- esc(s)
  s <- gsub("\\*\\*([^*]+)\\*\\*", "<strong>\\1</strong>", s, perl = TRUE)
  s <- gsub("(*UCP)(^|[\\s(])_([^_\\n]+)_(?=[\\s.,;:)]|$)", "\\1<em>\\2</em>", s, perl = TRUE)
  s <- gsub("(*UCP)\\[([^\\]]+)\\]\\((https?:[^)\\s]+)\\)", '<a href="\\2" rel="noopener">\\1</a>', s, perl = TRUE)
  gsub("(*UCP)&lt;(https?:[^\\s&]+)&gt;", '<a href="\\1" rel="noopener">\\1</a>', s, perl = TRUE)
}

# Round to 2 decimals and drop a trailing .0; text that is not a number is returned as it is
r2 <- function(v) {
  if (is.null(v) || length(v) == 0 || is.na(v)) return("")
  n <- if (is.numeric(v)) v else suppressWarnings(as.numeric(trimws(v)))
  if (is.na(n) || is.infinite(n)) return(as.character(v))
  n <- round(n * 100) / 100
  if (n == trunc(n)) return(if (n == 0) "0" else sprintf("%.0f", n))
  num_str(n)
}

# One string as a JSON string literal; with ascii = TRUE, non-ASCII characters become \uXXXX escapes
json_str <- function(x, ascii = FALSE) {
  cp <- utf8ToInt(enc2utf8(x))
  parts <- vapply(cp, function(c) {
    if (c == 34) return('\\"')
    if (c == 92) return("\\\\")
    if (c == 10) return("\\n")
    if (c == 13) return("\\r")
    if (c == 9) return("\\t")
    if (c == 8) return("\\b")
    if (c == 12) return("\\f")
    if (c < 32) return(sprintf("\\u%04x", c))
    if (ascii && c > 127) {
      if (c > 0xFFFF) {
        c2 <- c - 0x10000
        return(sprintf("\\u%04x\\u%04x", 0xD800 + c2 %/% 0x400, 0xDC00 + c2 %% 0x400))
      }
      return(sprintf("\\u%04x", c))
    }
    intToUtf8(c)
  }, "")
  paste0('"', paste(parts, collapse = ""), '"')
}

search_box_html <- r"---(<div class="search"><label for="q">Search taxa, traits and families</label><input id="q" type="search" autocomplete="off" placeholder="For example Acacia melanoxylon, leaf area, Fabaceae" aria-controls="results"><ul id="results" class="results" role="listbox" hidden></ul><p id="qnote" class="n" aria-live="polite"></p></div>
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
</script>)---"

pages_css <- r"---(:root{--ink:#2b332f;--muted:#64726b;--green:#2f7d55;--green-dark:#235c43;--line:#e5e8e5;--cream:#f7f7f4;--bg:#fff}
@media (prefers-color-scheme:dark){:root{--ink:#e6ebe8;--muted:#9fb0a8;--green:#6fc29a;--green-dark:#8fd6b3;--line:#2f3a35;--cream:#1d2421;--bg:#141a17}}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--green-dark)}.top{display:flex;gap:1rem;align-items:center;justify-content:space-between;padding:.7rem 1rem;border-bottom:1px solid var(--line);background:var(--cream);flex-wrap:wrap}
.brand{font-weight:700;text-decoration:none;font-size:1.1rem}.top nav{display:flex;gap:1rem}main{max-width:60rem;margin:0 auto;padding:1rem}
h1{font-size:1.7rem;margin:.6rem 0}h2{font-size:1.25rem;margin-top:1.6rem}.btn{display:inline-block;background:var(--green);color:#fff;padding:.5rem .9rem;border-radius:8px;text-decoration:none}
details{margin:.3rem 0;border:1px solid var(--line);border-radius:8px;padding:.3rem .7rem}summary{cursor:pointer;font-weight:600}
.tablewrap{overflow-x:auto}table{border-collapse:collapse;font-size:.9rem;width:100%}th,td{border-bottom:1px solid var(--line);padding:.35rem .5rem;text-align:left;vertical-align:top}
.cols{columns:16rem;list-style:none;padding:0}.cols li{break-inside:avoid;padding:.1rem 0}.n{color:var(--muted);font-size:.85rem}
.search{margin:1rem 0}.search label{display:block;font-weight:600;margin-bottom:.3rem}.search input{width:100%;padding:.6rem .8rem;font:inherit;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.results{list-style:none;margin:.3rem 0 0;padding:0;border:1px solid var(--line);border-radius:8px;max-height:22rem;overflow:auto;background:var(--bg)}.results li{display:flex;justify-content:space-between;gap:1rem;padding:.35rem .7rem;border-bottom:1px solid var(--line)}.results li:last-child{border-bottom:0}.results li.on,.results li:hover{background:var(--cream)}.results a{flex:1}.tag{color:var(--muted);font-size:.8rem}
footer{max-width:60rem;margin:2rem auto;padding:1rem;color:var(--muted);font-size:.85rem;border-top:1px solid var(--line)}
)---"
