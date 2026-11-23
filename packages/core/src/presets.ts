/**
 * Trade presets: the starting catalog, formulas, checklists, intake forms and SOP categories for a
 * kind of business. Adding a trade means adding a JSON file here and to PRESETS.
 */
import cleaning from "./presets/cleaning.json";
import drywallPaint from "./presets/drywall_paint.json";
import electrical from "./presets/electrical.json";
import general from "./presets/general.json";
import handyman from "./presets/handyman.json";
import hvac from "./presets/hvac.json";
import landscaping from "./presets/landscaping.json";
import lawnExterior from "./presets/lawn_exterior.json";
import paving from "./presets/paving.json";
import pestControl from "./presets/pest_control.json";
import plumbing from "./presets/plumbing.json";
import poolService from "./presets/pool_service.json";
import roofingExteriors from "./presets/roofing_exteriors.json";
import type { CustomFieldRecord, CustomFieldType } from "./customFields";
import { isPavingWork, pavingWorkLabel, type PavingWork } from "./paving";
import type { WeatherRule } from "./weather";

export interface PresetService {
  name: string;
  unit: string;
  unit_price: number;
  /** What it costs the business, for the margin on quotes. */
  unit_cost?: number;
  category?: string;
  formula_name?: string;
  /** The depth, in inches, its formula starts with when a measurement fills a quote (services.default_depth_in). */
  default_depth_in?: number;
}

export interface PresetFormula {
  name: string;
  formula: string;
  sets?: "quantity" | "unit_price"; // default quantity
}

export interface PresetChecklistItem {
  key: string;
  label: string;
  type: "check" | "number" | "text" | "choice" | "photo" | "signature";
  required: boolean;
  options?: string[];
}

/**
 * A checklist crews fill in on a visit (checklist_templates). `services` names the price list items
 * it goes with, exactly as this preset's `services` name them: a visit whose job has one of them
 * brings the checklist up, ready to fill in. Leave it out for a checklist for any job. `every_job`
 * brings it up on every job; `work` (kinds of paving calculator work, PAVING_WORK) on jobs priced
 * with the paving calculator that have one of them, which have no price list item to go by. Item
 * keys are unique within the checklist (lowercase words joined by _).
 *
 *   {
 *     "name": "Snow and salt route stop",
 *     "services": ["Snow plowing", "Salt application"],
 *     "items": [
 *       { "key": "lot_cleared", "label": "Lot or drive cleared", "type": "check", "required": true },
 *       { "key": "salt_lbs", "label": "Salt applied (lbs)", "type": "number", "required": false },
 *       { "key": "photo", "label": "Photo on completion", "type": "photo", "required": true }
 *     ]
 *   }
 */
export interface PresetChecklist {
  name: string;
  services?: string[];
  every_job?: boolean;
  work?: PavingWork[];
  items: PresetChecklistItem[];
}

export interface PresetQuestion {
  key: string;
  label: string;
  type: "address" | "text" | "long_text" | "number" | "yes_no" | "choice" | "multi_choice" | "photos";
  required: boolean;
  options?: string[];
}

export interface PresetIntakeForm {
  name: string;
  slug: string;
  kind: "request" | "assessment" | "booking";
  requires_approval: boolean;
  lead_time_days: number;
  slot_minutes?: number;
  max_per_day?: number;
  questions: PresetQuestion[];
}

/**
 * What a package's card can hold, as roof_packages and quote_options allow it (their CHECKs): the
 * name and tier in characters, up to 8 highlights with 1,200 characters between them, the warranty
 * in characters, the picture's pixels either way, and its contract sections.
 */
export const PACKAGE_LIMITS = { name: 80, tier: 40, highlights: 8, highlightChars: 1200, warranty: 400, picturePixels: 4000, sections: 50 } as const;

const PACKAGE_PICTURE = /^[0-9a-f-]{36}\/packages\/[0-9a-f-]{36}\.jpg$/;

/** A package picture's path in the files bucket (<company>/packages/<uuid>.jpg). */
export const isPackagePicturePath = (path: string) => PACKAGE_PICTURE.test(path);

/** Where a package picture loads from (`base` is the app's address, or "" on its own pages). */
export const packagePictureSrc = (path: string, base = "") => `${base}/api/public/package/${path.replace("/packages/", "/")}`;

const SERVICE_PICTURE = /^[0-9a-f-]{36}\/services\/[0-9a-f-]{36}\.jpg$/;

/** A price list item's picture in the files bucket (<company>/services/<uuid>.jpg), as packages keep theirs. */
export const isServicePicturePath = (path: string) => SERVICE_PICTURE.test(path);

