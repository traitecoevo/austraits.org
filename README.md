## austraits.org

This repository contains the source code to create the austraits.org website https://austraits.org/

### To render the website locally: 

1. Install the [Quarto](https://quarto.org/docs/download/) software
2. Clone this repository to your local computer
3. Open the .Rproj file using RStudio
4. Install [renv](https://rstudio.github.io/renv/articles/renv.html) the R package 
5. `renv::restore()` (This may take a while if it is your first time rendering the website)
6. Click on any .qmd files and click on Render.

Alternatively, once you have completed steps 1-5

1. Navigate to the 'Terminal' pane and type `quarto render` and hit enter
2. Once the book has been rendered and the terminal is free, type `quarto preview` and hit enter

This should open the book in your View Pane or default browser