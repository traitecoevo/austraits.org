#' Write default_view.json: the first page of the portal's default view
#'
#' The portal shows this stored page while its database engine starts. It is
#' built with the browser's own query code (`toSql.mjs`, run in V8) and the
#' same default filters, column list and page size as `app.js`, so it holds
#' exactly the rows the portal would show.
#'
#' @param data A data folder built by [build_browser_data()].
#' @param tosql Path to the browser's `toSql.mjs`.
#' @param app_js Path to the browser's `app.js` (for the displayed column lists).
#' @param page_size Rows on the first page (the portal's default is 100).
#' @return The path written, invisibly.
build_default_view <- function(data, tosql = file.path("browser-portal", "js", "toSql.mjs"),
                               app_js = file.path("browser-portal", "js", "app.js"), page_size = 100) {
  ctx <- load_browser_sql(tosql)
  con <- browser_connection(ctx, data)
  on.exit(DBI::dbDisconnect(con, shutdown = TRUE), add = TRUE)
  spec <- read_json_file(file.path(data, "filter_spec.json"))
  portal <- read_json_file(file.path(data, "portal.json"))
  feats <- browser_features(con, data)
  taxa_cols <- browser_taxa_cols(con)

  # app.js defaults() then toFilterState()
  d <- portal$defaults
  dataset <- d$dataset
  st <- list(dataset = dataset)
  rank <- d$taxon_type %||% "all"
  if (!identical(rank, "all")) {
    st$taxon_type <- rank
    st[[rank]] <- if (identical(rank, "family")) d$family %||% list() else list()
  }
  st$trait_name <- list()
  st$custom <- list()

  cols <- app_js_columns(app_js, if (identical(dataset, "species")) "SPECIES_COLS" else "RAW_COLS")
  query_cols <- if (identical(dataset, "species")) c(cols, "unit") else cols

  total <- db_get(con, browser_sql(ctx, "countSql", st, spec, feats, as.list(taxa_cols)))$n
  ids <- db_get(con, browser_helper(ctx, "pageIdStep", st, spec, feats, as.list(taxa_cols), page_size, 0, V8::JS("null"), as.list(query_cols)))$seq
  rows <- db_get(con, browser_helper(ctx, "pageFinish", st, spec, feats, as.list(taxa_cols), page_size, 0, V8::JS("null"), as.list(query_cols), as.list(ids)))
  out <- file.path(data, "default_view.json")
  txt <- jsonlite::toJSON(list(data_version = portal$data_version, total = total, rows = rows),
                          auto_unbox = TRUE, dataframe = "rows", na = "null", null = "null", digits = NA)
  writeLines(txt, out, useBytes = TRUE)
  message(sprintf("Wrote %s: %d rows, total %s", out, nrow(rows), format(total, big.mark = ",")))
  invisible(out)
}

# Read a column list such as `const SPECIES_COLS = [...]` from app.js
app_js_columns <- function(app_js, name) {
  js <- paste(readLines(app_js, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
  m <- regmatches(js, regexpr(sprintf("const %s = \\[[^]]*\\]", name), js))
  if (!length(m)) stop(sprintf("Could not find %s in %s", name, app_js), call. = FALSE)
  jsonlite::fromJSON(sub("^[^[]*", "", m))
}
