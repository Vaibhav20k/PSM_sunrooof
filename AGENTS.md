# Working on this dashboard

Read README.md. Canonical frontend assets are in source/production/public; mirror index.html, app.js, pages.js and styles.css in source/local-preview after changes.

The calling workspace uses Today by default for follow-up/callback dates in IST. Raw, priority, Day 1–5 and combined tables show 10 matching records each, with View more for the full filtered list. The owner selector stays at the top. Preserve actual task-based Day 1–5 classification and distinct task IDs. Do not infer scheduled task days from lead counters.

Use Python for the local server. Run tests appropriate to the change. Private CRM snapshots, source exports, production seed files and credentials must remain outside version control. Synthetic fixtures are clearly marked and must never be represented as real CRM data.
