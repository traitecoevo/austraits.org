#' Test the browser portal in a real browser against a local data folder
#'
#' Serves `browser-portal/` and a built data folder from one local web server
#' (the portal's `config.json` is rewritten on the fly to point at the local
#' data; usage counting is switched off), opens the portal in headless Chrome
#' with chromote, and works through it the way a visitor would: the stored
#' first page, a set of filter searches whose row counts must equal the golden
#' cases, the Taxon View, Trait View and Citations tabs, and a download.
#' Stops with a list of every failure.
#'
#' The database engine itself is still fetched from `engineBase` in
#' `config.json`, so the test needs internet access.
#'
#' @param data A data folder built by [build_browser_data()] (with `default_view.json`).
#' @param cases Golden cases whose expected row counts the searches are checked against.
#' @param site The portal folder.
#' @param port Local port for the web server.
#' @return A data frame of the checks, invisibly.
test_portal_in_browser <- function(data, cases = file.path("browser-portal-src", "golden", "golden_cases.json"),
                                   site = "browser-portal", port = 8765) {
  portal <- read_json_file(file.path(data, "portal.json"))
  server <- serve_portal_background(site, data, portal$data_version, port)
  on.exit(server$kill(), add = TRUE)

  b <- chromote::ChromoteSession$new(width = 1400, height = 1000)
  on.exit(b$close(), add = TRUE)
  errors <- character()
  b$Runtime$enable()
  b$Runtime$exceptionThrown(callback_ = function(m) errors <<- c(errors, m$exceptionDetails$exception$description %||% m$exceptionDetails$text))
  b$Runtime$consoleAPICalled(callback_ = function(m) if (identical(m$type, "error")) errors <<- c(errors, paste(vapply(m$args, function(a) as.character(a$value %||% a$description %||% ""), ""), collapse = " ")))

  js <- function(expr) b$Runtime$evaluate(expr, awaitPromise = TRUE, returnByValue = TRUE, timeout_ = 300)$result$value
  wait_for <- function(cond, seconds = 180) {
    t0 <- Sys.time()
    while (!isTRUE(js(cond))) {
      if (as.numeric(Sys.time() - t0, units = "secs") > seconds) {
        stop("Timed out waiting for: ", cond, "\nPortal status: ", js("document.querySelector('#status-text').textContent"),
             "\nErrors: ", paste(utils::head(errors, 5), collapse = " | "), call. = FALSE)
      }
      Sys.sleep(0.2)
    }
  }
  not_busy <- "!document.querySelector('#table-wrap').classList.contains('busy')"
  checks <- list()
  check <- function(name, ok, detail = "") checks[[length(checks) + 1]] <<- data.frame(check = name, pass = isTRUE(ok), detail = as.character(detail))

  url <- sprintf("http://127.0.0.1:%d/browser-portal/?notrack", port)
  t0 <- Sys.time()
  b$Page$navigate(url)
  # the stored first page shows before the engine is ready
  wait_for("!!(window.__portal && window.__portal.lastRows && window.__portal.lastRows.length)", 60)
  dv <- jsonlite::read_json(file.path(data, "default_view.json"))
  check("stored first page shown", identical(js("window.__portal.lastRows.length"), length(dv$rows)) && identical(js("window.__portal.total"), dv$total),
        sprintf("%s rows of %s", js("window.__portal.lastRows.length"), js("window.__portal.total")))
  wait_for(sprintf("window.__portal.engineReady === true && %s", not_busy), 90)
  check("engine ready", TRUE, sprintf("%.1f s", as.numeric(Sys.time() - t0, units = "secs")))

  # the stored page equals what the engine returns for the default view
  js("document.querySelector('#reset').click(); true")
  Sys.sleep(0.3); wait_for(not_busy)
  live_rows <- js("JSON.stringify(window.__portal.lastRows)")
  check("stored first page matches the engine", identical(jsonlite::fromJSON(live_rows, simplifyVector = FALSE), dv$rows))

  # searches: the portal's count must equal the golden case's expected rows
  for (cs in browser_test_cases(read_json_file(cases))) {
    js(sprintf("(() => { const A = window.__portal; A.S = Object.assign(%s, %s); document.querySelector('#filters button[type=submit]').click(); return true; })()",
               "{dataset:'raw', rank:'all', family:[], genus:[], taxon_name:[], trait_name:[], traitmode:'name', trait_grouping:[], structure_measured:[], keywords:[], location:'', apc:[], min_latitude:'', max_latitude:'', min_longitude:'', max_longitude:'', custom:[]}",
               jsonlite::toJSON(cs$ui, auto_unbox = TRUE, null = "null")))
    Sys.sleep(0.2)
    t1 <- Sys.time()
    wait_for(not_busy)
    got <- js("window.__portal.total")
    shown <- js("document.querySelectorAll('#grid tbody tr').length")
    status_err <- js("document.querySelector('#status').classList.contains('err') ? document.querySelector('#status-text').textContent : ''")
    check(paste("search:", cs$name), identical(as.numeric(got), as.numeric(cs$expected)) && identical(as.numeric(shown), as.numeric(min(100, cs$expected))) && !nzchar(status_err),
          sprintf("expected %s, got %s, %s rows shown, %.1f s %s", cs$expected, got, shown, as.numeric(Sys.time() - t1, units = "secs"), status_err))
  }

  # tabs and download on a single taxon
  open_tab <- function(t, ready) { js(sprintf("document.querySelector('#tab-%s').click(); true", t)); wait_for(ready, 120) }
  set_ui <- function(ui) {
    js(sprintf("(() => { const A = window.__portal; A.S = Object.assign(%s, %s); document.querySelector('#filters button[type=submit]').click(); return true; })()",
               "{dataset:'raw', rank:'all', family:[], genus:[], taxon_name:[], trait_name:[], traitmode:'name', trait_grouping:[], structure_measured:[], keywords:[], location:'', apc:[], min_latitude:'', max_latitude:'', min_longitude:'', max_longitude:'', custom:[]}",
               jsonlite::toJSON(ui, auto_unbox = TRUE)))
    Sys.sleep(0.2); wait_for(not_busy)
  }
  set_ui(list(dataset = "raw", rank = "taxon_name", taxon_name = list("Eucalyptus saligna")))
  open_tab("taxon", "document.querySelector('#taxon-status').hidden && document.querySelector('#taxon-body').textContent.length > 0")
  tb <- js("document.querySelector('#taxon-body').textContent")
  check("Taxon View: Eucalyptus saligna", grepl("Myrtaceae", tb) && grepl("Eucalyptus saligna", tb, fixed = TRUE), substr(gsub("\\s+", " ", tb), 1, 120))
  open_tab("cite", "document.querySelector('#cite-status').hidden && document.querySelector('#cite-body').textContent.length > 0")
  cite <- js("document.querySelector('#cite-body').textContent")
  check("Citations tab", grepl("AusTraits", cite) && nchar(cite) > 500, sprintf("%d characters", nchar(cite)))
  js("document.querySelector('#tab-data').click(); true")

  set_ui(list(dataset = "raw", trait_name = list("leaf_mass_per_area")))
  open_tab("trait", "document.querySelector('#trait-status').hidden && !document.querySelector('#trait-body').hidden && document.querySelector('#tv-map') && document.querySelector('#tv-map').children.length > 0")
  tv <- js("document.querySelector('#tv-profile').textContent")
  check("Trait View: leaf_mass_per_area", grepl("leaf_mass_per_area", tv) && js("!!document.querySelector('#tv-plot svg, #tv-plot canvas')"), substr(gsub("\\s+", " ", tv), 1, 120))
  js("document.querySelector('#tab-data').click(); true")

  set_ui(list(dataset = "raw", rank = "family", family = list("Typhaceae")))
  js("document.querySelector('#download').click(); true")
  wait_for("/Downloaded|failed/.test(document.querySelector('#dl-note').textContent)", 180)
  note <- js("document.querySelector('#dl-note').textContent")
  check("Download a family (zip built in the browser)", grepl("^Downloaded", note), note)

  check("no JavaScript errors", !length(errors), paste(utils::head(errors, 3), collapse = " | "))
  res <- do.call(rbind, checks)
  failed <- res[!res$pass, ]
  for (i in seq_len(nrow(res))) message(sprintf("%s %s  %s", if (res$pass[i]) "ok  " else "FAIL", res$check[i], res$detail[i]))
  if (nrow(failed)) stop(sprintf("%d of %d browser checks failed.", nrow(failed), nrow(res)), call. = FALSE)
  message(sprintf("All %d browser checks pass.", nrow(res)))
  invisible(res)
}

