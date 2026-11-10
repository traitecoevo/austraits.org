#' Load the browser's own filter-to-SQL code into R
#'
#' The portal turns filter choices into SQL in `browser-portal/js/toSql.mjs`
#' (compiled from `browser-portal-src/src/toSql.ts`). This runs that same file
#' in a V8 JavaScript engine, so R-side tests and the default view use exactly
#' the SQL the browser sends, not a copy of its logic.
#'
#' @param path Path to `toSql.mjs`.
#' @return A V8 context with the module's exports under `T`, plus `pageFinish()`.
load_browser_sql <- function(path = file.path("browser-portal", "js", "toSql.mjs")) {
  js <- paste(readLines(path, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
  block <- regmatches(js, regexpr("export\\s*\\{[^}]*\\}\\s*;?\\s*$", js))
  if (!length(block)) stop("Could not find the export list at the end of ", path, call. = FALSE)
  exports <- trimws(strsplit(gsub("^export\\s*\\{|\\}\\s*;?\\s*$", "", block), ",")[[1]])
  exports <- exports[nzchar(exports)]
  # "local as exported" becomes "exported: local"
  members <- vapply(strsplit(exports, "\\s+as\\s+"), function(p) if (length(p) == 2) paste0(p[2], ": ", p[1]) else p[1], "")
  ctx <- V8::v8()
  ctx$eval(sub("export\\s*\\{[^}]*\\}\\s*;?\\s*$", "", js))
  ctx$eval(sprintf("globalThis.T = { %s };", paste(members, collapse = ", ")))
  # Helpers that keep intermediate values inside JavaScript: pageSql returns a function for its second
  # step (V8 cannot hand a function to R), and a one-element array would come back to R as a scalar
  ctx$eval("
    globalThis.whereFor = function (st, spec, f) { return T.whereClause(T.buildWhere(st, spec, f)); };
    globalThis.pageIdStep = function (st, spec, f, tc, lim, off, sort, cols) {
      return T.pageSql(st, spec, f, tc, lim, off, sort === null ? undefined : sort, cols).idStep; };
    globalThis.pageFinish = function (st, spec, f, tc, lim, off, sort, cols, ids) {
      return T.pageSql(st, spec, f, tc, lim, off, sort === null ? undefined : sort, cols).finish(ids); };")
  ctx
}

# Call a helper defined above (not a module export)
browser_helper <- function(ctx, fn, ...) ctx$call(fn, ..., auto_unbox = TRUE)

# Call one of the module's functions with R arguments. Arguments go through JSON with scalars unboxed,
# so pass arrays as lists (read_json(simplifyVector = FALSE) gives that shape).
browser_sql <- function(ctx, fn, ...) ctx$call(paste0("T.", fn), ..., auto_unbox = TRUE)

# The trait-features table as the browser loads it (app.js main())
browser_features <- function(con, data) {
  db_get(con, sprintf("SELECT trait, coalesce(structure_measured,'') AS structure_measured, coalesce(trait_group,'') AS trait_group,
    coalesce(keywords,'') AS keywords FROM read_parquet(%s)", sql_str(file.path(data, "trait_features.parquet"))))
}

# The taxa columns other than the join keys, as app.js computes A.taxaCols
browser_taxa_cols <- function(con) setdiff(db_columns(con, "taxa"), c("taxon_name", "family", "genus"))

# A DuckDB connection with the browser's views over a data folder (T.viewSql)
browser_connection <- function(ctx, data) {
  con <- DBI::dbConnect(duckdb::duckdb())
  for (s in browser_sql(ctx, "viewSql", normalizePath(data))) db_run(con, s)
  con
}
