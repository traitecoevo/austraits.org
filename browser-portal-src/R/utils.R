# Small helpers shared by the data-build functions. Written as package code (no library() calls,
# every external function namespaced) so the files in this folder can move into the austraits.portal
# package unchanged.

# A string as an SQL literal: 'it''s'
sql_str <- function(x) paste0("'", gsub("'", "''", x, fixed = TRUE), "'")

# A column name as an SQL identifier: "latitude (deg)"
sql_id <- function(x) paste0('"', gsub('"', '""', x, fixed = TRUE), '"')

# A comma-separated list of SQL identifiers
sql_ids <- function(x) paste(sql_id(x), collapse = ", ")

# Run a query and return a data frame
db_get <- function(con, sql) DBI::dbGetQuery(con, sql)

# Run a statement (COPY, CREATE ...)
db_run <- function(con, sql) invisible(DBI::dbExecute(con, sql))

# Column names of a query or file, in order
db_columns <- function(con, from) db_get(con, paste("DESCRIBE SELECT * FROM", from))$column_name

# Write the result of `select_sql` to a ZSTD Parquet file with 20,000-row row groups (the layout the
# browser portal reads with HTTP range requests)
copy_to_parquet <- function(con, select_sql, path) {
  db_run(con, sprintf("COPY (%s) TO %s (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 20000)",
                      select_sql, sql_str(path)))
}

# Write JSON the way the portal reads it: scalars unboxed, NULL and NA as null, numbers unrounded
write_json_file <- function(x, path, pretty = FALSE) {
  txt <- jsonlite::toJSON(x, auto_unbox = TRUE, null = "null", na = "null", digits = NA, pretty = pretty)
  writeLines(txt, path, useBytes = TRUE)
}

# Read JSON keeping its structure: arrays stay lists, so a one-element array is written back as an array
read_json_file <- function(path) jsonlite::read_json(path, simplifyVector = FALSE)

sha256_file <- function(path) digest::digest(file = path, algo = "sha256")

# Turn every column into text, with empty strings as NA, so lookup tables have the same
# all-text columns whichever version of the source tables they come from
as_text_columns <- function(df) {
  df <- as.data.frame(df, stringsAsFactors = FALSE)
  for (n in names(df)) {
    v <- as.character(df[[n]])
    v[!is.na(v) & v == ""] <- NA_character_
    df[[n]] <- v
  }
  df
}

# Sort text by Unicode code point (not by the locale's collation), so output does not depend on the
# machine's language settings
sort_c <- function(x) if (length(x)) x[order(x, method = "radix")] else character()

# Read `--name value` (or `--name=value`) pairs from the command line into a named list
parse_cli <- function(args, required = character(), optional = character()) {
  out <- list()
  i <- 1
  while (i <= length(args)) {
    a <- args[i]
    if (!startsWith(a, "--")) stop("Unexpected argument: ", a, call. = FALSE)
    if (grepl("=", a, fixed = TRUE)) {
      out[[sub("^--([^=]+)=.*$", "\\1", a)]] <- sub("^--[^=]+=", "", a)
      i <- i + 1
    } else {
      if (i == length(args)) stop("No value given for ", a, call. = FALSE)
      out[[sub("^--", "", a)]] <- args[i + 1]
      i <- i + 2
    }
  }
  gone <- setdiff(required, names(out))
  if (length(gone)) stop("Missing option(s): ", paste0("--", gone, collapse = ", "), call. = FALSE)
  unknown <- setdiff(names(out), c(required, optional))
  if (length(unknown)) stop("Unknown option(s): ", paste0("--", unknown, collapse = ", "), call. = FALSE)
  out
}

# ---------- running work in parallel ----------

# Worker processes to use: all cores but two, at least one
default_workers <- function() max(1L, parallel::detectCores(logical = TRUE) - 2L)

# vapply(x, f, "") spread over forked worker processes, keeping the order of x. Forked workers share
# everything already loaded, so `f` must not use a database connection or a V8 context made before the
# fork. Windows cannot fork, so it runs in one process there.
fork_map_chr <- function(x, f, workers = default_workers()) {
  if (workers <= 1 || .Platform$OS.type == "windows" || length(x) < 2) return(vapply(x, f, ""))
  # one contiguous chunk per worker: each fork copies the whole process, so fork as few times as possible
  chunks <- split(x, cut(seq_along(x), min(length(x), workers), labels = FALSE))
  res <- parallel::mclapply(chunks, function(ix) vapply(ix, f, ""), mc.cores = workers, mc.preschedule = TRUE)
  bad <- vapply(res, function(r) inherits(r, "try-error") || is.null(r), TRUE)
  if (any(bad)) stop("A worker failed: ", paste(unique(vapply(res[bad], function(r) if (is.null(r)) "no result" else as.character(r), "")), collapse = "; "), call. = FALSE)
  unlist(res, use.names = FALSE)
}

# A cluster of fresh R processes, each with this tooling's functions loaded. Use it for work that opens
# its own DuckDB connections, V8 contexts or loaded packages, which cannot be shared across a fork.
# The command-line scripts set option browser_portal.r_dir to the folder of these R files; inside a
# package, the workers load the package instead.
start_workers <- function(n) {
  cl <- parallel::makePSOCKcluster(n)
  setup <- function(r_dir) {
    if (is.null(r_dir)) library("austraits.portal", character.only = TRUE)
    else for (f in list.files(r_dir, pattern = "[.]R$", full.names = TRUE)) source(f)
    options(browser_portal.r_dir = r_dir)
    NULL
  }
  environment(setup) <- globalenv()
  parallel::clusterCall(cl, setup, getOption("browser_portal.r_dir"))
  cl
}

# Indices 1..n dealt round-robin into k groups, so slow and fast items mix
deal <- function(n, k) split(seq_len(n), (seq_len(n) - 1L) %% min(k, n))
