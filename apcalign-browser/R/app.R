## Small helpers for the browser page (not part of APCalign).
## The page calls these so the work can be done in small chunks with a progress bar.
app_read_names <- function(path) {
  x <- readLines(path, warn = FALSE, encoding = "UTF-8")
  x <- trimws(x)
  x <- x[!is.na(x) & nzchar(x)]
  unique(x)
}
app_state <- new.env()
app_start <- function(path) {
  app_state$names <- app_read_names(path)
  app_state$parts <- list()
  length(app_state$names)
}
app_chunk <- function(resources, i, size) {
  n <- length(app_state$names)
  from <- (i - 1) * size + 1
  to <- min(n, i * size)
  if (from > n) return(0L)
  app_state$parts[[i]] <- create_taxonomic_update_lookup(app_state$names[from:to], resources = resources)
  as.integer(to - from + 1)
}
app_finish <- function(path_out) {
  out <- dplyr::bind_rows(app_state$parts)
  ## Written by hand as UTF-8 bytes so that accents are kept in any locale.
  q <- function(v) {
    v <- enc2utf8(as.character(v))
    ifelse(is.na(v), "", paste0("\"", gsub("\"", "\"\"", v, fixed = TRUE), "\""))
  }
  cols <- lapply(out, q)
  header <- paste0("\"", enc2utf8(names(out)), "\"", collapse = ",")
  body <- do.call(paste, c(unname(cols), sep = ","))
  writeLines(c(header, body), path_out, useBytes = TRUE)
  nrow(out)
}
