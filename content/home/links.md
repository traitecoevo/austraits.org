---
widget: blank

# Activate this widget? true/false
active: true

# This file represents a page section.
headless: true

# Order that this section appears on the page.
weight: 15

title: Accessing and Using AusTraits
subtitle:

design:
  columns: "1"
  background:
    image:
    image_darken: 1.0
    image_parallax: true
    image_position: center
    image_size: cover
    text_color_light: false
  spacing:
    padding: ["20px", "0", "20px", "0"]

  cta:
      url: 'https://ardc.edu.au/project/austraits/'
      label: ARDC webpage
      icon_pack:
      icon:
---
### Access and use
A compiled version of AusTraits is available for download on **[Zenodo](http://doi.org/10.5281/zenodo.5112001.)**. As detailed on Zenodo, AusTraits has been released under an open source licence (CC-BY), enabling re-use by the community. 

An AusTraits R package accompanies the public release of AusTraits. This package allows the seamless download of AusTraits and includes a selection of functions that facilitate the exploration and use of AusTraits. Visit **[AusTraits R Package](https://traitecoevo.github.io/austraits/)** to access and learn more about this resource.

{{< figure src="austraitsflowchart.png" caption="A conceptual flow chart of the different AusTraits components" numbered="false" width="5000">}}

### Learn more
AusTraits is a relational database, with 11 elements, jointly storing the trait data, study metadata, and information about the AusTraits structure and build. Visualisations of these elements and the linkages between them are **[here](database/)** to orient AusTraits users. Further information on AusTraits is available on the project's **[GitHub repository](http://traitecoevo.github.io/austraits.build/index.html)**, including vignettes on **[trait definitions](http://traitecoevo.github.io/austraits.build/articles/Trait_definitions.html)** and **[AusTraits structure](http://traitecoevo.github.io/austraits.build/articles/austraits_structure.html)**. 

# Enhancing and Expanding AusTraits

### Growing AusTraits into a national data asset
From 2021-2023 we are funded by an Australian Research Data Commons (ARDC) grant as an Australian Data Partnerships project. The **[ARDC investment](https://ardc.edu.au/project/austraits/)**, together with co-investment from our 19 partners institutions, will expand AusTrait's data coverage and enhance data quality, allowing AusTraits to emerge as a national data asset. The AusTraits **[core team](team/)** and broader **[team of partners](authors/)** are jointly working on a collection of work packages to achieve this goal.

### Contributing new data to AusTraits
To contribute trait data to AusTraits, please fill in the **[contact box](contact/)** below. Briefly, we require your data contribution as a spreadsheet in conjunction with accompanying metadata. 

A **[vignette](http://traitecoevo.github.io/austraits.build/articles/adding_data.html)** offers a detailed glance at the data entry process, with introductory sections on ideal sumbission formats near the top of the article.

We also accept any legacy datasets, either from your archives or transcribed from published data sources.

### Formalise vocabulary
The AusTraits team will be leading a series of workshops over the coming two years to review and more fully document trait definitions and allowable trait values (*terms* for categorical variables and *ranges* for continuous variables). Our first **[workshop](news/)** will review trait definitions associated with seeds and germination.

### Enhanced access options
The AusTraits team is in the process of developing a project API. Once completed, the database will be accessable by querying the API or through biodiversity portals. Coming in 2022.
