/* ===========================================================================
 * OAMDC institute report → degree-college SEED SQL   (browser-console scraper)
 *
 * GOAL: capture every degree college (with its AFFILIATING UNIVERSITY) from the
 * LOGIN-GATED institute report, ONCE, and emit ready-to-run Supabase seed
 * migrations — so we keep our OWN copy and never depend on the live site again.
 *
 * Runs in YOUR authenticated browser session (reuses your login cookies), so it
 * doesn't bypass the login.
 *
 * The LIST page (a jQuery DataTables grid) already has the granular "University
 * Name" column, so we read the university straight from the list — no guessing
 * from Region. We pull EVERY row via the DataTables API (no page-clicking).
 * Optionally we also fetch each college's detail page to enrich address /
 * pincode / year / ownership (Govt vs Private), which the list doesn't carry.
 *
 * HOW TO RUN
 *   1. Log in and open the institute report LIST page (the one with the table
 *      that has a "University Name" column).
 *   2. DevTools → Console → paste this whole file → Enter.
 *   3. Watch progress. It downloads 034_degree_college_seed_01.sql, _02.sql, …
 *      (allow "multiple downloads" if asked). Drop them in supabase/migrations/,
 *      run in order, commit.
 *
 * Set ENRICH_FROM_DETAIL = false for a fast, list-only run (university + name +
 * place + district; address/pincode/year/ownership left NULL).
 * =========================================================================== */
