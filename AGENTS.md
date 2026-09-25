# Working on this dashboard

Read README.md. Canonical frontend assets are in source/production/public; mirror index.html, app.js, pages.js and styles.css in source/local-preview after changes.

The current calling workspace is one plain table containing raw leads, priority leads and mandated calls, with the owner selector at the top. Preserve actual task-based Day 1–5 classification and distinct task IDs. Do not infer scheduled task days from lead counters.

Use Python for the local server. Run tests appropriate to the change. Private CRM snapshots, source exports, production seed files and credentials must remain outside version control. Synthetic fixtures are clearly marked and must never be represented as real CRM data.
