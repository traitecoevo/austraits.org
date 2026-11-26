#' Check the downloads' recreate.R scripts against the golden cases
#'
#' Every download carries `recreate.R`, written by the browser's
#' `browser-portal/js/recreate.js`: R code that loads the release with the
#' austraits package and applies the portal's filters. This runs that same
#' file in V8 for each golden case, evaluates the script in R on the release's
#' database and published means, and checks it returns the case's expected row
#' count (which [make_golden_cases()] computed with the Shiny portal's filter
#' code). Passing means a download's script rebuilds the download.
#'
#' To keep it quick, each script runs on the database flattened once: its
#' `austraits::flatten_database()` step is replaced by the flattened table.
#'
#' @param data A data folder built by [build_browser_data()] (for `filter_spec.json`,
#'   `trait_features.parquet` and `portal.json`).
#' @param database_dir Folder holding `austraits-<version>.rds` and
#'   `austraits-<version>-observed-means.rds`, as austraits.portal's data
#'   preparation leaves them (the folder above its `--src`).
#' @param cases Path to the golden cases file (with expected values for this release).
#' @param tosql,recreate Paths to the browser's `toSql.mjs` and `recreate.js`.
#' @return A data frame with one row per case and a `pass` column; stops if any case fails.
check_recreate_scripts <- function(data, database_dir,
                                   cases = file.path("browser-portal-src", "golden", "golden_cases.json"),
                                   tosql = file.path("browser-portal", "js", "toSql.mjs"),
                                   recreate = file.path("browser-portal", "js", "recreate.js")) {
  portal <- read_json_file(file.path(data, "portal.json"))
  version <- portal$data_version
  files <- file.path(database_dir, sprintf("austraits-%s%s.rds", version, c("", "-observed-means")))
  missing <- files[!file.exists(files)]
  if (length(missing)) stop("check_recreate_scripts() needs the release files:\n  ", paste(missing, collapse = "\n  "), call. = FALSE)
  database <- readRDS(files[1])
  means <- readRDS(files[2])
  message("Flattening the database once for the scripts…")
  flattened <- austraits::flatten_database(database)

  ctx <- load_browser_recreate(tosql, recreate)
  con <- DBI::dbConnect(duckdb::duckdb())
  on.exit(DBI::dbDisconnect(con, shutdown = TRUE), add = TRUE)
  spec <- read_json_file(file.path(data, "filter_spec.json"))
  feats <- browser_features(con, data)
  list_cases <- read_json_file(cases)

  res <- do.call(rbind, lapply(list_cases, function(cs) {
    script <- ctx$call("recreateScript", cs$state, spec, feats, portal$zenodo_meta, "2000-01-01", FALSE, auto_unbox = TRUE)
    script <- sub("austraits::flatten_database() |>", "identity() |>", script, fixed = TRUE)
    env <- new.env(parent = globalenv())
    if (identical(cs$state$dataset, "species")) {
      env$means <- means
      env$austraits <- database
    } else {
      env$austraits <- flattened
    }
    rows <- tryCatch({
      eval(parse(text = script), envir = env)
      nrow(env$data)
    }, error = function(e) {
      message(cs$name, ": ", conditionMessage(e))
      NA_integer_
    })
    data.frame(name = cs$name, expected_rows = cs$expected$rows, rows = rows,
               pass = identical(as.integer(rows), as.integer(cs$expected$rows)))
  }))
  bad <- res[!res$pass, ]
  if (nrow(bad)) {
    stop(sprintf("%d of %d recreate.R scripts returned the wrong rows:\n  %s", nrow(bad), nrow(res),
                 paste(sprintf("%s (expected %s rows, got %s)", bad$name, bad$expected_rows, bad$rows), collapse = "\n  ")), call. = FALSE)
  }
  message(sprintf("All %d recreate.R scripts return the portal's rows.", nrow(res)))
  invisible(res)
}

#' Load the browser's recreate.js (and the toSql.mjs it imports) into V8
#' @noRd
load_browser_recreate <- function(tosql, recreate) {
  ctx <- load_browser_sql(tosql)
  js <- paste(readLines(recreate, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
  js <- gsub("(?m)^import [^\n]*\n", "", js, perl = TRUE)
  js <- gsub("(?m)^export (function|const)", "\\1", js, perl = TRUE)
  ctx$eval("var matchingTraits = T.matchingTraits;")
  ctx$eval(js)
  ctx
}