/** Where a price list item's picture loads from (`base` is the app's address, or "" on its own pages). */
export const servicePictureSrc = (path: string, base = "") => `${base}/api/public/service/${path.replace("/services/", "/")}`;

/**
 * A roof package to start a roofing business with (roof_packages): the service that prices the roof
 * by the square, what's always on it and the one-tap quick adds, all by service name, and what the
 * homeowner reads on its card when it's offered as an option.
 */
export interface PresetPackage {
  name: string;
  style: "shingle" | "designer" | "metal" | "other";
  roof: string;
  default?: boolean;
  /** quantity: how many to start with when the service isn't measured (pipe boots: 3). */
  included: Array<{ service: string; quantity?: number }>;
  quick: string[];
  /** "Good", "Better" or "Best". */
  tier?: string;
  /** A few short lines on the option's card. */
  highlights?: string[];
  /**
   * One sentence: what the warranty covers, and for how long. Example wording, like the example
   * contract sections: wherever it's shown, say so (isExampleWarranty, contracts.ts STARTER_NOTE).
   */
  warranty?: string;
}

/**
 * A custom field a trade starts with (custom_field_definitions), on each of `records`. One on both
 * quotes and jobs carries its value from a quote to the job made from it, as any custom field of
 * the same key and type does. Roofing's insurance claim details are these.
 */
export interface PresetCustomField {
  key: string;
  label: string;
  type: CustomFieldType;
  records: CustomFieldRecord[];
  choices?: string[];
  show_on_pdf?: boolean;
  show_in_portal?: boolean;
}

export interface TradePreset {
  id: string;
  name: string;
  description: string;
  services: PresetService[];
  formulas: PresetFormula[];
  packages?: PresetPackage[];
  checklists: PresetChecklist[];
  intake_forms: PresetIntakeForm[];
  weather_rules: WeatherRule[];
  custom_fields?: PresetCustomField[];
  sop_categories: string[];
}

/** General first (sign-up's default), then the trades by name, as sign-up and Settings list them. */
export const PRESETS: Record<string, TradePreset> = {
  general: general as TradePreset,
  cleaning: cleaning as TradePreset,
  drywall_paint: drywallPaint as TradePreset,
  electrical: electrical as TradePreset,
  handyman: handyman as TradePreset,
  hvac: hvac as TradePreset,
  landscaping: landscaping as TradePreset,
  lawn_exterior: lawnExterior as TradePreset,
  paving: paving as TradePreset,
  pest_control: pestControl as TradePreset,
  plumbing: plumbing as TradePreset,
  pool_service: poolService as TradePreset,
  roofing_exteriors: roofingExteriors as TradePreset,
};

export function getPreset(id: string): TradePreset {
  const preset = PRESETS[id];
  if (!preset) throw new RangeError(`Unknown trade preset "${id}"`);
  return preset;
}

/** A preset's custom fields as custom_field_definitions rows (without the company): one for each record a field is on, in the preset's order. */
export function presetCustomFields(preset: TradePreset) {
  return (preset.custom_fields ?? []).flatMap((f, i) =>
    f.records.map((record) => ({ record_type: record, key: f.key, label: f.label, type: f.type, choices: f.choices ?? [], show_on_pdf: f.show_on_pdf === true, show_in_portal: f.show_in_portal === true, sort: i })),
  );
}

/**
 * A preset's weather rules as a new business's settings keep them: a rule for a price list item
 * names it by id as well (`idOf`: the id the item was just given), and one for a kind of paving
 * calculator work is called by its kind, as set_weather_rules would save it.
 */
export function presetWeatherRules(preset: TradePreset, idOf: (service: string | undefined) => string | undefined): WeatherRule[] {
  return preset.weather_rules.map((r) => {
    if (isPavingWork(r.work)) return { ...r, applies_to: pavingWorkLabel(r.work) };
    const id = idOf(r.applies_to);
    return id ? { ...r, service_id: id } : r;
  });
}

const EXAMPLE_WARRANTIES = new Set(
  Object.values(PRESETS)
    .flatMap((p) => p.packages ?? [])
    .map((p) => p.warranty?.trim())
    .filter(Boolean),
);

/**
 * Whether a package's warranty is still a preset's example wording, which promises years of
 * workmanship the business never chose. Until the business writes its own, the office is told:
 * setup's message (roofing/packages.ts setupMessage), the packages page (STARTER_NOTE above the
 * list, a flag on the package and beside its warranty in the editor), and the office's package
 * pickers and options bar ("Example warranty"). Never where the homeowner is looking on.
 */
export const isExampleWarranty = (warranty: string | null | undefined) => EXAMPLE_WARRANTIES.has(warranty?.trim() ?? "");

export const presetSummaries = () =>
  Object.values(PRESETS).map(({ id, name, description }) => ({ id, name, description }));
