---
widget: blank

# Activate this widget? true/false
active: true

# This file represents a page section.
headless: true

# Order that this section appears on the page.
weight: 15
color: white
title: Enhancing and Expanding AusTraits
subtitle:

design:
  columns: "1"
  background:
    image:
    image_darken: 1.0
    image_parallax: true
    image_position: right
    image_size: contain
    text_color_light: false
  spacing:
    padding: ["20px", "0", "20px", "0"]

---
<div style="background-color:white">

### Growing AusTraits into a national data asset
The AusTraits project received **[investment](https://doi.org/10.47486/DP720)** from 2021-2023 from the Australian Research Data Commons [(ARDC)](https://ardc.edu.au). The ARDC is funded by the National Collaborative Research Infrastructure Strategy [(NCRIS)](https://www.education.gov.au/ncris). The investment, together with co-investment from our 19 partner institutions, will expand AusTraits' data coverage and enhance data quality, allowing AusTraits to emerge as a national data asset. The AusTraits **[core team](#04_team)** and broader **[team of ARDC partners](team_subpage/)** are jointly working on a collection of work packages to achieve this goal.

[{{< figure src="ARDC-NCRIS.png" width="500">}}](https://ardc.edu.au)

### Contributing new data to AusTraits
To contribute trait data to AusTraits, please **[contact](#08_contact)** us. Briefly, we require your data contribution as a spreadsheet in conjunction with accompanying metadata, as described on our **[GitHub repository](https://github.com/traitecoevo/austraits.build#contributing-to-austraits)** 
We also accept any legacy datasets, either from your archives or transcribed from published data sources.

### Formalising vocabulary
The AusTraits team held a series of workshops from 2021-2023 to review and more fully document trait definitions and allowable trait values (*terms* for categorical variables and *ranges* for continuous variables) used to build AusTraits. Our three **[workshops](post/workshop1/)** have, respectively, reviewed 29 trait definitions associated with seeds and germination, 49 trait definitions associated with plant growth form and leaf morphology, and 35 traits associated with fire response and plant regeneration. An additional 114 traits have been reviewed by 1-2 subject experts. These are predominately traits related to plant physiology or floral structure.

### Establishing the AusTraits Plant Dictionary, APD
The trait definitions used to map data within AusTraits have been developed into a formal vocabulary, the [APD](https://w3id.org/APD). The APD extends the core information required by the AusTraits workflow and releases all trait definitions in both machine-readable RDF representations and human-friendly outputs (html & csv documents). The dictionary includes trait description metadata required by the pipeline that builds AusTraits including accepted units (for numeric traits) and either explicitly allowed (and defined) values (for categorical traits) or an allowed range (for numeric traits). The APD also includes references for traits, links to other trait databases, ontologies and thesauri providing data or definitions for the same trait concept, keywords, and hierarchical categories for easy data searching. The APD can also be accessed through the ARDC's Research Vocabulary Australia [portal](https://vocabs.ardc.edu.au/viewById/649). For a description of the APD, [see](dio.org/10.1101/2023.06.16.545047)

### Transforming taxonomic descriptions into trait data tables
Taxonomic descriptions for most of Australia's 30,000+ plant species are available in online floras maintained by state and national herbaria. One of our initiatives has been to use algorithms to extract key trait data from these paragraphs of information, providing an easy-to-search, tabular formulation of the taxonomic descriptions. This effort has led to the extraction of 570,000 distinct trait values across 36 traits. These data are available in AusTraits and the method used is described in [Coleman et al. 2023](doi.org/10.1016/j.ecoinf.2023.102312).

### Enhanced access options
The AusTraits team has developed a project API along the distribution of AusTraits data to other biodiversity platforms, including the Atlas of Living Australia (ALA), EcoCommons, and the Flora of Australia. ALA's taxon pages each have a traits tab offering a [summary](https://bie.ala.org.au/species/https://id.biodiversity.org.au/node/apni/2912814#ausTraits) of the AusTraits' trait data for that taxon and a link to download that taxon's raw data from AusTraits. The ALA traits tabs are visited about 2000 times a day.

### Converting the AusTraits workflow into a standalone R package, traits.build
Prompted by interest from other research groups to use the AusTraits pipeline to aggregate databases for other taxonomic groups or different clusters of traits, the R code underlying AusTraits has been developed into a standalone R package, [{traits.build}](https://github.com/traitecoevo/traits.build). Extensive documentation for how to create a trait database using the `traits.build` workflow is available in an accompanying online [book](https://traitecoevo.github.io/traits.build-book/).

The traits.build database structure has a documented data standard (data model), that aligns with established ontologies including the **[Extensible Observation Ontology (OBOE)](https://bioportal.bioontology.org/ontologies/OBOE)**, the **[Ecological Trait-data Standard (ETS)](https://github.com/EcologicalTraitData/ETS)**, and **[Darwin Core](https://dwc.tdwg.org/terms/)**

### Converting the AusTraits taxonomic backbone into a standalone R package, APCalign
Taxon names within AusTraits are aligned to Australia's two [National Species Lists](https://biodiversity.org.au/nsl/), the Australian Plant Census [(APC)](https://biodiversity.org.au/nsl/services/search/taxonomy) and the Australian Plant Names Index [(APNI)](https://biodiversity.org.au/nsl/services/search/names). The taxonomy alignment workflow within AusTraits standardised syntax (including for phrase names), corrected typos, and updated names to the currently accepted taxon name (per the APC). This workflow has been developed into a standalone R package, [{APCalign}](https://github.com/traitecoevo/APCalign) and ShinyApp. The core functions within the package allow a user to read in a list of "original names" and output a list of names aligned to the APC.
