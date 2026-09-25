"""Prepare a Vercel Build Output API deployment of the authorized local snapshot.

Output contains private CRM data. Enable Vercel Authentication for ALL deployments
on the destination project before uploading. Output must never be committed.
"""
import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = ("meta", "leads", "calls", "rawquote", "dealstage")
OPTIONAL = {"rawleads": "rawLeadExport", "priorityleads": "priorityLeadExport", "mandateleads": "mandateLeadExport"}
ASSETS = ("index.html", "app.js", "pages.js", "styles.css")

def prepare(snapshot, destination):
    snapshot, destination = Path(snapshot), Path(destination)
    for name in REQUIRED:
        if not (snapshot / (name + ".json")).is_file():
            raise FileNotFoundError(f"Missing authorized snapshot file: {name}.json")
    output = destination / ".vercel" / "output"
    if output.exists():
        raise FileExistsError(f"Build output already exists: {output}. Use a fresh destination.")
    static = output / "static"
    (static / "data").mkdir(parents=True)
    for name in ASSETS:
        shutil.copyfile(ROOT / "source" / "production" / "public" / name, static / name)
    meta = json.loads((snapshot / "meta.json").read_text(encoding="utf-8"))
    for name, flag in OPTIONAL.items():
        meta[flag] = (snapshot / (name + ".json")).is_file()
    (static / "data" / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    for name in (*REQUIRED[1:], *OPTIONAL):
        path = snapshot / (name + ".json")
        if path.is_file():
            shutil.copyfile(path, static / "data" / path.name)
    status = {"state": "complete", "message": "Saved CRM snapshot; live synchronization is disabled", "automaticSync": False, "lastSuccess": meta.get("generatedAt"), "nextRefreshAt": None}
    (static / "offline-status.json").write_text(json.dumps(status), encoding="utf-8")
    (static / "offline-sync.json").write_text(json.dumps({"error": "Saved snapshot only. Live CRM synchronization is disabled."}), encoding="utf-8")
    no_store = {"Cache-Control": "private, no-store"}
    config = {"version": 3, "routes": [
        {"src": "/(?:sync/status|api/status)", "dest": "/offline-status.json", "headers": no_store},
        {"src": "/(?:sync|api/sync)", "dest": "/offline-sync.json", "status": 409, "headers": no_store},
        {"src": "/data/.*", "headers": no_store, "continue": True},
        {"handle": "filesystem"}
    ]}
    (output / "config.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    return output

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=ROOT / "data" / "snapshot")
    parser.add_argument("--destination", type=Path, default=ROOT / ".vercel-snapshot")
    args = parser.parse_args()
    output = prepare(args.snapshot, args.destination)
    print(f"Prepared private snapshot deployment: {output}")
    print("Enable Vercel Authentication for ALL deployments before uploading.")
