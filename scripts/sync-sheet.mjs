import { readFile, writeFile } from "node:fs/promises";

const spreadsheetId = "1udQZmSHEpLWuQJO2k0t4UvA3zU8fUFkvx_1lIfINId8";
const tabs = {
  "Chatbot Projects": 888299704,
  "Commercials": 1131928164,
  "Chatbot R&M": 559338930,
  "WA_Consumables": 172604510,
  "RCS_Consumables": 269889098
};

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

async function fetchCsv(name, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(240000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const rows = parseCsv(await response.text());
      if (rows.length < 2) throw new Error("sheet returned no data rows");
      console.log(`${name}: ${rows.length - 1} data rows`);
      return rows;
    } catch (error) {
      lastError = error;
      console.warn(`${name}: attempt ${attempt} failed (${error.message})`);
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 15000));
    }
  }
  throw lastError;
}

const currentText = await readFile("data.js", "utf8");
const currentJson = currentText.replace(/^\s*window\.EMBEDDED_SHEETS_CURRENT\s*=\s*/, "").replace(/;\s*$/, "");
const workbook = JSON.parse(currentJson);
let failures = 0;

for (const [name, gid] of Object.entries(tabs)) {
  try {
    workbook[name] = await fetchCsv(name, gid);
  } catch (error) {
    failures++;
    console.error(`${name}: keeping the previous snapshot (${error.message})`);
  }
}

workbook.__meta = {
  spreadsheetId,
  refreshedAt: new Date().toISOString(),
  failedTabs: failures
};

await writeFile("data.js", `window.EMBEDDED_SHEETS_CURRENT = ${JSON.stringify(workbook)};\n`, "utf8");
if (failures) process.exitCode = 1;