# Golden cases as the portal's interface state (A.S). A visitor sets basis_of_record and life_stage through
# the custom filters, so raw-data cases on them become custom filters; species averages have neither column,
# so those cases are skipped. A few cases of each kind keep the run short; run_golden_cases() covers all.
browser_test_cases <- function(cases, per_kind = 3) {
  out <- list()
  for (cs in cases) {
    st <- cs$state
    if (length(st$basis_of_record) || length(st$life_stage)) {
      if (!identical(st$dataset, "raw")) next
      for (k in c("basis_of_record", "life_stage")) {
        if (length(st[[k]])) st$custom <- c(st$custom, list(list(column = k, value = st[[k]])))
      }
    }
    ui <- list(dataset = st$dataset, rank = st$taxon_type %||% "all")
    for (k in c("family", "genus", "taxon_name", "trait_name", "trait_grouping", "structure_measured", "keywords")) if (length(st[[k]])) ui[[k]] <- st[[k]]
    if (length(st$trait_grouping) || length(st$structure_measured) || length(st$keywords)) ui$traitmode <- "features"
    if (length(st$location)) ui$location <- st$location
    if (length(st$apc_taxon_distribution)) ui$apc <- st$apc_taxon_distribution
    for (k in c("min_latitude", "max_latitude", "min_longitude", "max_longitude")) if (length(st[[k]])) ui[[k]] <- as.character(st[[k]])
    if (length(st$custom)) ui$custom <- st$custom
    kind <- sub(" .*$", "", sub("^[a-z]+: ", "", cs$name))
    out[[length(out) + 1]] <- list(name = cs$name, kind = paste(st$dataset, kind), ui = ui, expected = cs$expected$rows)
  }
  # a few cases of each kind keep the run short but cover every filter type
  kinds <- vapply(out, function(x) x$kind, "")
  out[unlist(lapply(split(seq_along(out), kinds), function(i) utils::head(i, per_kind)))]
}

