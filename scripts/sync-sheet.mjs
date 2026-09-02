import { readFile, writeFile } from "node:fs/promises";

const spreadsheetId = "1udQZmSHEpLWuQJO2k0t4UvA3zU8fUFkvx_1lIfINId8";
const tabs = {
  "Chatbot Projects": { gid: 888299704, range: "A1:AS2000" },
  "Commercials": { gid: 1131928164, range: "A1:AI5000" },
  "Chatbot R&M": { gid: 559338930, range: "A1:AM5000" },
  "WA_Consumables": { gid: 172604510, range: "A1:G5000" },
  "RCS_Consumables": { gid: 269889098, range: "A1:G5000" }
};

async function fetchProtectedWorkbook() {
  const endpoint = process.env.BOTPLUS_ENDPOINT_URL;
  const token = process.env.BOTPLUS_SYNC_TOKEN;
  if (!endpoint || !token) return null;
  const url = new URL(endpoint);
  url.searchParams.set("feed", "1");
  url.searchParams.set("token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(330000) });
  if (!response.ok) throw new Error(`protected endpoint returned ${response.status}`);
  const payload = await response.json();
  if (!payload || payload.error || !payload.sheets) throw new Error(payload?.error || "protected endpoint returned invalid data");
  return payload;
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  while (rows.length && rows.at(-1).every(v => v === "")) rows.pop();
  return rows;
}

async function fetchCsv(name, { gid, range }) {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&headers=0&gid=${gid}&range=${encodeURIComponent(range)}`,
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`
  ];
  let lastError;
  for (let attempt = 0; attempt < urls.length; attempt++) {
    try {
      const response = await fetch(urls[attempt], { signal: AbortSignal.timeout(180000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const rows = parseCsv(await response.text());
      if (rows.length < 2) throw new Error("sheet returned no data rows");
      console.log(`${name}: ${rows.length - 1} data rows`);
      return rows;
    } catch (error) {
      lastError = error;
      console.warn(`${name}: source ${attempt + 1} failed (${error.message})`);
    }
  }
  throw lastError;
}

const currentText = await readFile("data.js", "utf8");
const currentJson = currentText.replace(/^\s*window\.EMBEDDED_SHEETS_CURRENT\s*=\s*/, "").replace(/;\s*$/, "");
const workbook = JSON.parse(currentJson);
let failures = 0;
let protectedWorkbook = null;
try {
  protectedWorkbook = await fetchProtectedWorkbook();
} catch (error) {
  console.warn(`Protected endpoint failed (${error.message}); trying bounded Google Sheet feeds.`);
}
if (protectedWorkbook) {
  for (const name of Object.keys(tabs)) {
    const rows = protectedWorkbook.sheets[name];
    if (!Array.isArray(rows) || rows.length < 2) throw new Error(`${name}: protected endpoint returned no data rows`);
    workbook[name] = rows;
    console.log(`${name}: ${rows.length - 1} data rows`);
  }
} else {
  const results = await Promise.allSettled(
    Object.entries(tabs).map(async ([name, config]) => [name, await fetchCsv(name, config)])
  );
  results.forEach((result, index) => {
    const name = Object.keys(tabs)[index];
    if (result.status === "fulfilled") workbook[result.value[0]] = result.value[1];
    else {
      failures++;
      console.error(`${name}: keeping the previous snapshot (${result.reason.message})`);
    }
  });
}

workbook.__meta = {
  spreadsheetId,
  refreshedAt: new Date().toISOString(),
  failedTabs: failures
};

await writeFile("data.js", `window.EMBEDDED_SHEETS_CURRENT = ${JSON.stringify(workbook)};\n`, "utf8");
// Keep publishing successful tabs and the last-known-good rows for any tab
// that is temporarily unavailable. A partial source outage must not stop every
// future dashboard refresh.
