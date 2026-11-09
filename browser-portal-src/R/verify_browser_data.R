#' Check a built data folder against the input it was built from
#'
#' Rebuilds the original raw table from `raw_by_trait.parquet` + `taxa.parquet`
#' and checks that it holds exactly the input rows, then checks the other
#' tables' keys and the filter choices. Stops with a list of every failed check,
#' so a broken release cannot be uploaded by mistake.
#'
#' @param src The input folder given to [build_browser_data()].
#' @param out The built data folder.
#' @return A data frame of the checks and their counts (all 0), invisibly.
verify_browser_data <- function(src, out) {
  con <- DBI::dbConnect(duckdb::duckdb())
  on.exit(DBI::dbDisconnect(con, shutdown = TRUE), add = TRUE)
  create_source_views(con, src)
  f <- function(name) sql_str(file.path(out, paste0(name, ".parquet")))
  for (v in c("taxa", "raw_by_trait", "raw_by_taxon", "species_averages", "dataset_citations", "taxon_lookup")) {
    db_run(con, sprintf("CREATE OR REPLACE VIEW %s AS SELECT * FROM %s", v, f(v)))
  }
  n <- function(sql) as.numeric(db_get(con, sql)[[1]])

  raw_cols <- setdiff(db_columns(con, "raw_by_trait"), "seq")
  tax_cols <- setdiff(db_columns(con, "taxa"), c("taxon_name", "family", "genus"))
  orig_cols <- setdiff(db_columns(con, "d"), dropped_columns)
  db_run(con, sprintf("CREATE OR REPLACE VIEW rebuilt AS SELECT %s, %s FROM raw_by_trait r JOIN taxa t USING (taxon_name)",
                      paste0("r.", sql_id(raw_cols), collapse = ", "), paste0("t.", sql_id(tax_cols), collapse = ", ")))
  oc <- sql_ids(orig_cols)
  rc <- sql_ids(raw_cols)
  sp_in <- setdiff(db_columns(con, "species_averages"), "seq")
  sp_in <- intersect(sp_in, db_columns(con, "s"))

  dd <- jsonlite::read_json(file.path(out, "dropdowns.json"), simplifyVector = TRUE)
  genus_in_data <- db_get(con, "SELECT DISTINCT genus FROM taxa")$genus
  family_in_data <- db_get(con, "SELECT DISTINCT family FROM taxa")$family

  checks <- c(
    "raw rows: input minus rebuilt" = n(sprintf("SELECT count(*) FROM (SELECT %1$s FROM d EXCEPT ALL SELECT %1$s FROM rebuilt)", oc)),
    "raw rows: rebuilt minus input" = n(sprintf("SELECT count(*) FROM (SELECT %1$s FROM rebuilt EXCEPT ALL SELECT %1$s FROM d)", oc)),
    "raw rows: taxon-sorted copy differs from trait-sorted copy" = n(sprintf("SELECT count(*) FROM (SELECT %1$s FROM raw_by_trait EXCEPT ALL SELECT %1$s FROM raw_by_taxon)", rc)),
    "raw rows: count differs between the two copies" = abs(n("SELECT count(*) FROM raw_by_trait") - n("SELECT count(*) FROM raw_by_taxon")),
    "species rows: input minus built" = n(sprintf("SELECT count(*) FROM (SELECT %1$s FROM s EXCEPT ALL SELECT %1$s FROM species_averages)", sql_ids(sp_in))),
    "species rows: built minus input" = n(sprintf("SELECT count(*) FROM (SELECT %1$s FROM species_averages EXCEPT ALL SELECT %1$s FROM s)", sql_ids(sp_in))),
    "taxa: data taxa missing from taxa.parquet" = n("SELECT count(*) FROM (SELECT DISTINCT taxon_name FROM raw_by_trait) WHERE taxon_name NOT IN (SELECT taxon_name FROM taxa)"),
    "taxa: species taxa missing from taxa.parquet" = n("SELECT count(*) FROM (SELECT DISTINCT taxon_name FROM species_averages) WHERE taxon_name NOT IN (SELECT taxon_name FROM taxa)"),
    "taxa: duplicate taxon_name (taxon columns not constant per name)" = n("SELECT count(*) - count(DISTINCT taxon_name) FROM taxa"),
    "dataset_citations: duplicate dataset_id (would double rows in the raw view)" = n("SELECT count(*) - count(DISTINCT dataset_id) FROM dataset_citations"),
    "dataset_citations: data datasets missing" = n("SELECT count(*) FROM (SELECT DISTINCT dataset_id FROM raw_by_trait) WHERE dataset_id NOT IN (SELECT dataset_id FROM dataset_citations)"),
    "seq: duplicates in raw_by_trait" = n("SELECT count(*) - count(DISTINCT seq) FROM raw_by_trait"),
    "seq: duplicates in raw_by_taxon" = n("SELECT count(*) - count(DISTINCT seq) FROM raw_by_taxon"),
    "seq: duplicates in species_averages" = n("SELECT count(*) - count(DISTINCT seq) FROM species_averages"),
    "seq: raw_by_trait not numbered 1..N" = n("SELECT (min(seq) <> 1 OR max(seq) <> count(*))::INTEGER FROM raw_by_trait"),
    "taxon_lookup: names pointing to an unknown taxon" = n("SELECT count(*) FROM taxon_lookup WHERE taxon_name NOT IN (SELECT taxon_name FROM taxa)"),
    "dropdowns: genera with no data" = length(setdiff(dd$all_genus, genus_in_data)),
    "dropdowns: families with no data" = length(setdiff(dd$all_family, family_in_data))
  )
  result <- data.frame(check = names(checks), count = unname(checks))
  failed <- result[result$count != 0, ]
  if (nrow(failed)) {
    stop("The built data folder failed these checks (counts should be 0):\n  ",
         paste(sprintf("%s: %s", failed$check, failed$count), collapse = "\n  "), call. = FALSE)
  }
  message(sprintf("All %d checks passed (%s raw rows, %s species rows).", nrow(result),
                  format(n("SELECT count(*) FROM raw_by_trait"), big.mark = ","),
                  format(n("SELECT count(*) FROM species_averages"), big.mark = ",")))
  invisible(result)
}
