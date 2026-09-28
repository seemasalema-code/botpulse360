# Dashboard data publication

Both dashboards use the same validated `data.js` snapshot. They do not query Google Sheets when a manager opens the page.

## Automatic update

GitHub refreshes the four source tabs automatically every Wednesday and Friday at
3:00 PM IST. Each tab is downloaded independently with bounded ranges, timeouts,
exponential retries and validation. GitHub creates `data.js` only after every tab
passes reconciliation, then deploys BotPulse. CPaaS reads the same published
snapshot, so both dashboards remain aligned.

If Google is temporarily unavailable, the job fails safely and both dashboards
continue displaying the previous verified snapshot. No partial or empty snapshot
can replace the working data.

Required tabs: `Chatbot Projects`, `Chatbot R&M`, `WA_Consumables`, and `RCS_Consumables`.

The publisher trims unused rows, preserves `DD/MM/YYYY`, rejects missing headers, refuses unexpectedly oversized tabs, writes the snapshot atomically, and retains Git history for rollback.

## Stability controls

- Raw workbook data stays in `source/dashboard-source.xlsx`; dashboards read only the generated snapshot.
- R&M, WA and RCS ledgers are partitioned by financial year and month under `data/partitions/`.
- Financial-year archives are compressed under `data/archive/`.
- `snapshot-report.json` compares row counts and revenue totals with the prior publication.
- Publication stops if rows or revenue unexpectedly fall by more than 40%. An approved exception requires `ALLOW_SNAPSHOT_ANOMALY=1`.
- A warning is recorded when a tab reaches 80% of its configured safety limit.
