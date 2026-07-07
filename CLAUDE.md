# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the source for the AusTraits website (https://austraits.org/), a [Quarto](https://quarto.org/) website. Content pages are `.qmd` files (Markdown that can execute R). The project does **not** use `renv` — install missing R packages with `install.packages(...)`.

## Commands

```sh
quarto render              # build the whole site into _site/
quarto preview             # local preview with live reload
quarto render impact.qmd   # render a single page
```

The only R dependency for building is `jsonlite` (used by `impact.qmd`).

## Architecture

- **Pages**: top-level `.qmd` files (`index.qmd`, `impact.qmd`, `contribute.qmd`) plus `team/team-partners.qmd` (which also hosts the Contact section). `_quarto.yml` defines global settings and the navbar — a new page only appears in the menu if added under `website: navbar:`.
- **Team members**: listed as a hand-curated HTML grid directly in `team/team-partners.qmd` (name, role/affiliation, photo). Photos live in `team/team/<PersonName>/avatar.jpg` — that folder holds only the avatar; there are no per-person `_index.md` profile files. To add someone, add a `team-member` div to the grid and create their avatar folder.
- **Styling**: `styles.css` (site-wide, theme is `simplex`) and `team/styles.css` (team pages). `_footer.html` is injected via `include-after-body`.
- **Extensions**: `_extensions/sellorm/social-embeds/` provides shortcodes for embedded social media and videos.
- **`_freeze/`**: cached results of executed R code (`execute: freeze: auto`). Keep it committed unless you intend to refresh cached output.
- **`_site/`**: generated build output — do not edit content here.

### Impact page and Zenodo data

`impact.qmd` renders download/citation metrics from a **cached** JSON file (`data/zenodo/3568417.json`) rather than calling Zenodo live, so builds are reliable offline. The `Refresh Zenodo Cache` GitHub Actions workflow (`.github/workflows/refresh-zenodo-cache.yaml`, scheduled monthly + manual) opens/updates a PR with refreshed JSON and regenerated freeze output. To refresh locally: update the JSON, then `quarto render impact.qmd`.

## Deployment

Production deploys and PR previews are intentionally separate:

- **Production**: `.github/workflows/quarto-publish.yaml` runs on pushes to `master` (and `workflow_dispatch`), renders the site, and publishes to Netlify using `NETLIFY_AUTH_TOKEN`.
- **PR previews**: built by Netlify's GitHub integration. `netlify.toml`'s ignore rule limits Netlify builds to `deploy-preview` contexts.

**Do not add a `pull_request` trigger to `quarto-publish.yaml`** — it uses production Netlify credentials and would publish PR content to the live site.
