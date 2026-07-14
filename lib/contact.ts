// Single source of truth for the company contact details, shared by the
// marketing top bar, footer and the /contact page (incl. its JSON-LD).
export const ADDRESS_LINES = [
  "CareerLaunchpad Pvt Ltd, Plot 30",
  "Near Cinema Hall Centre, Yerrabalem Village",
  "Mangalagiri Mandal, Guntur District – 522502",
];
export const ADDRESS_ONE_LINE = ADDRESS_LINES.join(", ");
export const PHONE_DISPLAY = "+91 99635 49926";
export const PHONE_TEL = "+919963549926";
export const EMAIL = "contact@careerlaunchpad.ai";
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS_ONE_LINE)}`;