(async () => {
  // ---- knobs ---------------------------------------------------------------
  const ENRICH_FROM_DETAIL = true; // also fetch each detail page for address/pincode/year/ownership
  const START_MIGRATION = 34;      // first file → 034_degree_college_seed_01.sql
  const CHUNK = 300;               // colleges per .sql file
  const DELAY_MS = 100;            // pause between detail fetches

  // OAMDC "University Name" (any casing/spelling) → our canonical 033 seed name.
  const UNIVERSITIES = {
    "andhra university": "Andhra University",
    "adikavi nannaya university": "Adikavi Nannaya University",
    "nannaya university": "Adikavi Nannaya University",
    "acharya nagarjuna university": "Acharya Nagarjuna University",
    "nagarjuna university": "Acharya Nagarjuna University",
    "krishna university": "Krishna University",
    "sri venkateswara university": "Sri Venkateswara University",
    "venkateswara university": "Sri Venkateswara University",
    "vikrama simhapuri university": "Vikrama Simhapuri University",
    "simhapuri university": "Vikrama Simhapuri University",
    "yogi vemana university": "Yogi Vemana University",
    "vemana university": "Yogi Vemana University",
    "rayalaseema university": "Rayalaseema University",
    "sri krishnadevaraya university": "Sri Krishnadevaraya University",
    "krishnadevaraya university": "Sri Krishnadevaraya University",
    "dr b r ambedkar university": "Dr. B.R. Ambedkar University",
    "dr br ambedkar university": "Dr. B.R. Ambedkar University",
    "b r ambedkar university": "Dr. B.R. Ambedkar University",
    "br ambedkar university": "Dr. B.R. Ambedkar University",
    "ambedkar university": "Dr. B.R. Ambedkar University",
  };
  const normU = (s) => s.toLowerCase().replace(/[.\-]/g, " ").replace(/\s+/g, " ").trim();

  const clean = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const cleanStr = (s) => (s || "").replace(/\s+/g, " ").trim();
  const sqlLit = (v) => (v == null || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
  const ownership = (type) => {
    const v = (type || "").toLowerCase();
    if (!v) return null;
    return /gov/.test(v) ? "GOVERNMENT" : "PRIVATE";
  };

  // ---- locate the list table (the one with the most rows) ------------------
  const listTable = [...document.querySelectorAll("table")]
    .map((t) => ({ t, n: t.querySelectorAll("tr").length }))
    .sort((a, b) => b.n - a.n)[0]?.t;
  if (!listTable) return console.error("No table found — are you on the list page?");

  // ---- map columns by header text -----------------------------------------
  const headers = [...listTable.querySelectorAll("thead th")].map((th) => clean(th).toLowerCase());
  const colOf = (...names) => headers.findIndex((h) => names.some((n) => h.includes(n)));
  const COL = {
    code: colOf("institute code", "college code", "code"),
    name: colOf("institute name", "college name", "name"),
    place: colOf("place"),
    district: colOf("district"),
    university: colOf("university name", "university"),
    region: colOf("region"),
    type: colOf("inst.type", "inst type"),
  };
  if (COL.name < 0 || COL.university < 0)
    return console.error("Couldn't find Institute Name / University Name columns. Headers:", headers);

  // ---- get ALL row nodes (DataTables API if present, else the DOM) ---------
  let rowNodes;
  try {
    const jq = window.jQuery || window.$;
    if (jq && jq.fn && jq.fn.dataTable && jq.fn.dataTable.isDataTable(listTable)) {
      rowNodes = jq(listTable).DataTable().rows().nodes().toArray();
    }
  } catch (_) { /* fall through */ }
  if (!rowNodes || !rowNodes.length)
    rowNodes = [...listTable.querySelectorAll("tbody tr")].filter((tr) => tr.querySelectorAll("td").length);

  // ---- read each list row --------------------------------------------------
  const at = (cells, i) => (i >= 0 && cells[i] ? clean(cells[i]) : "");
  const records = [];
  const unknownU = new Set();
  for (const tr of rowNodes) {
    const cells = [...tr.querySelectorAll("td")];
    if (!cells.length) continue;
    const name = at(cells, COL.name);
    if (!name) continue;
    const uRaw = at(cells, COL.university);
    const canon = uRaw ? UNIVERSITIES[normU(uRaw)] ?? null : null;
    if (uRaw && !canon) unknownU.add(uRaw);
    const codeCell = COL.code >= 0 ? cells[COL.code] : null;
    const href = codeCell?.querySelector("a[href]")?.getAttribute("href");
    records.push({
      code: at(cells, COL.code),
      name,
      place: at(cells, COL.place) || null,
      district: at(cells, COL.district) || null,
      university: canon, // canonical seed name, or null if unmapped
      detailUrl: href ? new URL(href, location.href).href : null,
      // enriched later (or left null):
      address: null,
      pincode: null,
      year: null,
      type: at(cells, COL.type) || null, // list "Inst.Type" is coed/women, NOT ownership
      ownership: null,
    });
  }
  if (!records.length) return console.error("Read 0 rows from the list.");
  console.log(`Read ${records.length} colleges from the list.`);

  // ---- optional: enrich from each detail page ------------------------------
  if (ENRICH_FROM_DETAIL) {
    const withUrl = records.filter((r) => r.detailUrl);
    if (!withUrl.length) {
      console.warn("No detail links found on the code cells — skipping enrichment (list data only).");
    } else {
      console.log(`Enriching ${withUrl.length} colleges from detail pages…`);
      const parseDetail = (doc) => {
        const cells = [...doc.querySelectorAll("td, th")];
        const norm = (s) => s.replace(/:$/, "").replace(/\s+/g, " ").trim().toLowerCase();
        const val = (...labels) => {
          for (let i = 0; i < cells.length - 1; i++) {
            const t = norm(clean(cells[i]));
            if (labels.some((l) => t === l || t.startsWith(l))) return clean(cells[i + 1]);
          }
          return "";
        };
        const address = val("address of the college", "address");
        return {
          address,
          pincode: (address.match(/\b(\d{6})\b/g) || []).pop() || null,
          year: (val("year of est", "year of estb", "year of establishment").match(/\d{4}/) || [null])[0],
          ownership: ownership(val("type of college", "type")),
        };
      };
      for (let i = 0; i < withUrl.length; i++) {
        const r = withUrl[i];
        try {
          const res = await fetch(r.detailUrl, { credentials: "include" });
          const doc = new DOMParser().parseFromString(await res.text(), "text/html");
          Object.assign(r, parseDetail(doc));
        } catch (e) {
          console.warn(`detail failed for ${r.code || r.name}: ${e.message}`);
        }
        if ((i + 1) % 50 === 0 || i + 1 === withUrl.length) console.log(`…${i + 1}/${withUrl.length}`);
        if (DELAY_MS) await new Promise((res) => setTimeout(res, DELAY_MS));
      }
    }
  }

  // ---- build the seed SQL, chunked into files ------------------------------
  const pad3 = (n) => String(n).padStart(3, "0");
  const pad2 = (n) => String(n).padStart(2, "0");
  const totalFiles = Math.ceil(records.length / CHUNK);
  const files = [];
  for (let p = 0; p < totalFiles; p++) {
    const part = records.slice(p * CHUNK, (p + 1) * CHUNK);
    const fileNo = pad3(START_MIGRATION + p);
    const partNo = pad2(p + 1);
    const lines = [
      "-- ============================================================================",
      `-- ${fileNo}_degree_college_seed_${partNo}.sql  -  part ${p + 1} of ${totalFiles}`,
      "-- Generated in-browser from the OAMDC institute report by scripts/oamdc-scrape.js.",
      "-- Inserts each degree college as a NEW row with its OAMDC institute code.",
      "-- Untargeted ON CONFLICT DO NOTHING makes it re-runnable: a row colliding on",
      "-- EITHER unique key (college_code OR name/place/pincode) is skipped, never",
      "-- erroring or touching existing UGC rows. university_id resolves by name (033).",
      "-- ============================================================================",
      "",
    ];
    for (const c of part) {
      const uSub = c.university
        ? `(select id from public.college u where u.name = ${sqlLit(c.university)} and u.university_id = u.id limit 1)`
        : "null";
      const est = c.year && Number(c.year) >= 1800 ? Number(c.year) : "null";
      lines.push(
        `insert into public.college (college_code, name, place, address, district, state, pincode, established_in, ownership_type, university_id) values\n` +
          `  (${sqlLit(c.code)}, ${sqlLit(c.name)}, ${sqlLit(c.place)}, ${sqlLit(c.address)}, ${sqlLit(c.district)}, ${sqlLit("Andhra Pradesh")}, ${sqlLit(c.pincode)}, ${est}, ${sqlLit(c.ownership)}, ${uSub})\n` +
          `on conflict do nothing;`,
        "",
      );
    }
    files.push({ name: `${fileNo}_degree_college_seed_${partNo}.sql`, content: lines.join("\n") });
  }

  // ---- download each .sql file --------------------------------------------
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([f.content], { type: "text/sql;charset=utf-8" }));
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`✅ ${records.length} colleges → ${files.length} file(s): ${files.map((f) => f.name).join(", ")}`);
  console.log("Drop them into supabase/migrations/, run in order, and commit.");
  const linked = records.filter((r) => r.university).length;
  console.log(`Linked to a university: ${linked}/${records.length}.`);
  if (unknownU.size) {
    console.log("⚠ University names NOT matched to a 033 seed row (these colleges get NULL university — send me this list and I'll add them to 033):");
    [...unknownU].sort().forEach((u) => console.log("   -", u));
  }
})();
