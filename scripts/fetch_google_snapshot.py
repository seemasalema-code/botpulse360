#!/usr/bin/env python3
"""Download dashboard tabs independently and assemble a validated XLSX source."""
from __future__ import annotations
import argparse, csv, io, time, urllib.parse, urllib.request
from pathlib import Path
from openpyxl import Workbook

SHEET_ID = "1udQZmSHEpLWuQJO2k0t4UvA3zU8fUFkvx_1lIfINId8"
TABS = {
    "Chatbot Projects": (888299704, "A1:AS2500"),
    "Chatbot R&M": (559338930, "A1:AM12000"),
    "WA_Consumables": (172604510, "A1:Z5000"),
    "RCS_Consumables": (269889098, "A1:Z8000"),
}

def download_tab(gid: int, cell_range: str, attempts: int = 6) -> list[list[str]]:
    query = urllib.parse.urlencode({"format": "csv", "gid": gid, "range": cell_range})
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?{query}"
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "dashboard-snapshot-publisher/1.0"})
            with urllib.request.urlopen(request, timeout=150) as response:
                body = response.read().decode("utf-8-sig")
            rows = list(csv.reader(io.StringIO(body)))
            if len(rows) < 2:
                raise RuntimeError(f"only {len(rows)} row(s) returned")
            return rows
        except Exception as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(min(60, 5 * 2 ** (attempt - 1)))
    raise RuntimeError(f"Google export failed after {attempts} attempts: {last_error}")

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    workbook = Workbook()
    workbook.remove(workbook.active)
    for title, (gid, cell_range) in TABS.items():
        rows = download_tab(gid, cell_range)
        sheet = workbook.create_sheet(title)
        for row in rows:
            sheet.append(row)
        print(f"{title}: {len(rows) - 1:,} data rows")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp.xlsx")
    workbook.save(temporary)
    temporary.replace(args.output)

if __name__ == "__main__":
    main()
