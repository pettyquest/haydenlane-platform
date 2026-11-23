/**
 * Hayden Lane fork: the product's name and where its source is, in one place.
 *
 * Crewtavo's NOTICE (AGPL-3.0 section 7 additional terms) says a modified version offered as a
 * service must be marked as different from the original and must not use the Crewtavo name or logo
 * to name or promote it, except to say truthfully that it is based on Crewtavo. So this fork names
 * itself here, and says "based on Crewtavo" where it credits the original (license page, client
 * hub footer). Change these values to rebrand; nothing else in core needs to change.
 *
 * The web app (apps/web/src/main.tsx) and the server (apps/api/src/server.ts) call
 * setWording({ rename: brandText }) at start-up, so interface copy that says "Crewtavo" reads as
 * the product name. Tests don't, so upstream's tests keep passing unchanged.
 */
export const BRAND = {
  /** The business, as the sidebar and sign-in show it. */
  name: "Hayden Lane",
  /** The product, in titles and the installed app's name. */
  product: "Hayden Lane Field OS",
  /** Under 12 characters: the home-screen label. */
  shortName: "Hayden Lane",
  description: "Hayden Lane Field OS: builders, lots, bids, crews and invoicing for Hayden Lane Drywall.",
  /** Light and dark page colours for the browser's toolbar (theme-color). */
  themeColor: { light: "#F5F4F0", dark: "#141513" },
  /** This modified version's source (AGPL-3.0 section 13). */
  sourceUrl: "https://github.com/pettyquest/haydenlane-platform",
  upstream: { name: "Crewtavo", url: "https://github.com/jviars/crewtavo" },
} as const;

/**
 * Interface copy with the upstream product name replaced by this fork's. Leaves the legal names
 * alone ("Crewtavo Terms", the NOTICE and LICENSE), web addresses (crewtavo.com) and lower-case
 * identifiers (crewtavo.theme, @crewtavo/core).
 */
export function brandText(text: string): string {
  if (!text || !text.includes("Crewtavo")) return text;
  return text.replace(/\bCrewtavo\b(?!\s+Terms|\.\w|\s+is free software)/g, BRAND.name);
}
