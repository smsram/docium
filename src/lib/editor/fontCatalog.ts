export interface FontCatalogEntry {
  name: string;
  value: string;
  category: 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting';
  source: 'microsoft' | 'google' | 'system';
  googleFamily?: string;
}

const RAW_FONT_CATALOG: FontCatalogEntry[] = [
  // --- Microsoft Word / Office & System Standard Fonts ---
  { name: 'Aptos', value: 'Aptos, Calibri, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Aptos Display', value: '"Aptos Display", Aptos, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Aptos Narrow', value: '"Aptos Narrow", Aptos, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Aptos Serif', value: '"Aptos Serif", Cambria, serif', category: 'serif', source: 'microsoft' },
  { name: 'Aptos Mono', value: '"Aptos Mono", Consolas, monospace', category: 'monospace', source: 'microsoft' },
  { name: 'Arial', value: 'Arial, Helvetica, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Arial Black', value: '"Arial Black", Gadget, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Arial Narrow', value: '"Arial Narrow", Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Bahnschrift', value: 'Bahnschrift, "Segoe UI", sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Baskerville', value: 'Baskerville, "Baskerville Old Face", serif', category: 'serif', source: 'microsoft' },
  { name: 'Baskerville Old Face', value: '"Baskerville Old Face", Baskerville, serif', category: 'serif', source: 'microsoft' },
  { name: 'Bell MT', value: '"Bell MT", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Berlin Sans FB', value: '"Berlin Sans FB", Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Bernard MT Condensed', value: '"Bernard MT Condensed", Impact, serif', category: 'display', source: 'microsoft' },
  { name: 'Bodoni MT', value: '"Bodoni MT", Didot, serif', category: 'serif', source: 'microsoft' },
  { name: 'Book Antiqua', value: '"Book Antiqua", Palatino, serif', category: 'serif', source: 'microsoft' },
  { name: 'Bookman Old Style', value: '"Bookman Old Style", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Bradley Hand ITC', value: '"Bradley Hand ITC", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Britannic Bold', value: '"Britannic Bold", Impact, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Broadway', value: 'Broadway, Impact, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Brush Script MT', value: '"Brush Script MT", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Calibri', value: 'Calibri, Candara, Segoe, "Segoe UI", Optima, Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Calibri Light', value: '"Calibri Light", Calibri, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Californian FB', value: '"Californian FB", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Calisto MT', value: '"Calisto MT", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Cambria', value: 'Cambria, Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Cambria Math', value: '"Cambria Math", Cambria, serif', category: 'serif', source: 'microsoft' },
  { name: 'Candara', value: 'Candara, Calibri, Segoe, "Segoe UI", Optima, Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'CascadeMono', value: '"Cascadia Mono", Consolas, monospace', category: 'monospace', source: 'microsoft' },
  { name: 'Cascadia Code', value: '"Cascadia Code", Consolas, monospace', category: 'monospace', source: 'microsoft' },
  { name: 'Castellar', value: 'Castellar, Georgia, serif', category: 'display', source: 'microsoft' },
  { name: 'Centaur', value: 'Centaur, Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Century', value: 'Century, Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Century Gothic', value: '"Century Gothic", CenturyGothic, AppleGothic, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Century Schoolbook', value: '"Century Schoolbook", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Chiller', value: 'Chiller, cursive', category: 'display', source: 'microsoft' },
  { name: 'Colonna MT', value: '"Colonna MT", serif', category: 'display', source: 'microsoft' },
  { name: 'Comic Sans MS', value: '"Comic Sans MS", "Comic Sans", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Consolas', value: 'Consolas, monaco, monospace', category: 'monospace', source: 'microsoft' },
  { name: 'Constantia', value: 'Constantia, "Lucida Bright", Lucidabright, "Lucida Serif", Lucida, "DejaVu Serif", "Bitstream Vera Serif", "Liberation Serif", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Cooper Black', value: '"Cooper Black", Georgia, serif', category: 'display', source: 'microsoft' },
  { name: 'Copperplate Gothic Bold', value: '"Copperplate Gothic Bold", Copperplate, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Copperplate Gothic Light', value: '"Copperplate Gothic Light", Copperplate, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Corbel', value: 'Corbel, "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", "DejaVu Sans", "Bitstream Vera Sans", "Liberation Sans", Verdana, "Verdana Ref", sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Courier New', value: '"Courier New", Courier, "Lucida Sans Typewriter", "Lucida Typewriter", monospace', category: 'monospace', source: 'microsoft' },
  { name: 'Didot', value: 'Didot, "Bodoni MT", serif', category: 'serif', source: 'microsoft' },
  { name: 'Ebrima', value: 'Ebrima, Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Elephant', value: 'Elephant, Georgia, serif', category: 'display', source: 'microsoft' },
  { name: 'Engravers MT', value: '"Engravers MT", Georgia, serif', category: 'display', source: 'microsoft' },
  { name: 'Eras Bold ITC', value: '"Eras Bold ITC", Arial, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Felix Titling', value: '"Felix Titling", Georgia, serif', category: 'display', source: 'microsoft' },
  { name: 'Footlight MT Light', value: '"Footlight MT Light", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Forte', value: 'Forte, Impact, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Franklin Gothic Book', value: '"Franklin Gothic Book", "Franklin Gothic Medium", Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Franklin Gothic Medium', value: '"Franklin Gothic Medium", "Franklin Gothic", "ITC Franklin Gothic", Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Freestyle Script', value: '"Freestyle Script", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'French Script MT', value: '"French Script MT", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Futura', value: 'Futura, "Trebuchet MS", Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Gabriola', value: 'Gabriola, Georgia, serif', category: 'display', source: 'microsoft' },
  { name: 'Gadugi', value: 'Gadugi, Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Garamond', value: 'Garamond, Baskerville, "Baskerville Old Face", "Hoefler Text", "Times New Roman", serif', category: 'serif', source: 'microsoft' },
  { name: 'Georgia', value: 'Georgia, Times, "Times New Roman", serif', category: 'serif', source: 'microsoft' },
  { name: 'Gigi', value: 'Gigi, cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Gill Sans MT', value: '"Gill Sans MT", "Gill Sans", Calibri, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Goudy Old Style', value: '"Goudy Old Style", Garamond, serif', category: 'serif', source: 'microsoft' },
  { name: 'Haettenschweiler', value: 'Haettenschweiler, Impact, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Harlow Solid Italic', value: '"Harlow Solid Italic", cursive', category: 'display', source: 'microsoft' },
  { name: 'Harrington', value: 'Harrington, Georgia, serif', category: 'display', source: 'microsoft' },
  { name: 'Helvetica', value: 'Helvetica, Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'High Tower Text', value: '"High Tower Text", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Impact', value: 'Impact, Haettenschweiler, "Franklin Gothic Bold", Charcoal, "Helvetica Inserat", "Bitstream Vera Sans Bold", "Arial Black", sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Informal Roman', value: '"Informal Roman", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Ink Free', value: '"Ink Free", "Comic Sans MS", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Jokerman', value: 'Jokerman, cursive', category: 'display', source: 'microsoft' },
  { name: 'Juice ITC', value: '"Juice ITC", cursive', category: 'display', source: 'microsoft' },
  { name: 'Kristen ITC', value: '"Kristen ITC", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Kunstler Script', value: '"Kunstler Script", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Lucida Bright', value: '"Lucida Bright", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Lucida Calligraphy', value: '"Lucida Calligraphy", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Lucida Console', value: '"Lucida Console", "Lucida Sans Typewriter", monaco, "Bitstream Vera Sans Mono", monospace', category: 'monospace', source: 'microsoft' },
  { name: 'Lucida Handwriting', value: '"Lucida Handwriting", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Lucida Sans', value: '"Lucida Sans", "Lucida Sans Unicode", "Lucida Grande", sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Lucida Sans Typewriter', value: '"Lucida Sans Typewriter", "Lucida Console", monospace', category: 'monospace', source: 'microsoft' },
  { name: 'Lucida Sans Unicode', value: '"Lucida Sans Unicode", "Lucida Grande", sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Magneto', value: 'Magneto, Impact, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Maiandra GD', value: '"Maiandra GD", Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Matura MT Script Capitals', value: '"Matura MT Script Capitals", cursive', category: 'display', source: 'microsoft' },
  { name: 'Microsoft Sans Serif', value: '"Microsoft Sans Serif", Tahoma, Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Mistral', value: 'Mistral, cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Modern No. 20', value: '"Modern No. 20", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Monaco', value: 'Monaco, Consolas, monospace', category: 'monospace', source: 'system' },
  { name: 'Monotype Corsiva', value: '"Monotype Corsiva", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Niagara Engraved', value: '"Niagara Engraved", Impact, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Old English Text MT', value: '"Old English Text MT", serif', category: 'display', source: 'microsoft' },
  { name: 'Onyx', value: 'Onyx, Impact, serif', category: 'display', source: 'microsoft' },
  { name: 'Optima', value: 'Optima, Segoe, "Segoe UI", Candara, Calibri, Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Palace Script MT', value: '"Palace Script MT", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Palatino Linotype', value: '"Palatino Linotype", Palatino, Palladio, "URW Palladio L", "Book Antiqua", Baskerville, "Bookman Old Style", "Bitstream Charter", "Nimbus Roman No9 L", Garamond, "Apple Garamond", "ITC Garamond Narrow", "New Century Schoolbook", "Century Schoolbook", "Century Schoolbook L", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Papyrus', value: 'Papyrus, fantasy', category: 'display', source: 'microsoft' },
  { name: 'Parchment', value: 'Parchment, cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Perpetua', value: 'Perpetua, Baskerville, "Big Caslon", "Palatino Linotype", Palatino, serif', category: 'serif', source: 'microsoft' },
  { name: 'Playbill', value: 'Playbill, Impact, serif', category: 'display', source: 'microsoft' },
  { name: 'Poor Richard', value: '"Poor Richard", Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Pristina', value: 'Pristina, cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Rage Italic', value: '"Rage Italic", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Ravie', value: 'Ravie, Impact, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Rockwell', value: 'Rockwell, "Courier Bold", Courier, Georgia, Times, "Times New Roman", serif', category: 'serif', source: 'microsoft' },
  { name: 'Script MT Bold', value: '"Script MT Bold", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Segoe Print', value: '"Segoe Print", "Comic Sans MS", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Segoe Script', value: '"Segoe Script", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Segoe UI', value: '"Segoe UI", Frutiger, "Frutiger Linotype", "Dejavu Sans", "Helvetica Neue", Arial, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Segoe UI Light', value: '"Segoe UI Light", "Segoe UI", sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Segoe UI Semibold', value: '"Segoe UI Semibold", "Segoe UI", sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Showcard Gothic', value: '"Showcard Gothic", Impact, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Sitka Text', value: '"Sitka Text", Cambria, Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Snap ITC', value: '"Snap ITC", Impact, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Stencil', value: 'Stencil, Impact, sans-serif', category: 'display', source: 'microsoft' },
  { name: 'Sylfaen', value: 'Sylfaen, Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Tahoma', value: 'Tahoma, Verdana, Segoe, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Tempus Sans ITC', value: '"Tempus Sans ITC", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Times New Roman', value: '"Times New Roman", TimesNewRoman, Times, Baskerville, Georgia, serif', category: 'serif', source: 'microsoft' },
  { name: 'Trebuchet MS', value: '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Tw Cen MT', value: '"Tw Cen MT", "Century Gothic", sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Verdana', value: 'Verdana, Geneva, sans-serif', category: 'sans-serif', source: 'microsoft' },
  { name: 'Viner Hand ITC', value: '"Viner Hand ITC", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Vivaldi', value: 'Vivaldi, cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Vladimir Script', value: '"Vladimir Script", cursive', category: 'handwriting', source: 'microsoft' },
  { name: 'Wide Latin', value: '"Wide Latin", Georgia, serif', category: 'display', source: 'microsoft' },

  // --- Google Fonts (Sans-Serif, Serif, Monospace, Display, Handwriting) ---
  { name: 'Inter', value: 'Inter, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Inter' },
  { name: 'Geist', value: 'Geist, Inter, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Geist' },
  { name: 'Roboto', value: 'Roboto, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Roboto' },
  { name: 'Open Sans', value: '"Open Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Open+Sans' },
  { name: 'Lato', value: 'Lato, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Lato' },
  { name: 'Montserrat', value: 'Montserrat, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Montserrat' },
  { name: 'Poppins', value: 'Poppins, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Poppins' },
  { name: 'Nunito', value: 'Nunito, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Nunito' },
  { name: 'Nunito Sans', value: '"Nunito Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Nunito+Sans' },
  { name: 'Raleway', value: 'Raleway, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Raleway' },
  { name: 'Ubuntu', value: 'Ubuntu, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Ubuntu' },
  { name: 'Rubik', value: 'Rubik, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Rubik' },
  { name: 'Work Sans', value: '"Work Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Work+Sans' },
  { name: 'Noto Sans', value: '"Noto Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Noto+Sans' },
  { name: 'Fira Sans', value: '"Fira Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Fira+Sans' },
  { name: 'Quicksand', value: 'Quicksand, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Quicksand' },
  { name: 'Barlow', value: 'Barlow, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Barlow' },
  { name: 'Mulish', value: 'Mulish, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Mulish' },
  { name: 'Karla', value: 'Karla, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Karla' },
  { name: 'Manrope', value: 'Manrope, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Manrope' },
  { name: 'DM Sans', value: '"DM Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'DM+Sans' },
  { name: 'Plus Jakarta Sans', value: '"Plus Jakarta Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Plus+Jakarta+Sans' },
  { name: 'Outfit', value: 'Outfit, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Outfit' },
  { name: 'Cabin', value: 'Cabin, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Cabin' },
  { name: 'Josefin Sans', value: '"Josefin Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Josefin+Sans' },
  { name: 'Anton', value: 'Anton, sans-serif', category: 'display', source: 'google', googleFamily: 'Anton' },
  { name: 'Arimo', value: 'Arimo, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Arimo' },
  { name: 'Titillium Web', value: '"Titillium Web", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Titillium+Web' },
  { name: 'PT Sans', value: '"PT Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'PT+Sans' },
  { name: 'Hind', value: 'Hind, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Hind' },
  { name: 'Exo 2', value: '"Exo 2", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Exo+2' },
  { name: 'Asap', value: 'Asap, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Asap' },
  { name: 'Overpass', value: 'Overpass, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Overpass' },
  { name: 'Varela Round', value: '"Varela Round", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Varela+Round' },
  { name: 'Maven Pro', value: '"Maven Pro", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Maven+Pro' },
  { name: 'Signika', value: 'Signika, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Signika' },
  { name: 'Catamaran', value: 'Catamaran, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Catamaran' },
  { name: 'Heebo', value: 'Heebo, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Heebo' },
  { name: 'Lexend', value: 'Lexend, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Lexend' },
  { name: 'Urbanist', value: 'Urbanist, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Urbanist' },
  { name: 'Space Grotesk', value: '"Space Grotesk", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Space+Grotesk' },
  { name: 'Sora', value: 'Sora, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Sora' },
  { name: 'Figtree', value: 'Figtree, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Figtree' },
  { name: 'Public Sans', value: '"Public Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Public+Sans' },
  { name: 'Be Vietnam Pro', value: '"Be Vietnam Pro", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Be+Vietnam+Pro' },
  { name: 'Red Hat Display', value: '"Red Hat Display", sans-serif', category: 'display', source: 'google', googleFamily: 'Red+Hat+Display' },
  { name: 'Archivo', value: 'Archivo, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Archivo' },
  { name: 'Chivo', value: 'Chivo, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Chivo' },
  { name: 'Kanit', value: 'Kanit, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Kanit' },
  { name: 'Teko', value: 'Teko, sans-serif', category: 'display', source: 'google', googleFamily: 'Teko' },
  { name: 'Bebas Neue', value: '"Bebas Neue", sans-serif', category: 'display', source: 'google', googleFamily: 'Bebas+Neue' },
  { name: 'Oswald', value: 'Oswald, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Oswald' },
  { name: 'Dosis', value: 'Dosis, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Dosis' },
  { name: 'Oxygen', value: 'Oxygen, sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'Oxygen' },
  { name: 'IBM Plex Sans', value: '"IBM Plex Sans", sans-serif', category: 'sans-serif', source: 'google', googleFamily: 'IBM+Plex+Sans' },

  // --- Google Fonts (Serif) ---
  { name: 'Merriweather', value: 'Merriweather, serif', category: 'serif', source: 'google', googleFamily: 'Merriweather' },
  { name: 'Playfair Display', value: '"Playfair Display", serif', category: 'serif', source: 'google', googleFamily: 'Playfair+Display' },
  { name: 'Lora', value: 'Lora, serif', category: 'serif', source: 'google', googleFamily: 'Lora' },
  { name: 'PT Serif', value: '"PT Serif", serif', category: 'serif', source: 'google', googleFamily: 'PT+Serif' },
  { name: 'Noto Serif', value: '"Noto Serif", serif', category: 'serif', source: 'google', googleFamily: 'Noto+Serif' },
  { name: 'Libre Baskerville', value: '"Libre Baskerville", serif', category: 'serif', source: 'google', googleFamily: 'Libre+Baskerville' },
  { name: 'EB Garamond', value: '"EB Garamond", serif', category: 'serif', source: 'google', googleFamily: 'EB+Garamond' },
  { name: 'Cormorant Garamond', value: '"Cormorant Garamond", serif', category: 'serif', source: 'google', googleFamily: 'Cormorant+Garamond' },
  { name: 'Crimson Text', value: '"Crimson Text", serif', category: 'serif', source: 'google', googleFamily: 'Crimson+Text' },
  { name: 'Crimson Pro', value: '"Crimson Pro", serif', category: 'serif', source: 'google', googleFamily: 'Crimson+Pro' },
  { name: 'Bitter', value: 'Bitter, serif', category: 'serif', source: 'google', googleFamily: 'Bitter' },
  { name: 'Arvo', value: 'Arvo, serif', category: 'serif', source: 'google', googleFamily: 'Arvo' },
  { name: 'Zilla Slab', value: '"Zilla Slab", serif', category: 'serif', source: 'google', googleFamily: 'Zilla+Slab' },
  { name: 'Roboto Slab', value: '"Roboto Slab", serif', category: 'serif', source: 'google', googleFamily: 'Roboto+Slab' },
  { name: 'Domine', value: 'Domine, serif', category: 'serif', source: 'google', googleFamily: 'Domine' },
  { name: 'Vollkorn', value: 'Vollkorn, serif', category: 'serif', source: 'google', googleFamily: 'Vollkorn' },
  { name: 'Cardo', value: 'Cardo, serif', category: 'serif', source: 'google', googleFamily: 'Cardo' },
  { name: 'Spectral', value: 'Spectral, serif', category: 'serif', source: 'google', googleFamily: 'Spectral' },
  { name: 'Alegreya', value: 'Alegreya, serif', category: 'serif', source: 'google', googleFamily: 'Alegreya' },
  { name: 'Amiri', value: 'Amiri, serif', category: 'serif', source: 'google', googleFamily: 'Amiri' },
  { name: 'Cinzel', value: 'Cinzel, serif', category: 'serif', source: 'google', googleFamily: 'Cinzel' },
  { name: 'Fraunces', value: 'Fraunces, serif', category: 'serif', source: 'google', googleFamily: 'Fraunces' },
  { name: 'Newsreader', value: 'Newsreader, serif', category: 'serif', source: 'google', googleFamily: 'Newsreader' },
  { name: 'Bodoni Moda', value: '"Bodoni Moda", serif', category: 'serif', source: 'google', googleFamily: 'Bodoni+Moda' },
  { name: 'Abril Fatface', value: '"Abril Fatface", serif', category: 'display', source: 'google', googleFamily: 'Abril+Fatface' },
  { name: 'DM Serif Display', value: '"DM Serif Display", serif', category: 'display', source: 'google', googleFamily: 'DM+Serif+Display' },
  { name: 'IBM Plex Serif', value: '"IBM Plex Serif", serif', category: 'serif', source: 'google', googleFamily: 'IBM+Plex+Serif' },

  // --- Google Fonts (Monospace) ---
  { name: 'JetBrains Mono', value: '"JetBrains Mono", monospace', category: 'monospace', source: 'google', googleFamily: 'JetBrains+Mono' },
  { name: 'Fira Code', value: '"Fira Code", monospace', category: 'monospace', source: 'google', googleFamily: 'Fira+Code' },
  { name: 'Roboto Mono', value: '"Roboto Mono", monospace', category: 'monospace', source: 'google', googleFamily: 'Roboto+Mono' },
  { name: 'Source Code Pro', value: '"Source Code Pro", monospace', category: 'monospace', source: 'google', googleFamily: 'Source+Code+Pro' },
  { name: 'Space Mono', value: '"Space Mono", monospace', category: 'monospace', source: 'google', googleFamily: 'Space+Mono' },
  { name: 'IBM Plex Mono', value: '"IBM Plex Mono", monospace', category: 'monospace', source: 'google', googleFamily: 'IBM+Plex+Mono' },
  { name: 'Inconsolata', value: 'Inconsolata, monospace', category: 'monospace', source: 'google', googleFamily: 'Inconsolata' },
  { name: 'Ubuntu Mono', value: '"Ubuntu Mono", monospace', category: 'monospace', source: 'google', googleFamily: 'Ubuntu+Mono' },
  { name: 'Courier Prime', value: '"Courier Prime", monospace', category: 'monospace', source: 'google', googleFamily: 'Courier+Prime' },
  { name: 'Anonymous Pro', value: '"Anonymous Pro", monospace', category: 'monospace', source: 'google', googleFamily: 'Anonymous+Pro' },

  // --- Google Fonts (Handwriting & Display) ---
  { name: 'Pacifico', value: 'Pacifico, cursive', category: 'handwriting', source: 'google', googleFamily: 'Pacifico' },
  { name: 'Dancing Script', value: '"Dancing Script", cursive', category: 'handwriting', source: 'google', googleFamily: 'Dancing+Script' },
  { name: 'Caveat', value: 'Caveat, cursive', category: 'handwriting', source: 'google', googleFamily: 'Caveat' },
  { name: 'Satisfy', value: 'Satisfy, cursive', category: 'handwriting', source: 'google', googleFamily: 'Satisfy' },
  { name: 'Great Vibes', value: '"Great Vibes", cursive', category: 'handwriting', source: 'google', googleFamily: 'Great+Vibes' },
  { name: 'Sacramento', value: 'Sacramento, cursive', category: 'handwriting', source: 'google', googleFamily: 'Sacramento' },
  { name: 'Kalam', value: 'Kalam, cursive', category: 'handwriting', source: 'google', googleFamily: 'Kalam' },
  { name: 'Indie Flower', value: '"Indie Flower", cursive', category: 'handwriting', source: 'google', googleFamily: 'Indie+Flower' },
  { name: 'Shadows Into Light', value: '"Shadows Into Light", cursive', category: 'handwriting', source: 'google', googleFamily: 'Shadows+Into+Light' },
  { name: 'Permanent Marker', value: '"Permanent Marker", cursive', category: 'handwriting', source: 'google', googleFamily: 'Permanent+Marker' },
  { name: 'Amatic SC', value: '"Amatic SC", cursive', category: 'handwriting', source: 'google', googleFamily: 'Amatic+SC' },
  { name: 'Lobster', value: 'Lobster, cursive', category: 'display', source: 'google', googleFamily: 'Lobster' },
  { name: 'Comfortaa', value: 'Comfortaa, sans-serif', category: 'display', source: 'google', googleFamily: 'Comfortaa' },
  { name: 'Righteous', value: 'Righteous, sans-serif', category: 'display', source: 'google', googleFamily: 'Righteous' },
  { name: 'Fredoka', value: 'Fredoka, sans-serif', category: 'display', source: 'google', googleFamily: 'Fredoka' },
  { name: 'Patrick Hand', value: '"Patrick Hand", cursive', category: 'handwriting', source: 'google', googleFamily: 'Patrick+Hand' },
  { name: 'Courgette', value: 'Courgette, cursive', category: 'handwriting', source: 'google', googleFamily: 'Courgette' },
  { name: 'Kaushan Script', value: '"Kaushan Script", cursive', category: 'handwriting', source: 'google', googleFamily: 'Kaushan+Script' },
  { name: 'Yellowtail', value: 'Yellowtail, cursive', category: 'handwriting', source: 'google', googleFamily: 'Yellowtail' },
  { name: 'Cookie', value: 'Cookie, cursive', category: 'handwriting', source: 'google', googleFamily: 'Cookie' },
];

export const FONT_CATALOG: FontCatalogEntry[] = [...RAW_FONT_CATALOG].sort((a, b) =>
  a.name.localeCompare(b.name)
);

export const FONT_FAMILY_SELECT_OPTIONS = FONT_CATALOG.map((entry) => ({
  label: entry.name,
  value: entry.value,
}));

export const FONT_FAMILY_NAMES = FONT_CATALOG.map((entry) => entry.name);

export const FONT_SIZE_PT_VALUES = [
  8, 9, 10, 10.5, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96,
];

export const FONT_SIZE_SELECT_OPTIONS = FONT_SIZE_PT_VALUES.map((size) => ({
  label: String(size),
  value: `${size}pt`,
}));

/**
 * Resolves any raw font-family string (e.g. "Arial", "'Times New Roman', serif", "Inter, sans-serif")
 * to its canonical Select option value in FONT_CATALOG.
 */
export function resolveFontFamilyValue(rawFont: string | null | undefined): string {
  const defaultEntry = FONT_CATALOG.find((f) => f.name === 'Inter') || FONT_CATALOG[0];
  if (!rawFont || !rawFont.trim()) {
    return defaultEntry.value;
  }

  const trimmed = rawFont.trim();

  // Direct exact value match
  const exactValueMatch = FONT_CATALOG.find(
    (entry) => entry.value.toLowerCase() === trimmed.toLowerCase()
  );
  if (exactValueMatch) return exactValueMatch.value;

  // Primary font name (first item before comma, stripped of quotes)
  const primaryName = trimmed.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();

  const exactNameMatch = FONT_CATALOG.find(
    (entry) => entry.name.toLowerCase() === primaryName
  );
  if (exactNameMatch) return exactNameMatch.value;

  // Partial or prefix match
  const partialMatch = FONT_CATALOG.find(
    (entry) =>
      entry.name.toLowerCase().includes(primaryName) ||
      primaryName.includes(entry.name.toLowerCase())
  );
  if (partialMatch) return partialMatch.value;

  return trimmed;
}

/**
 * Normalizes any font size value (e.g. "16px", "12pt", 14, "14") into a canonical "Xpt" string.
 */
export function normalizeFontSizeToPt(
  rawSize: string | number | null | undefined,
  fallbackPt: number = 11
): string {
  if (rawSize === null || rawSize === undefined || rawSize === '') {
    return `${fallbackPt}pt`;
  }
  if (typeof rawSize === 'number') {
    return `${rawSize}pt`;
  }
  const str = String(rawSize).trim().toLowerCase();
  if (str.endsWith('pt')) {
    const num = parseFloat(str);
    return Number.isFinite(num) ? `${Number(num.toFixed(1))}pt` : `${fallbackPt}pt`;
  }
  if (str.endsWith('px')) {
    const px = parseFloat(str);
    if (Number.isFinite(px)) {
      // Convert CSS px to pt (1pt = 96/72 px = 1.3333px)
      const pt = Math.round((px * 72) / 96 * 2) / 2;
      // Snap to closest standard size if within 0.5pt
      const closest = FONT_SIZE_PT_VALUES.find((v) => Math.abs(v - pt) <= 0.4);
      return `${closest ?? pt}pt`;
    }
  }
  const numeric = parseFloat(str);
  if (Number.isFinite(numeric)) {
    return `${numeric}pt`;
  }
  return `${fallbackPt}pt`;
}

const loadedGoogleFamilies = new Set<string>();

/**
 * Dynamically loads a Google Font stylesheet into the browser document <head> if needed.
 */
export function ensureGoogleFontLoaded(fontValueOrName: string | null | undefined): void {
  if (typeof document === 'undefined' || !fontValueOrName) return;

  const primaryName = fontValueOrName.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
  const entry = FONT_CATALOG.find(
    (item) =>
      item.name.toLowerCase() === primaryName ||
      item.value.toLowerCase() === fontValueOrName.trim().toLowerCase()
  );

  if (!entry || entry.source !== 'google' || !entry.googleFamily) return;
  if (loadedGoogleFamilies.has(entry.googleFamily)) return;

  loadedGoogleFamilies.add(entry.googleFamily);
  const linkId = `docium-gfont-${entry.googleFamily.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  if (document.getElementById(linkId)) return;

  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${entry.googleFamily}:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700&display=swap`;
  document.head.appendChild(link);
}

let preloadedPopular = false;

/**
 * Preloads the most popular Google Fonts in batched stylesheet requests so font previews and documents render immediately.
 */
export function preloadPopularGoogleFonts(): void {
  if (typeof document === 'undefined' || preloadedPopular) return;
  preloadedPopular = true;

  const popularFamilies = [
    'Inter',
    'Roboto',
    'Open+Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Nunito',
    'Raleway',
    'Merriweather',
    'Playfair+Display',
    'Lora',
    'PT+Serif',
    'EB+Garamond',
    'Libre+Baskerville',
    'JetBrains+Mono',
    'Fira+Code',
    'Source+Code+Pro',
    'Oswald',
    'Bebas+Neue',
    'Dancing+Script',
    'Pacifico',
    'Caveat',
  ];

  popularFamilies.forEach((fam) => loadedGoogleFamilies.add(fam));

  const linkId = 'docium-gfonts-popular-bundle';
  if (document.getElementById(linkId)) return;

  const familyParams = popularFamilies
    .map((fam) => `family=${fam}:wght@400;600;700`)
    .join('&');
  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
  document.head.appendChild(link);
}

