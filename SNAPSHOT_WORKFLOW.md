# Dashboard data publication

Both dashboards use the same validated `data.js` snapshot. They do not query Google Sheets when a manager opens the page.

## Weekly update

1. In Google Sheets, choose **File → Download → Microsoft Excel (.xlsx)**.
2. Attach the workbook to the scheduled Friday Codex reminder.
3. Codex replaces `source/dashboard-source.xlsx` and publishes it.
4. GitHub validates the required tabs and headers, creates `data.js`, and deploys BotPulse.
5. CPaaS reads the same published snapshot, so both dashboards remain aligned.

Required tabs: `Chatbot Projects`, `Chatbot R&M`, `WA_Consumables`, and `RCS_Consumables`.

The publisher trims unused rows, preserves `DD/MM/YYYY`, rejects missing headers, refuses unexpectedly oversized tabs, writes the snapshot atomically, and retains Git history for rollback.
