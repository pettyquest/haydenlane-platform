#!/usr/bin/env node
/**
 * Hayden Lane demo data (fork-only script): a drywall and paint subcontractor to production
 * homebuilders around Phoenix. Fills the business the owner already set up with:
 *
 *   - the Drywall & Paint preset's price list, custom fields and SOP categories (if missing)
 *   - builders (clients) with superintendents, communities and lots (properties)
 *   - bids (quotes) in draft / sent / approved, contract and customer-service jobs, a week of visits
 *   - invoices in each builder state (not submitted, submitted, approved, paid, disputed)
 *   - with JWT_SECRET: four crew members, crews, and a few days of timesheets
 *
 * Every person, community, address, PO number and dollar figure is made up. The builder brands are
 * the public names of builders Hayden Lane works for; their contacts are fake (.test addresses).
 *
 *   HL_URL=https://<instance> HL_EMAIL=<owner email> HL_PASSWORD=<owner password> \
 *     [JWT_SECRET=<instance secret>] HL_ALLOW_REMOTE=1 node scripts/seed-haydenlane.mjs
 *
 * It signs in as the owner and writes through the same API the browser uses (row-level security
 * applies). The service key made from JWT_SECRET is used only to create the demo crew's sign-ins,
 * their time entries, and to stop "visit booked" messages going out for demo visits.
 *
 * Additive and safe to rerun: it stops if the demo builders are already there. It never deletes or
 * changes existing records apart from the company's trade preset and brand color. Run it only on
 * a demo instance, never on one holding a real business's data.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.HL_URL ?? "http://localhost:8080").replace(/\/$/, "");
const EMAIL = process.env.HL_EMAIL;
const PASSWORD = process.env.HL_PASSWORD;
const SECRET = process.env.JWT_SECRET;
if (!EMAIL || !PASSWORD) {
  console.error("Set HL_EMAIL and HL_PASSWORD (the owner's sign-in).");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(BASE) && process.env.HL_ALLOW_REMOTE !== "1") {
  console.error(`Refusing to seed ${BASE} without HL_ALLOW_REMOTE=1. Only seed a demo instance.`);
  process.exit(1);
}

const preset = JSON.parse(readFileSync(new URL("../packages/core/src/presets/drywall_paint.json", import.meta.url), "utf8"));
const config = await (await fetch(`${BASE}/api/config`)).json();
const db = createClient(config.supabaseUrl ?? BASE, config.supabaseKey, { auth: { persistSession: false } });

const b64 = (s) => Buffer.from(s).toString("base64url");
function serviceKey() {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ role: "service_role", iss: "supabase", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}
const admin = SECRET ? createClient(config.supabaseUrl ?? BASE, serviceKey(), { auth: { persistSession: false } }) : null;
const DEFAULTS = { defaultToNull: false };

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

// --- Dates (America/Phoenix: UTC-7 all year) ---------------------------------------------------
const TZ = "America/Phoenix";
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: TZ });
const at = (offset, hhmm) => new Date(`${day(offset)}T${hhmm}:00-07:00`).toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

// --- Sign in and find the business -------------------------------------------------------------
const signedIn = await must(db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD }), "sign in");
const ownerId = signedIn.user.id;
const [membership] = await must(db.from("memberships").select("company_id, role").eq("user_id", ownerId).eq("role", "owner"), "membership");
if (!membership) throw new Error("That sign-in doesn't own a business. Set one up in the app first.");
const company = membership.company_id;
const c = (row) => ({ company_id: company, ...row });

if ((await must(db.from("clients").select("id").eq("company_id", company).contains("tags", ["Demo data"]).limit(1), "seeded?")).length) {
  console.log("Hayden Lane demo data is already there. Nothing to do.");
  process.exit(0);
}

// --- The Drywall & Paint preset, on a business set up with another --------------------------------
const { data: co } = await db.from("companies").select("settings, trade_preset").eq("id", company).single();
const settings = { ...(co?.settings ?? {}), payment_terms_days: 30, working_hours: { start: "06:00", end: "15:30" }, branding: { ...(co?.settings?.branding ?? {}), color: "#3b7d23" } };
const { error: presetError } = await db.from("companies").update({ trade_preset: "drywall_paint", settings }).eq("id", company);
if (presetError) {
  console.warn(`Trade preset not changed (${presetError.message}); setting the brand color only.`);
  await must(db.from("companies").update({ settings }).eq("id", company), "company settings");
}

const have = new Set((await must(db.from("services").select("name").eq("company_id", company), "services")).map((s) => s.name.toLowerCase()));
const sortFrom = 1000;
const missingServices = preset.services.filter((s) => !have.has(s.name.toLowerCase()));
if (missingServices.length) {
  await must(
    db.from("services").insert(missingServices.map((s, i) => c({ name: s.name, unit: s.unit, unit_price: s.unit_price, unit_cost: s.unit_cost ?? null, category: s.category ?? null, sort: sortFrom + i })), DEFAULTS),
    "price list",
  );
}
const fieldsHave = new Set((await must(db.from("custom_field_definitions").select("record_type, key").eq("company_id", company), "fields")).map((f) => `${f.record_type}:${f.key}`));
const fields = preset.custom_fields.flatMap((f, i) =>
  f.records.map((record) => ({ record_type: record, key: f.key, label: f.label, type: f.type, choices: f.choices ?? [], show_on_pdf: f.show_on_pdf === true, show_in_portal: f.show_in_portal === true, sort: 100 + i })),
).filter((f) => !fieldsHave.has(`${f.record_type}:${f.key}`));
if (fields.length) await must(db.from("custom_field_definitions").insert(fields.map(c), DEFAULTS), "custom fields");
const catsHave = new Set((await must(db.from("sop_categories").select("name").eq("company_id", company), "SOP categories")).map((x) => x.name));
const newCats = preset.sop_categories.filter((n) => !catsHave.has(n));
if (newCats.length) await must(db.from("sop_categories").insert(newCats.map((name, i) => c({ name, sort: 100 + i })), DEFAULTS), "SOP categories");

// --- Crew (needs the service key to make their sign-ins) -----------------------------------------
async function ensureUser(email, fullName) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const created = await must(admin.auth.admin.createUser({ email, password: `${PASSWORD}-crew`, email_confirm: true, user_metadata: { full_name: fullName } }), `create ${email}`);
  return created.user.id;
}
let people = null;
if (admin) {
  people = {
    hangLead: await ensureUser("miguel.demo@haydenlane.test", "Miguel Ortega"),
    tapeLead: await ensureUser("ramon.demo@haydenlane.test", "Ramon Diaz"),
    paintLead: await ensureUser("luis.demo@haydenlane.test", "Luis Herrera"),
    csTech: await ensureUser("carlos.demo@haydenlane.test", "Carlos Mendez"),
  };
  const members = new Set((await must(db.from("memberships").select("user_id").eq("company_id", company), "members")).map((m) => m.user_id));
  const rows = [
    [people.hangLead, "crew_lead", 31], [people.tapeLead, "crew_lead", 30], [people.paintLead, "crew_lead", 29], [people.csTech, "field_crew", 26],
  ].filter(([id]) => !members.has(id));
  if (rows.length) await must(db.from("memberships").insert(rows.map(([user_id, role, labor_rate]) => c({ user_id, role, labor_rate }))), "crew");
}
const [hang, tape, paint, cs] = await must(
  db.from("crews").insert([
    c({ name: "Hang crew", color: "#2357a8", lead_user_id: people?.hangLead ?? null }),
    c({ name: "Tape & texture crew", color: "#1d6b66", lead_user_id: people?.tapeLead ?? null }),
    c({ name: "Paint crew", color: "#6b3fa0", lead_user_id: people?.paintLead ?? null }),
    c({ name: "Customer service / warranty", color: "#b42318", lead_user_id: people?.csTech ?? null }),
  ], DEFAULTS).select("id"),
  "crews",
);
if (people) {
  await must(
    db.from("crew_members").insert([
      c({ crew_id: hang.id, user_id: people.hangLead }), c({ crew_id: tape.id, user_id: people.tapeLead }),
      c({ crew_id: paint.id, user_id: people.paintLead }), c({ crew_id: cs.id, user_id: people.csTech }),
    ]),
    "crew members",
  );
}

// --- Builders and superintendents (all contacts fake) --------------------------------------------
const BUILDERS = [
  { key: "drh", display_name: "D.R. Horton - Phoenix", company_name: "D.R. Horton (Phoenix division)", portal: "Hyphen BuildPro", terms: 45, super: "Brett Kimball" },
  { key: "pulte", display_name: "Pulte Homes - Arizona", company_name: "Pulte Homes (Arizona division)", portal: "Hyphen SupplyPro", terms: 30, super: "Tanya Reyes" },
  { key: "meritage", display_name: "Meritage Homes - Phoenix", company_name: "Meritage Homes (Phoenix division)", portal: "Hyphen SupplyPro", terms: 30, super: "Jake Lindgren" },
  { key: "toll", display_name: "Toll Brothers - Arizona", company_name: "Toll Brothers (Arizona division)", portal: "Builder portal", terms: 30, super: "Monica Shaw" },
  { key: "tm", display_name: "Taylor Morrison - Phoenix", company_name: "Taylor Morrison (Phoenix division)", portal: "Hyphen SupplyPro", terms: 30, super: "Victor Alvarez" },
];
const builderRows = await must(
  db.from("clients").insert(
    BUILDERS.map((b, i) => c({
      display_name: b.display_name, company_name: b.company_name, status: "active", lead_source: "Builder relationship", tags: ["Production builder", b.portal, "Demo data"],
      email: `ap.demo@${b.key}-builder.test`, phone: `(480) 555-01${String(20 + i).padStart(2, "0")}`, payment_terms_days: b.terms,
      custom_fields: { billing_portal: b.portal }, billing_address: { line1: "Accounts Payable", city: "Phoenix", region: "AZ", postal_code: "85016" },
    })),
    DEFAULTS,
  ).select("id"),
  "builders",
);
const builder = Object.fromEntries(BUILDERS.map((b, i) => [b.key, builderRows[i].id]));
const superOf = Object.fromEntries(BUILDERS.map((b) => [b.key, b.super]));
await must(
  db.from("client_contacts").insert(
    BUILDERS.flatMap((b) => [
      c({ client_id: builder[b.key], name: b.super, role: "Superintendent", email: `${b.super.toLowerCase().replace(/[^a-z]+/g, ".")}@${b.key}-builder.test`, phone: "(480) 555-0170", is_primary: true }),
      c({ client_id: builder[b.key], name: "Accounts payable", role: "Accounts payable", email: `ap.demo@${b.key}-builder.test`, is_primary: false }),
    ]),
    DEFAULTS,
  ),
  "superintendents",
);

// --- Communities and lots (fictional) --------------------------------------------------------------
const COMMUNITIES = [
  { name: "Saddleback Ranch", builder: "drh", city: "Maricopa", zip: "85138", street: "W Saddleback Trl", lat: 33.0581, lng: -112.0476, lots: [[42, "Plan 2071"], [43, "Plan 1845"], [51, "Plan 2071"], [58, "Plan 2410"]] },
  { name: "Mirage Point", builder: "pulte", city: "Buckeye", zip: "85326", street: "S Mirage Point Dr", lat: 33.3701, lng: -112.5838, lots: [[117, "Plan 4022"], [118, "Plan 4518"], [124, "Plan 4022"]] },
  { name: "Copper Wash", builder: "meritage", city: "Queen Creek", zip: "85142", street: "E Copper Wash Ln", lat: 33.2487, lng: -111.6343, lots: [[9, "Juniper"], [12, "Mesquite"]] },
  { name: "Granite Vista", builder: "toll", city: "Scottsdale", zip: "85255", street: "E Granite Vista Rd", lat: 33.7213, lng: -111.8402, lots: [[15, "Sonora"], [16, "Catalina"]] },
  { name: "Palo Verde Crossing", builder: "tm", city: "Surprise", zip: "85387", street: "W Palo Verde Xing", lat: 33.6788, lng: -112.4521, lots: [[204, "Plan 1620"], [207, "Plan 1980"]] },
];
const lotRows = COMMUNITIES.flatMap((cm) =>
  cm.lots.map(([lot, plan], i) => ({
    community: cm.name, builderKey: cm.builder, lot: String(lot), plan,
    row: c({
      client_id: builder[cm.builder], label: `${cm.name} - Lot ${lot}`, line1: `${18000 + lot * 7} ${cm.street}`, city: cm.city, region: "AZ", postal_code: cm.zip,
      lat: cm.lat + i * 0.0009, lng: cm.lng + i * 0.0011, tags: [cm.name], custom_fields: { community: cm.name, lot: String(lot), plan },
    }),
  })),
);
const props = await must(db.from("properties").insert(lotRows.map((l) => l.row), DEFAULTS).select("id"), "lots");
const LOT = Object.fromEntries(lotRows.map((l, i) => [`${l.community} ${l.lot}`, { ...l, id: props[i].id }]));

// --- Line items ----------------------------------------------------------------------------------
const services = await must(db.from("services").select("id, name, unit, unit_price, unit_cost").eq("company_id", company), "services");
const line = (name, quantity, extra = {}) => {
  const s = services.find((x) => x.name === name);
  if (!s) throw new Error(`no service ${name}`);
  return { service_id: s.id, name: s.name, unit: s.unit, unit_price: s.unit_price, quantity, ...extra };
};
const drywall = (boardSqft, texture = "knockdown") => [
  line("Hang drywall (board sq ft)", boardSqft), line("Tape and finish (board sq ft)", boardSqft), line(`Texture, ${texture} (board sq ft)`, boardSqft),
  line("Corner bead and trims", 1), line("Garage firetape", 1), line("Drywall stocking and delivery", 1), line("Scrap-out and clean", 1),
];
const paintLines = (floorSqft, accent = 0) => [
  line("Interior paint, walls (floor sq ft)", floorSqft), line("Interior paint, ceilings (floor sq ft)", floorSqft), line("Doors and trim enamel", 1),
  ...(accent ? [line("Option: accent wall", accent)] : []),
];
const csLines = (hours, materials = "Drywall repair materials") => [line("Customer service trip", 1), line("Customer service labor", hours), line(materials, 1)];
let po = 7731400;
const nextPo = () => `PO-${po++}`;

// --- Bids (quotes) ----------------------------------------------------------------------------------
async function bid(lotKey, title, status, lines, fields = {}, extra = {}) {
  const lot = LOT[lotKey];
  const approved = status === "approved";
  const q = await must(
    db.from("quotes").insert(c({
      client_id: builder[lot.builderKey], property_id: lot.id, title, status: approved ? "sent" : status, tax_rate: 0,
      custom_fields: { work_type: "Contract", community: lot.community, lot: lot.lot, ...fields }, ...(approved ? {} : extra),
    })).select("id").single(),
    `bid ${title}`,
  );
  await must(db.from("quote_line_items").insert(lines.map((l, i) => c({ ...l, quote_id: q.id, sort: i })), DEFAULTS), `bid lines ${title}`);
  if (approved) await must(db.from("quotes").update({ status, ...extra }).eq("id", q.id), `approve ${title}`);
  return q.id;
}
await bid("Granite Vista 16", "Drywall + paint - Granite Vista Lot 16 (Catalina)", "draft", [...drywall(9420, "orange peel"), ...paintLines(3650, 2)]);
await bid("Copper Wash 12", "Drywall - Copper Wash Lot 12 (Mesquite), plan pricing", "sent", drywall(7180), {}, { sent_at: daysAgo(3), message: "Plan pricing for Mesquite per the builder's scope sheet. Knockdown texture, firetape in garage." });
const approvedBid = await bid("Mirage Point 124", "Drywall - Mirage Point Lot 124 (Plan 4022)", "approved", drywall(8850), { builder_po: nextPo() }, { approved_at: daysAgo(6) });

// --- Jobs ---------------------------------------------------------------------------------------------
async function job(lotKey, title, lines, { type, status = "active", crew, ref }) {
  const lot = LOT[lotKey];
  const custom = { work_type: type, superintendent: superOf[lot.builderKey], community: lot.community, lot: lot.lot, plan: lot.plan, builder_po: ref ?? nextPo() };
  const [row] = await must(
    db.from("jobs").insert(c({ client_id: builder[lot.builderKey], property_id: lot.id, title, status, default_crew_id: crew.id, po_number: custom.builder_po, custom_fields: custom })).select("id"),
    `job ${title}`,
  );
  await must(db.from("job_line_items").insert(lines.map((l, i) => c({ job_id: row.id, sort: i, ...l }))), `job lines ${title}`);
  return { id: row.id, lot, title, crew };
}
const fromBid = await must(db.rpc("convert_quote_to_job", { p_quote: approvedBid }), "bid to job");
const mp124 = LOT["Mirage Point 124"];
await must(db.from("jobs").update({ default_crew_id: tape.id, custom_fields: { work_type: "Contract", superintendent: superOf.pulte, community: mp124.community, lot: mp124.lot, plan: mp124.plan } }).eq("id", fromBid), "bid job details");
const J = {
  mp124: { id: fromBid, lot: mp124, title: "Drywall - Mirage Point Lot 124", crew: tape },
  sr51: await job("Saddleback Ranch 51", "Drywall - Saddleback Ranch Lot 51", drywall(6240), { type: "Contract", crew: hang }),
  sr58: await job("Saddleback Ranch 58", "Drywall - Saddleback Ranch Lot 58", drywall(7120), { type: "Contract", crew: hang }),
  gv15: await job("Granite Vista 15", "Interior paint - Granite Vista Lot 15", paintLines(3180, 2), { type: "Contract", crew: paint }),
  pv207: await job("Palo Verde Crossing 207", "Drywall - Palo Verde Crossing Lot 207", drywall(5780, "orange peel"), { type: "Contract", crew: tape }),
  csSr42: await job("Saddleback Ranch 42", "CS - nail pops and corner bead, Saddleback Ranch Lot 42", csLines(3), { type: "Customer service", crew: cs }),
  wGv16: await job("Granite Vista 16", "Warranty - 11-month walk, Granite Vista Lot 16", [line("Warranty / punch (non-billable)", 2)], { type: "Warranty", crew: cs, ref: "No PO (warranty)" }),
  // Done, waiting to be invoiced.
  sr43: await job("Saddleback Ranch 43", "Drywall - Saddleback Ranch Lot 43", drywall(5340), { type: "Contract", status: "requires_invoicing", crew: hang }),
  mp117: await job("Mirage Point 117", "Interior paint - Mirage Point Lot 117", paintLines(4022, 1), { type: "Contract", status: "requires_invoicing", crew: paint }),
  cw9: await job("Copper Wash 9", "Drywall - Copper Wash Lot 9", drywall(9120), { type: "Contract", status: "requires_invoicing", crew: tape }),
  pv204: await job("Palo Verde Crossing 204", "Interior paint - Palo Verde Crossing Lot 204", paintLines(1620), { type: "Contract", status: "requires_invoicing", crew: paint }),
  mp118: await job("Mirage Point 118", "Drywall - Mirage Point Lot 118", drywall(9940), { type: "Contract", status: "requires_invoicing", crew: tape }),
  csMp117: await job("Mirage Point 117", "CS - patch after plumber, Mirage Point Lot 117", csLines(2.5), { type: "Customer service", status: "requires_invoicing", crew: cs }),
  csCw9: await job("Copper Wash 9", "CS - garage wall repair, Copper Wash Lot 9", csLines(4), { type: "Customer service", status: "requires_invoicing", crew: cs }),
  csPv204: await job("Palo Verde Crossing 204", "CS - texture match in hall bath (super asked, no PO)", csLines(3.5), { type: "Customer service", status: "requires_invoicing", crew: cs, ref: "No PO yet" }),
  csSr51: await job("Saddleback Ranch 51", "CS - punch walk patching, Saddleback Ranch Lot 51", csLines(2, "Paint touch-up materials"), { type: "Customer service", status: "requires_invoicing", crew: cs }),
};

// --- Visits: last week (done) and this week ------------------------------------------------------
const v = (j, title, offset, from, to, status = "scheduled") => c({ job_id: j.id, property_id: j.lot.id, title, starts_at: at(offset, from), ends_at: at(offset, to), crew_id: j.crew.id, status });
const visits = await must(
  db.from("visits").insert([
    v(J.sr43, "Hang - Saddleback Ranch 43", -9, "06:00", "14:30", "completed"),
    v(J.cw9, "Tape & texture - Copper Wash 9", -8, "06:00", "15:00", "completed"),
    v(J.mp118, "Tape & texture - Mirage Point 118", -7, "06:30", "15:00", "completed"),
    v(J.mp117, "Paint - Mirage Point 117", -6, "06:00", "15:30", "completed"),
    v(J.pv204, "Paint - Palo Verde Crossing 204", -5, "06:00", "14:00", "completed"),
    v(J.csMp117, "CS - Mirage Point 117 patch", -4, "08:00", "10:30", "completed"),
    v(J.csCw9, "CS - Copper Wash 9 garage wall", -3, "07:00", "11:00", "completed"),
    v(J.csPv204, "CS - Palo Verde Crossing 204 texture match", -3, "12:00", "15:30", "completed"),
    v(J.csSr51, "CS - Saddleback Ranch 51 punch patching", -2, "10:30", "12:30", "completed"),
    v(J.sr51, "Hang - Saddleback Ranch 51", 0, "06:00", "14:30", "in_progress"),
    v(J.mp124, "Tape & texture - Mirage Point 124", 0, "06:00", "15:00", "in_progress"),
    v(J.gv15, "Paint - Granite Vista 15", 0, "06:30", "15:00"),
    v(J.csSr42, "CS - Saddleback Ranch 42 nail pops", 0, "08:00", "11:00"),
    v(J.wGv16, "Warranty walk - Granite Vista 16 (non-billable)", 0, "13:00", "14:30"),
    v(J.pv207, "Hang - Palo Verde Crossing 207", 1, "06:00", "14:30"),
    v(J.mp124, "Texture - Mirage Point 124", 1, "06:00", "13:00"),
    v(J.sr51, "Tape - Saddleback Ranch 51", 2, "06:00", "15:00"),
    v(J.sr58, "Hang - Saddleback Ranch 58", 3, "06:00", "14:30"),
  ], DEFAULTS).select("id, title, crew_id"),
  "visits",
);
if (admin) {
  // Demo builders aren't told their demo visits are booked.
  for (const row of visits) await must(admin.rpc("call_off_visit_notice", { p_visit: row.id }), "no booked message");
}
if (people) {
  const leadOf = new Map([[hang.id, people.hangLead], [tape.id, people.tapeLead], [paint.id, people.paintLead], [cs.id, people.csTech]]);
  await must(db.from("visit_assignees").insert(visits.map((r) => c({ visit_id: r.id, user_id: leadOf.get(r.crew_id) }))), "assignees");
}

// --- Invoices in each builder state --------------------------------------------------------------
async function invoice(j, { status = "draft", builderStatus, issued = -3, terms = 30, paid }) {
  const id = await must(db.rpc("create_invoice_for_job", { p_job: j.id }), `invoice ${j.title}`);
  const { custom_fields: carried } = await must(db.from("invoices").select("custom_fields").eq("id", id).single(), "carried fields");
  const fieldsNow = { ...carried, builder_status: builderStatus };
  const update = status === "draft" ? { custom_fields: fieldsNow } : { status: "sent", issued_on: day(issued), due_on: day(issued + terms), sent_at: daysAgo(-issued), custom_fields: fieldsNow };
  await must(db.from("invoices").update(update).eq("id", id), `update ${j.title}`);
  if (paid) {
    const { total, client_id } = await must(db.from("invoices").select("total, client_id").eq("id", id).single(), "total");
    await must(db.from("payments").insert(c({ invoice_id: id, client_id, amount: total, method: paid.method, received_at: daysAgo(paid.ago), notes: paid.notes })), `pay ${j.title}`);
  }
  return id;
}
await invoice(J.csSr51, { builderStatus: "Not submitted" });
await invoice(J.pv204, { builderStatus: "Not submitted" });
await invoice(J.mp118, { status: "sent", builderStatus: "Submitted - awaiting approval", issued: -4 });
await invoice(J.csCw9, { status: "sent", builderStatus: "Submitted - awaiting approval", issued: -1 });
await invoice(J.cw9, { status: "sent", builderStatus: "Approved", issued: -12 });
await invoice(J.mp117, { status: "sent", builderStatus: "Approved", issued: -35, paid: { method: "ach", ago: 4, notes: "Hyphen remittance 0045512 (demo)" } });
await invoice(J.csMp117, { status: "sent", builderStatus: "Approved", issued: -30, paid: { method: "check", ago: 2, notes: "Check #880412 (demo)" } });
await invoice(J.csPv204, { status: "sent", builderStatus: "Disputed", issued: -9 });
await invoice(J.sr43, { status: "sent", builderStatus: "Needs rec #", issued: -50, terms: 45 });

// --- Timesheets (service key: entries for other people) ------------------------------------------
if (admin && people) {
  const visitId = (title) => visits.find((x) => x.title === title)?.id ?? null;
  const shift = (user, offset, from, to, row = {}) => ({ company_id: company, user_id: user, started_at: at(offset, from), ended_at: to && at(offset, to), ...row });
  const ok = (rate) => ({ approved_by: ownerId, approved_at: daysAgo(1), labor_rate: rate });
  await must(
    admin.from("time_entries").insert([
      shift(people.csTech, -3, "07:00", "11:05", { job_id: J.csCw9.id, visit_id: visitId("CS - Copper Wash 9 garage wall"), ...ok(26) }),
      shift(people.csTech, -3, "12:00", "15:40", { job_id: J.csPv204.id, visit_id: visitId("CS - Palo Verde Crossing 204 texture match"), notes: "Super asked to also match texture in the hall bath. No PO yet.", ...ok(26) }),
      shift(people.csTech, -2, "10:30", "12:40", { job_id: J.csSr51.id, visit_id: visitId("CS - Saddleback Ranch 51 punch patching"), ...ok(26) }),
      shift(people.hangLead, -1, "06:00", "14:20", { job_id: J.sr51.id }),
      shift(people.tapeLead, -1, "06:05", "15:10", { job_id: J.mp124.id }),
      shift(people.paintLead, -1, "06:30", "14:45", { job_id: J.gv15.id }),
    ], DEFAULTS),
    "time entries",
  );
}

// --- SOPs: the billing rules that live in people's heads today ---------------------------------------
const cats = await must(db.from("sop_categories").select("id, name").eq("company_id", company), "categories");
const cat = (n) => cats.find((x) => x.name === n)?.id ?? null;
const sop = (category, title, html, required = false, tags = []) => c({ category_id: cat(category), title, body_html: html, body_text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), required, tags });
await must(
  db.from("sop_pages").insert([
    sop("Builder billing", "Billing a Hyphen PO (contract work)", "<ol><li>Find the PO in SupplyPro/BuildPro by lot address.</li><li>Every PO line goes on the invoice: same description, quantity and price.</li><li>Totals must match the PO to the cent before it's submitted.</li><li>Set <strong>Builder approval</strong> to <em>Submitted</em>, then <em>Approved</em> when Hyphen shows it approved.</li></ol>", true, ["hyphen", "po"]),
    sop("Customer service", "No PO, no extra work", "<p>If a superintendent asks for work that isn't on the work order, <strong>ask for a PO before you start</strong>, and note it on the visit checklist.</p>", true, ["customer service", "po"]),
    sop("Drywall", "Texture: orange peel vs knockdown", "<p>The plan sheet says which texture each room gets. Orange peel: spray, no knockdown. Knockdown: spray, wait for the sheen to go, then knock down with the blade. Match the model home.</p>", false, ["texture"]),
  ], DEFAULTS),
  "SOPs",
);

console.log(`Hayden Lane demo data added: ${BUILDERS.length} builders, ${props.length} lots, 3 bids, ${Object.keys(J).length} jobs, ${visits.length} visits, 9 invoices${people ? ", crew and timesheets" : ""}.`);