# Run serve_portal() in a background R process. The browser driver blocks this process while it waits
# for Chrome, so a server running here would never get a turn to answer.
serve_portal_background <- function(site, data, version, port) {
  helpers <- list(serve_portal = serve_portal, read_json_file = read_json_file, `%||%` = `%||%`)
  proc <- callr::r_bg(function(helpers, site, data, version, port) {
    for (n in names(helpers)) assign(n, helpers[[n]], envir = globalenv())
    serve_portal(site, data, version, port)
    repeat httpuv::service(50)
  }, args = list(helpers = helpers, site = normalizePath(site), data = normalizePath(data), version = version, port = port),
  supervise = TRUE)
  url <- sprintf("http://127.0.0.1:%d/browser-portal/", port)
  for (i in 1:100) {
    up <- tryCatch({ readLines(url, n = 1, warn = FALSE); TRUE }, error = function(e) FALSE, warning = function(w) FALSE)
    if (up) return(proc)
    if (!proc$is_alive()) stop("The local web server stopped: ", proc$read_all_error(), call. = FALSE)
    Sys.sleep(0.1)
  }
  proc$kill()
  stop("The local web server did not start on port ", port, call. = FALSE)
}

#' Serve the portal and a data folder locally, with HEAD and byte-range support
#'
#' @return The httpuv server (call `$stop()` when done).
serve_portal <- function(site, data, version, port = 8765) {
  site <- normalizePath(site)
  data <- normalizePath(data)
  types <- c(html = "text/html", js = "text/javascript", mjs = "text/javascript", css = "text/css", json = "application/json",
             png = "image/png", svg = "image/svg+xml", parquet = "application/octet-stream", bib = "text/plain")
  send_file <- function(req, file) {
    if (!file.exists(file) || dir.exists(file)) return(list(status = 404L, headers = list("Content-Type" = "text/plain"), body = "not found"))
    size <- file.size(file)
    type <- types[[tolower(tools::file_ext(file))]] %||% "application/octet-stream"
    h <- list("Content-Type" = type, "Accept-Ranges" = "bytes", "Cache-Control" = "no-store")
    rng <- req$HTTP_RANGE
    if (!is.null(rng) && grepl("^bytes=\\d+-\\d*$", rng)) {
      a <- as.numeric(sub("^bytes=(\\d+)-.*$", "\\1", rng))
      z <- sub("^bytes=\\d+-", "", rng)
      z <- if (nzchar(z)) min(as.numeric(z), size - 1) else size - 1
      if (a >= size || z < a) {
        return(list(status = 416L, headers = c(h, list("Content-Range" = sprintf("bytes */%.0f", size))), body = ""))
      }
      con <- file(file, "rb"); on.exit(close(con))
      seek(con, a)
      body <- readBin(con, "raw", n = z - a + 1)
      h[["Content-Range"]] <- sprintf("bytes %.0f-%.0f/%.0f", a, z, size)
      return(list(status = 206L, headers = h, body = body))
    }
    # httpuv sends whatever body it is given, even for HEAD, which would corrupt the next request on the
    # connection; so HEAD gets an empty body and an explicit length
    if (identical(req$REQUEST_METHOD, "HEAD")) {
      h[["Content-Length"]] <- sprintf("%.0f", size)
      return(list(status = 200L, headers = h, body = raw(0)))
    }
    list(status = 200L, headers = h, body = readBin(file, "raw", n = size))
  }
  app <- list(call = function(req) {
    path <- utils::URLdecode(req$PATH_INFO)
    if (path == "/browser-portal/config.json") {
      cfg <- read_json_file(file.path(site, "config.json"))
      cfg$dataBase <- sprintf("http://127.0.0.1:%d/data/%s", port, version)
      cfg$telemetry <- NULL  # never count test visits
      return(list(status = 200L, headers = list("Content-Type" = "application/json", "Cache-Control" = "no-store"),
                  body = as.character(jsonlite::toJSON(cfg, auto_unbox = TRUE, null = "null"))))
    }
    if (path == "/browser-portal" || path == "/browser-portal/") return(send_file(req, file.path(site, "index.html")))
    if (startsWith(path, "/browser-portal/")) return(send_file(req, file.path(site, sub("^/browser-portal/", "", path))))
    prefix <- sprintf("/data/%s/", version)
    if (startsWith(path, prefix)) return(send_file(req, file.path(data, sub(prefix, "", path, fixed = TRUE))))
    list(status = 404L, headers = list("Content-Type" = "text/plain"), body = "not found")
  })
  httpuv::startServer("127.0.0.1", port, app)
}
