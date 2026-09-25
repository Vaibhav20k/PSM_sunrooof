-- Mirrors lib/store.js:init; no secrets or CRM data.
CREATE TABLE IF NOT EXISTS psm_dashboard_sync_v1 (
 id int PRIMARY KEY,
 manifest jsonb,
 status jsonb NOT NULL DEFAULT '{}',
 lease_until timestamptz,
 last_started timestamptz
);
ALTER TABLE psm_dashboard_sync_v1 ENABLE ROW LEVEL SECURITY;
INSERT INTO psm_dashboard_sync_v1(id) VALUES(1) ON CONFLICT DO NOTHING;
