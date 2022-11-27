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
From 2021-2023 we are funded by a Australian Research Data Commons (ARDC) grant through their Australian Data Partnerships program. The <ins>**[ARDC investment](https://ardc.edu.au/project/austraits/)**</ins>, together with co-investment from our 19 partner institutions, will expand AusTraits' data coverage and enhance data quality, allowing AusTraits to emerge as a national data asset. The AusTraits <ins>**[core team](#04_team)**</ins> and broader <ins>**[team of ARDC partners](team_subpage/)**</ins> are jointly working on a collection of work packages to achieve this goal.

[{{< figure src="ARDC2.png" width="300">}}](https://ardc.edu.au/project/austraits/)
[{{< figure src="ncris.png" width="200">}}](https://www.education.gov.au/ncris)

### Contributing new data to AusTraits
To contribute trait data to AusTraits, please <ins>**[contact](#08_contact)**</ins> us. Briefly, we require your data contribution as a spreadsheet in conjunction with accompanying metadata.

A <ins>**[vignette](http://traitecoevo.github.io/austraits.build/articles/adding_data.html)**</ins> offers a detailed glance at the data entry process, with introductory sections on ideal submission formats near the top of the article.

We also accept any legacy datasets, either from your archives or transcribed from published data sources.

### Formalising vocabulary
The AusTraits team has been holding a series of workshops over the past year to review and more fully document trait definitions and allowable trait values (*terms* for categorical variables and *ranges* for continuous variables) used to build AusTraits. Our first two <ins>**[workshops](post/workshop1/)**</ins> have, respectively, reviewed 30 trait definitions associated with seeds and germination and 50 trait definitions associated with plant growth form and leaf morphology. Upcoming workshops will focus on traits related to plant fire response and physiological function.

### Establishing the Australian Plant Traits dictionary, APT
The trait definitions used to map data within AusTraits are being developed into a stand-alone trait dictionary. The AusTraits workflow requires each trait to have defined units (for numeric traits) and either explicitly allowed (and defined) values (for categorical traits) or an allowed range (for numeric traits). APT will also include references for traits, links to other trait databases and thesaurus providing data or definitions for the same trait concept, keywords, and hierarchical categories for easy data searching. 

### Transforming taxonomic descriptions into trait data tables
Taxonomic descriptions for most of Australia's 30,000+ plant species are available in online floras maintained by state and national herbaria. One of our initiatives has been to use algorithms to extract key trait data from these paragraphs of information, providing an easy-to-search, tabular formulation of the taxonomic descriptions.

### Enhanced access options
The AusTraits team has developed a project API along the distribution of AusTraits data to other biodiversity platforms, including the Atlas of Living Australia (ALA), EcoCommons, and the Flora of Australia. The first links between these platforms and AusTraits should be completed by the end of 2022.

### Converting the AusTraits workflow into a standalone R package, traits.build
Prompted by interest from other research groups to use the AusTraits pipeline to aggregate databases for other taxonomic groups or different clusters of traits, the R code underlying AusTraits is being developed into a standalone R package, traits.build. The necessary changes have forced us to look hard at aspects of the database tables and more carefully align our database structure with established ontologies including the <ins>**[Extensible Observation Ontology (OBOE)](https://bioportal.bioontology.org/ontologies/OBOE)**</ins>, the <ins>**[Ecological Trait-data Standard (ETS)](https://github.com/EcologicalTraitData/ETS)**</ins>, and <ins>**[Darwin Core](https://dwc.tdwg.org/terms/)**</ins>