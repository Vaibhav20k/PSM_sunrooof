#!/usr/bin/env python3
"""Verify packaged hashes and positional CRM snapshot contracts; no network needed."""
import hashlib,json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def validate():
    manifest=R/'provenance/FILE_MANIFEST.json'
    checked=0
    if manifest.exists():
        for row in json.loads(manifest.read_text(encoding='utf-8')):
            p=R/row['file']
            assert p.is_file(),f'Missing: {row["file"]}'
            assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256'],f'Changed: {row["file"]}'
            checked+=1
    counts={}
    for folder in ['data/snapshot','source/production/lib/seed']:
        base=R/folder;meta=json.loads((base/'meta.json').read_text(encoding='utf-8'))
        for name,width,countkey in [('leads',41,'leadCount'),('calls',12,'callCount')]:
            rows=json.loads((base/(name+'.json')).read_text(encoding='utf-8'))
            assert rows and all(isinstance(r,list) and len(r)==width for r in rows),(folder,name,'row width')
            ids=[r[0] for r in rows]
            assert all(isinstance(x,str) and x for x in ids),(folder,name,'IDs must be strings')
            assert len(set(ids))==len(ids),(folder,name,'duplicate IDs')
            assert len(rows)==meta[countkey],(folder,name,'metadata count mismatch')
            if name=='leads':assert all(isinstance(r[27],bool) for r in rows),'Converted must be bool'
            counts[folder+'/'+name]=len(rows)
        assert isinstance(json.loads((base/'rawquote.json').read_text(encoding='utf-8')),list)
        assert isinstance(json.loads((base/'dealstage.json').read_text(encoding='utf-8')),dict)
    print(json.dumps({'status':'passed','integrity_files_checked':checked,'snapshot_counts':counts},indent=2))
if __name__=='__main__':validate()
