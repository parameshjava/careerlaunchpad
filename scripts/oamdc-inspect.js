/* Diagnostic — run on the MAIN institute-report LIST page (DevTools console).
 * Prints how each institute-code cell links to its detail view so I can build a
 * loop scraper. Paste the whole console output back. Nothing is downloaded. */
(() => {
  const table = [...document.querySelectorAll("table")]
    .map((t) => ({ t, n: t.querySelectorAll("tr").length }))
    .sort((a, b) => b.n - a.n)[0]?.t;
  if (!table) return console.log("No table found. Are you on the list page?");

  const bodyRows = [...table.querySelectorAll("tbody tr, tr")].filter(
    (tr) => tr.querySelectorAll("td").length,
  );
  console.log("Address bar:", location.href);
  console.log("Total data rows on this page:", bodyRows.length);
  console.log("Header cells:", [...table.querySelectorAll("th")].map((th) => th.innerText.trim()));

  // Show the first 3 rows: each cell's text + any link/onclick on the row.
  bodyRows.slice(0, 3).forEach((tr, i) => {
    const cells = [...tr.querySelectorAll("td")].map((td) => td.innerText.trim());
    const anchors = [...tr.querySelectorAll("a")].map((a) => ({
      text: a.innerText.trim(),
      href: a.getAttribute("href"),
      onclick: a.getAttribute("onclick"),
    }));
    const clickable = [...tr.querySelectorAll("[onclick]")].map((el) => el.getAttribute("onclick"));
    console.log(`--- row ${i + 1} ---`, { cells, anchors, clickable, rowOnclick: tr.getAttribute("onclick") });
  });

  // Is there a "show entries" / page-size control we can max out?
  console.log(
    "Page-size selects:",
    [...document.querySelectorAll("select")].map((s) => ({
      id: s.id,
      name: s.name,
      options: [...s.options].map((o) => o.value),
    })),
  );
})();
