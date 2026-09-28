#!/usr/bin/env python3
"""Build the shared dashboard snapshot from an exported Google workbook."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path

from openpyxl import load_workbook


TAB_RULES = {
    "Chatbot Projects": {"headers": {"Client", "Chatbot"}, "max_rows": 10000},
    "Chatbot R&M": {"headers": {"Chatbot", "Month"}, "max_rows": 30000},
    "WA_Consumables": {"headers": {"Client", "Month", "Revenue", "Cost"}, "max_rows": 30000},
    "RCS_Consumables": {"headers": {"Client", "Month", "Revenue", "Cost"}, "max_rows": 30000},
}


def serialise(value):
    if value is None:
        return ""
    if isinstance(value, (dt.datetime, dt.date)):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def trim_sheet(ws, max_rows):
    rows = []
    trailing_empty = 0
    for row_number, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if row_number > max_rows:
            raise ValueError(f"{ws.title} exceeds the safe limit of {max_rows:,} populated/formula rows")
        values = [serialise(value) for value in row]
        while values and values[-1] == "":
            values.pop()
        if not values:
            trailing_empty += 1
            if trailing_empty >= 100:
                break
            rows.append([])
            continue
        trailing_empty = 0
        rows.append(values)
    while rows and not rows[-1]:
        rows.pop()
    return rows


def validate_headers(tab, rows, required):
    for row in rows[:10]:
        values = {str(value).strip() for value in row if value not in (None, "")}
        if required.issubset(values):
            return
    raise ValueError(f"{tab} is missing required headers: {', '.join(sorted(required))}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data.js"))
    args = parser.parse_args()

    workbook = load_workbook(args.workbook, read_only=True, data_only=True)
    missing = [tab for tab in TAB_RULES if tab not in workbook.sheetnames]
    if missing:
        raise ValueError("Workbook is missing required tabs: " + ", ".join(missing))

    snapshot = {}
    for tab, rule in TAB_RULES.items():
        rows = trim_sheet(workbook[tab], rule["max_rows"])
        validate_headers(tab, rows, rule["headers"])
        snapshot[tab] = rows

    raw = args.workbook.read_bytes()
    snapshot["__meta"] = {
        "sourceFile": args.workbook.name,
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "refreshedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "mode": "validated-workbook-snapshot",
    }
    payload = "window.EMBEDDED_SHEETS_CURRENT = " + json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + ";\n"
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(payload, encoding="utf-8")
    temporary.replace(args.output)
    print(json.dumps({tab: len(snapshot[tab]) for tab in TAB_RULES}, indent=2))


if __name__ == "__main__":
    main()
