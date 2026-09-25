# SUNROOOF PSM — production dashboard

Canonical URL: https://sunrooof-psm-dashboard.vercel.app/

This directory deploys to the existing project ID in `.vercel/project.json`. That Vercel project is currently named `sunrooof-daily-leaderboard`; do not relink by dashboard name without checking the canonical alias.

## Live refresh

- `POST /sync` starts a complete, read-only extraction from Zoho CRM organisation 60038775297.
- `GET /sync/status` reports progress, completion and errors.
- A production watchdog invokes `/api/sync` every minute using `CRON_SECRET`. It starts a refresh only when the last completed snapshot is at least 15 minutes old. Failures retry after a two-minute cooldown. An expired job lease is recovered automatically; dashboard status polling provides a second recovery trigger.
- The previous complete snapshot remains visible until all new data is uploaded.
- Converted leads are fetched separately. Calls preserve Call Owner attribution.
- Current opportunity stages and Raw Quote history are refreshed in the same run.
- Private Supabase Storage holds snapshots; short-lived signed URLs deliver them. The current and previous snapshots are retained.
- A dedicated Postgres row provides the job lease, status and atomic snapshot pointer. Its table has RLS enabled and is accessed only by the server.

## Configuration

Server-only production variables: `PSM_CRM_CLIENT_ID`, `PSM_CRM_CLIENT_SECRET`, `PSM_CRM_REFRESH_TOKEN`, `POSTGRES_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `PSM_DEPLOY_TOKEN`.

The protected bootstrap endpoint initializes the dedicated table and private bucket and uploads the included initial snapshot only when no snapshot exists. It does not replace an existing manifest.

## Deployment

Run `vercel deploy --prod --yes`. Verify the new deployment, then assign the canonical URL using `vercel alias set <deployment-url> sunrooof-psm-dashboard.vercel.app` if the project rename prevents automatic assignment.

Secrets and local scripts are excluded from deployment. The public build contains only the four dashboard assets. No CRM writes are performed.
