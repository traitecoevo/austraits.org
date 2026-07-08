# AusTraits Website Design Ideas

AusTraits already feels credible and well maintained. The main opportunity is to make the site feel more lively, easier to scan, and more like durable science infrastructure without adding content that needs constant updating.

## Design Direction

Aim for **lively and reliable**:

- Lively through stronger visual hierarchy, clearer entry points, science/data cues, and a warmer colour palette.
- Reliable through restrained styling, stable evergreen claims, strong partner signals, and simple Quarto-native components.
- Maintainable by avoiding news-style sections, manual update obligations, heavy JavaScript, and bespoke layouts that will be fragile over time.

## Highest-Value Changes

### 1. Add A Strong Homepage Hero

The homepage currently starts with the logo and prose. Consider replacing this with a proper opening section:

- AusTraits logo or wordmark.
- One short tagline, for example: "A harmonised trait database for Australia's flora."
- One paragraph explaining the resource.
- Two or three action buttons:
  - Download data
  - Use the R package
  - Contribute data

This would immediately tell users what AusTraits is and what they can do next.

### 2. Add An Evergreen Trust Strip

Below the hero, add a compact row of key facts:

- Nearly 500 traits
- 30,000+ taxa
- Open data, CC-BY 4.0
- Published in *Scientific Data*
- Zenodo DOI

Use wording that will age well, such as "nearly", "over", or "more than", so the numbers do not need frequent updates.

### 3. Convert Access Options Into Cards

The "Access and Usage" section would be easier to scan as cards:

- Zenodo dataset
- R package
- Tutorial
- API / ALA integration
- AusTraits Plant Dictionary

Each card can have a short description and one link. This gives the homepage more rhythm without making it feel flashy.

### 4. Replace Floats And Manual Spacing

The homepage currently uses floated images and `<br>` spacing in the software section. These are likely to be fragile on mobile.

Better options:

- Quarto columns
- Simple CSS grid sections
- Reusable cards for related software outputs

This would also make the page easier to maintain.

### 5. Simplify The Navbar

The current navbar has many items and several point to sections within the homepage. A simpler structure would feel calmer:

- Access
- Impact
- Software
- Team
- Contribute
- Contact

This is especially important on mobile, where long nav menus become cumbersome.

### 6. Create One Global Stylesheet

Use a shared `styles.css` for the main site, with page-specific styles only where the page genuinely needs them.

Use it for:

- Colour variables
- Typography
- Buttons
- Cards
- Callouts
- Footer
- Reusable metric blocks

### 7. Use A Science-Infrastructure Palette

Keep the palette restrained but warmer than the default Quarto look:

- Charcoal text
- Gum-leaf green
- Freshwater blue
- Wattle gold accent
- Warm off-white backgrounds

The current green-blue divider is a good starting point, but it should become part of a consistent visual system.

### 8. Make The Impact Page Feel Like A Dashboard

The impact page has useful dynamic data. Present the Zenodo views/downloads and citation indicators as metric cards near the top, then keep the detailed lists below.

This would make the project's usefulness visible quickly.

### 9. Keep The Homepage Evergreen

Avoid adding sections like "Latest news" unless someone is committed to maintaining them. For a rarely updated infrastructure site, the homepage should focus on stable identity, access pathways, impact, and contribution routes.

### 10. Polish Partner And Team Presentation

The partner footer and team grid are useful, but could feel more deliberate:

- Use a calmer footer band with partner logos in soft full colour.
- Keep image sizes consistent.
- Avoid hover-only colour effects, since mobile users may never see them.
- Keep team cards simple and durable.

## Suggested Implementation Sequence

1. Create a shared `styles.css` and connect it cleanly in `_quarto.yml`.
2. Redesign the homepage opening with hero, action buttons, and trust strip.
3. Convert access and software sections into reusable cards.
4. Restyle the impact page metrics.
5. Simplify the navbar.
6. Polish footer and team styling.

## Guiding Principle

The site should feel like a dependable research data service with a bit of botanical energy: structured, open, useful, and alive.
