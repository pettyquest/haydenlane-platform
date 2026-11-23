/**
 * Hayden Lane terminology: upstream's service-business words, renamed for a drywall and paint
 * subcontractor to production homebuilders. One table, applied as an English overlay on every
 * t()/msg() string (sidebar, page titles, menus, search) by installWording() at start-up.
 *
 * The database, API and URLs keep upstream's names (clients, properties, quotes), so upstream
 * updates still merge. Strings not passed through t() keep upstream's words; add them here only
 * if they go through t().
 */
import { brandText } from "@crewtavo/core/brand";
import { setWording } from "@crewtavo/core/i18n";

export const TERMS: Record<string, string> = {
  Clients: "Builders",
  Client: "Builder",
  "New client": "New builder",
  "Add client": "Add builder",
  "Search clients": "Search builders",
  Properties: "Lots",
  Property: "Lot",
  "New property": "New lot",
  "Add property": "Add lot",
  Requests: "Work requests",
  Quotes: "Bids",
  Quote: "Bid",
  "New quote": "New bid",
  "Client Hub": "Builder portal",
};

/** The Hayden Lane word for an upstream label (unchanged when there isn't one). */
export const term = (text: string) => TERMS[text] ?? text;

/** Turns on the terminology and the product name (packages/core/src/brand.ts) for this page. */
export function installWording() {
  setWording({ english: TERMS, rename: brandText });
}
