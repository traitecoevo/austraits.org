## Small helpers for the browser page (not part of APCalign).
## The page calls these so the work can be done in chunks, with a progress bar.
## Input file: one line per name; an optional second column (tab separated) is the identifier.
app_state <- new.env()
app_start <- function(path, splits = "most_likely_species", full = FALSE) {
  lines <- readLines(path, warn = FALSE, encoding = "UTF-8")
  lines <- lines[nzchar(trimws(lines))]
  parts <- strsplit(lines, "\t", fixed = TRUE)
  nm <- trimws(vapply(parts, function(p) p[1], ""))
  id <- vapply(parts, function(p) if (length(p) >= 2) trimws(p[2]) else NA_character_, "")
  id[!is.na(id) & !nzchar(id)] <- NA_character_
  ## Every row is kept, in order, as in the Shiny app (APCalign matches each different name once).
  keep <- !is.na(nm) & nzchar(nm)
  app_state$names <- nm[keep]
  app_state$ids <- id[keep]
  app_state$has_id <- any(!is.na(app_state$ids))
  app_state$splits <- splits
  app_state$full <- isTRUE(full)
  app_state$parts <- list()
  length(app_state$names)
}
app_chunk <- function(resources, i, size) {
  n <- length(app_state$names)
  from <- (i - 1) * size + 1
  to <- min(n, i * size)
  if (from > n) return(0L)
  idx <- from:to
  part <- if (app_state$has_id) {
    create_taxonomic_update_lookup(app_state$names[idx], identifier = app_state$ids[idx],
                                   resources = resources, taxonomic_splits = app_state$splits,
                                   full = app_state$full)
  } else {
    create_taxonomic_update_lookup(taxa = app_state$names[idx], resources = resources,
                                   taxonomic_splits = app_state$splits, full = app_state$full)
  }
  ## keep row_number (full output) counting from the first input row, not from the start of the chunk
  if ("row_number" %in% names(part)) part$row_number <- part$row_number + (from - 1)
  app_state$parts[[i]] <- part
  as.integer(to - from + 1)
}
app_finish <- function(path_out) {
  out <- dplyr::bind_rows(app_state$parts)
  ## Written by hand as UTF-8 bytes so that accents are kept in any locale.
  ## Same layout as write.csv(): text quoted, numbers not quoted, missing values as NA.
  q <- function(v) {
    if (is.numeric(v) || is.logical(v)) return(ifelse(is.na(v), "NA", as.character(v)))
    v <- enc2utf8(as.character(v))
    ifelse(is.na(v), "NA", paste0("\"", gsub("\"", "\"\"", v, fixed = TRUE), "\""))
  }
  cols <- lapply(out, q)
  header <- paste0("\"", enc2utf8(names(out)), "\"", collapse = ",")
  body <- do.call(paste, c(unname(cols), sep = ","))
  writeLines(c(header, body), path_out, useBytes = TRUE)
  nrow(out)
}
