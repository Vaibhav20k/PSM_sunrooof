# SUNROOOF PSM dashboard

Vanilla HTML, CSS and JavaScript dashboard with a Python local server and an optional Node.js backend.

The calling workspace has raw, high / medium / low priority, Day 1–5 mandated-call, and combined tables. The owner selector stays at the top. A follow-up filter defaults to Today in IST, with complete calendar weeks, months, this year, all time, and custom date/time ranges. Leads use their follow-up timestamp; tasks use their callback due timestamp. Each table initially shows the earliest 10 matching records; View more reveals its full filtered list and Show top 10 collapses it. Undated records appear only under All time. Mandated days come from actual open RNR task subjects, preserving separate task IDs. Shared analytics tables and drill-downs also preview 10 rows with View more.

## Run locally

Requires Python 3.9 or later. The frontend needs no npm installation or build.

This public repository contains source code and synthetic test fixtures only. Private CRM snapshots, original exports, credentials and historical data are excluded. Obtain the authorized snapshot separately and put its JSON files under `data/snapshot/`:

- Required: `meta.json`, `leads.json`, `calls.json`, `rawquote.json`, `dealstage.json`.
- Calling workspace exports: `rawleads.json`, `priorityleads.json`, `mandateleads.json`.

Run `python start_dashboard.py --no-browser` and open http://localhost:5200/. On Windows, `START_DASHBOARD.cmd` launches it. Use `--port 5201` if needed. The local server uses saved data and does not sync or write to the CRM.

For an explicitly synthetic development preview, copy the JSON files from `fixtures/synthetic/` to `data/snapshot/`. These are examples, not the real CRM dataset or its three exported lists.

## Source layout

- `source/production/public/`: canonical frontend.
- `source/local-preview/`: mirrored frontend and legacy helpers.
- `tools/serve_offline.py`: current local snapshot server.
- `source/production/api/` and `lib/`: optional backend integrations.
- `api/openapi.json`, `database/`: API and database contracts.
- `tests/`: frontend logic, API contracts, and snapshot integration tests.

## Verification

Requires Node.js 22 or later for the JavaScript tests.

```sh
node --test tests/workspace-filter-context.test.cjs tests/workspace-pagination.test.cjs
node --experimental-vm-modules --test tests/api-contract.test.cjs
node --test source/production/test/schedule.test.js
```

With the authorized full snapshot installed:

```sh
node --test tests/handover.test.cjs tests/workspace-plain-table.test.cjs
python tools/test_offline.py
```

The handover tests and audit/import tools can also reference private exports or historical package manifests, which are intentionally distributed separately. `tools/validate_package.py` validates the original handover archive, not this source-only repository.

Server credentials must be configured separately using `.env.example`; never commit populated values. Pushing this repository does not deploy the app or enable CRM synchronization.

## Deploy the saved dashboard to Vercel

`python tools/prepare_vercel.py` creates a Build Output API artifact under `.vercel-snapshot/.vercel/output/`, using the authorized local `data/snapshot/`. It preserves all three exported calling lists and disables live synchronization. Generated files contain private CRM data and are ignored by Git.

Before uploading, create a separate Vercel project and enable **Vercel Authentication → All Deployments**, including its production domain. Link `.vercel-snapshot/` to that protected project, then run `vercel deploy --prebuilt --prod` from that directory. Verify unauthenticated requests to both the page and `/data/leads.json` require sign-in. Do not publish this artifact to an unprotected project.

The historical backend configuration in `source/production/` is a separate live integration and is not used for this saved-snapshot deployment. Updating GitHub alone does not upload a new private snapshot; regenerate and deploy it separately.
