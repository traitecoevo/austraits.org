#' Golden test cases: the browser's filters against the Shiny portal's
#'
#' Each golden case is a filter state plus the row count and a checksum of the
#' rows it should match. [make_golden_cases()] computes those expected values
#' with the Shiny portal's own filter code (austraits.portal's
#' `parse_filters()` and `apply_filters()`) on the release inputs.
#' [run_golden_cases()] runs every case through the browser's `toSql.mjs` on
#' the built data folder and compares. Passing all cases means the browser
#' portal returns the same rows as the Shiny portal for this release.
#'
#' The checksum is the md5 of the matching rows' identifying columns, each
#' row's columns joined by U+001F and the sorted rows joined by U+001E (the
#' same recipe as `browser-portal-src/test/golden.test.ts`).
#' @name golden
NULL

# Columns that identify a row, per dataset (must match test/golden.test.ts)
golden_id_columns <- list(
  raw = c("trait_name", "taxon_name", "dataset_id", "observation_id", "value"),
  species = c("trait_name", "taxon_name", "dataset_id", "value_type", "value_mean")
)

# Row count and checksum of the rows a SELECT returns
golden_keyset <- function(con, from_sql, dataset) {
  key <- paste0("coalesce(", sql_id(golden_id_columns[[dataset]]), ", '')", collapse = " || chr(31) || ")
  k <- db_get(con, sprintf("SELECT %s AS k FROM (%s) ORDER BY k", key, from_sql))$k
  list(rows = length(k), md5 = digest::digest(enc2utf8(paste(k, collapse = "\x1e")), algo = "md5", serialize = FALSE))
}

#' Compute the expected results of the golden cases with the Shiny portal's filter code
#'
#' @param src The input folder given to [build_browser_data()].
#' @param portal_repo A checkout of austraits.portal (its filter code is the reference).
#' @param cases Path to the golden cases file; its filter states are kept and its expected values replaced.
#' @param out Where to write the updated cases (defaults to `cases`).
#' @return The cases, invisibly.
make_golden_cases <- function(src, portal_repo, cases = file.path("browser-portal-src", "golden", "golden_cases.json"), out = cases,
                              workers = min(8L, default_workers())) {
  list_cases <- read_json_file(cases)
  states <- lapply(list_cases, function(x) x$state)
  # each worker loads austraits.portal and opens its own connection, then works through its share of cases
  job <- function(idx, states, src, portal_repo) {
    ref <- shiny_reference(src, portal_repo)
    on.exit(DBI::dbDisconnect(ref$con, shutdown = TRUE), add = TRUE)
    lapply(idx, function(i) golden_keyset(ref$con, ref$query_sql(states[[i]]), states[[i]]$dataset))
  }
  environment(job) <- topenv()
  res <- run_on_workers(length(states), workers, job, states = states, src = normalizePath(src), portal_repo = normalizePath(portal_repo))
  for (i in seq_along(list_cases)) list_cases[[i]]$expected <- res[[i]]
  write_json_file(list_cases, out, pretty = TRUE)
  message(sprintf("Wrote %d golden cases to %s", length(list_cases), out))
  invisible(list_cases)
}

# Run job(idx, ...) over items 1..n dealt to `workers` fresh R processes (or in this process when
# workers is 1), and return one result per item, in order
run_on_workers <- function(n, workers, job, ...) {
  groups <- deal(n, workers)
  res <- if (length(groups) <= 1) {
    list(job(seq_len(n), ...))
  } else {
    cl <- start_workers(length(groups))
    on.exit(parallel::stopCluster(cl), add = TRUE)
    parallel::clusterApply(cl, groups, job, ...)
  }
  out <- vector("list", n)
  for (g in seq_along(groups)) out[groups[[g]]] <- res[[g]]
  out
}

# The Shiny portal's filter code, pointed at the release inputs. Returns the connection and a function
# that turns a golden filter state into the SQL the Shiny portal would run.
shiny_reference <- function(src, portal_repo) {
  Sys.setenv(AUSTRAITS_TELEMETRY = "off")
  suppressMessages(pkgload::load_all(portal_repo, quiet = TRUE, export_all = FALSE))
  ns <- asNamespace("austraits.portal")
  # apply_filters() reads the trait groups from its environment; give it this release's table
  env <- new.env(parent = ns)
  env$trait_groups <- readRDS(file.path(src, "trait_groups.rds"))
  apply_filters <- get("apply_filters", envir = ns)
  environment(apply_filters) <- env
  parse_filters <- get("parse_filters", envir = ns)

  # The same views as austraits.portal's load_portal_data(): the display file for raw data (coordinates
  # cast to numbers, genus bracket stripped) and the species file
  con <- DBI::dbConnect(duckdb::duckdb())
  genus <- "regexp_replace(genus, '^[(]', '') AS genus"
  db_run(con, sprintf('CREATE VIEW austraits_display AS SELECT * REPLACE (TRY_CAST("latitude (deg)" AS DOUBLE) AS "latitude (deg)",
    TRY_CAST("longitude (deg)" AS DOUBLE) AS "longitude (deg)", %s) FROM read_parquet(%s)', genus, sql_str(file.path(src, "austraits-display.parquet"))))
  db_run(con, sprintf("CREATE VIEW austraits_species AS SELECT * REPLACE (%s) FROM read_parquet(%s)", genus,
                      sql_str(file.path(src, "austraits-species-averages.parquet"))))
  tables <- list(raw = dplyr::tbl(con, "austraits_display"), species = dplyr::tbl(con, "austraits_species"))

  query_sql <- function(st) {
    input <- golden_state_to_shiny_input(st)
    parsed <- parse_filters(input)
    res <- NULL
    utils::capture.output(res <- apply_filters(tables[[st$dataset]], parsed))  # it logs every filter to stdout
    as.character(dbplyr::sql_render(res))
  }
  list(con = con, query_sql = query_sql)
}

# A golden filter state (the browser's toFilterState() shape) as the Shiny app's `input`
golden_state_to_shiny_input <- function(st) {
  v <- function(k) if (length(st[[k]])) unlist(st[[k]]) else NULL
  features <- c("trait_grouping", "structure_measured", "keywords")
  raw <- identical(st$dataset, "raw")
  input <- list(
    dataset_type = st$dataset,
    taxon_type = st$taxon_type %||% "all",
    family = v("family"), genus = v("genus"), taxon_name = v("taxon_name"),
    trait_filter_type = if (any(vapply(features, function(k) length(st[[k]]) > 0, TRUE))) "features" else "name",
    trait_name = v("trait_name"), trait_grouping = v("trait_grouping"),
    structure_measured = v("structure_measured"), keywords = v("keywords"),
    location = st$location %||% "",
    apc_taxon_distribution = v("apc_taxon_distribution"),
    min_latitude = st$min_latitude, max_latitude = st$max_latitude,
    min_longitude = st$min_longitude, max_longitude = st$max_longitude,
    # the interface clears these for species averages, which have no such columns
    basis_of_record = if (raw) v("basis_of_record") else NULL,
    life_stage = if (raw) v("life_stage") else NULL
  )
  for (i in seq_along(st$custom)) {
    input[[paste0("custom_col_", i)]] <- st$custom[[i]]$column
    input[[paste0("custom_val_", i)]] <- unlist(st$custom[[i]]$value)
  }
  input
}

#' Run the golden cases through the browser's filter code on a built data folder
#'
#' @param data A data folder built by [build_browser_data()].
#' @param cases Path to the golden cases file.
#' @param tosql Path to the browser's `toSql.mjs`.
#' @param dataset Run only "raw" or "species" cases; NULL runs all.
#' @return A data frame with one row per case and a `pass` column; stops if any case fails.
run_golden_cases <- function(data, cases = file.path("browser-portal-src", "golden", "golden_cases.json"),
                             tosql = file.path("browser-portal", "js", "toSql.mjs"), dataset = NULL,
                             workers = min(8L, default_workers())) {
  list_cases <- read_json_file(cases)
  if (!is.null(dataset)) list_cases <- Filter(function(x) identical(x$state$dataset, dataset), list_cases)
  # each worker loads the browser's toSql.mjs into its own V8 engine and opens its own connection
  job <- function(idx, list_cases, data, tosql) {
    ctx <- load_browser_sql(tosql)
    con <- browser_connection(ctx, data)
    on.exit(DBI::dbDisconnect(con, shutdown = TRUE), add = TRUE)
    spec <- read_json_file(file.path(data, "filter_spec.json"))
    feats <- browser_features(con, data)
    lapply(idx, function(i) {
      cs <- list_cases[[i]]
      where <- browser_helper(ctx, "whereFor", cs$state, spec, feats)
      got <- golden_keyset(con, paste0("SELECT * FROM ", cs$state$dataset, where), cs$state$dataset)
      data.frame(name = cs$name, expected_rows = cs$expected$rows, rows = got$rows,
                 pass = identical(got$rows, as.integer(cs$expected$rows)) && identical(got$md5, cs$expected$md5))
    })
  }
  environment(job) <- topenv()
  res <- do.call(rbind, run_on_workers(length(list_cases), workers, job, list_cases = list_cases,
                                       data = normalizePath(data), tosql = normalizePath(tosql)))
  bad <- res[!res$pass, ]
  if (nrow(bad)) {
    stop(sprintf("%d of %d golden cases failed:\n  %s", nrow(bad), nrow(res),
                 paste(sprintf("%s (expected %s rows, got %s)", bad$name, bad$expected_rows, bad$rows), collapse = "\n  ")), call. = FALSE)
  }
  message(sprintf("All %d golden cases pass.", nrow(res)))
  invisible(res)
}
