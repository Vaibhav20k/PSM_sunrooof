#!/usr/bin/env python3
"""Local HTTP integration checks; starts/stops its own temporary server."""
import subprocess,sys,socket,time,json,hashlib
from pathlib import Path
from urllib.request import urlopen,Request
from urllib.error import HTTPError
R=Path(__file__).resolve().parents[1]
with socket.socket() as s:
    s.bind(('127.0.0.1',0));port=s.getsockname()[1]
p=subprocess.Popen([sys.executable,str(R/'tools/serve_offline.py'),'--port',str(port)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
base=f'http://127.0.0.1:{port}'
try:
    for _ in range(100):
        try:
            with urlopen(base+'/',timeout=1) as r:assert r.status==200
            break
        except OSError:
            if p.poll() is not None:raise RuntimeError('Offline server exited')
            time.sleep(.05)
    else:raise RuntimeError('Offline server did not start')
    checked=[]
    for url,rel in [('/', 'source/production/public/index.html'),('/app.js','source/production/public/app.js'),('/pages.js','source/production/public/pages.js'),('/styles.css','source/production/public/styles.css')]+[('/data/'+n+'.json','data/snapshot/'+n+'.json') for n in ['leads','calls','rawquote','dealstage','rawleads','priorityleads','mandateleads']]:
        with urlopen(base+url,timeout=20) as r:body=r.read()
        assert hashlib.sha256(body).digest()==hashlib.sha256((R/rel).read_bytes()).digest(),url
        checked.append(url)
    with urlopen(base+'/data/meta.json') as response: meta=json.load(response)
    saved=json.loads((R/'data/snapshot/meta.json').read_text())
    assert all(meta[k]==v for k,v in saved.items())
    assert all(meta[k] is True for k in ['rawLeadExport','priorityLeadExport','mandateLeadExport'])
    checked.append('/data/meta.json')
    with urlopen(base+'/sync/status') as r:status=json.load(r)
    assert status['automaticSync'] is False and 'OFFLINE' in status['message']
    try:urlopen(Request(base+'/sync',method='POST'))
    except HTTPError as e:assert e.code==409
    else:raise AssertionError('Offline sync must reject')
    try:urlopen(base+'/.env')
    except HTTPError as e:assert e.code==404
    else:raise AssertionError('Unexpected file access')
    print(json.dumps({'status':'passed','assets_and_datasets':checked,'offline_status':'passed','sync_rejection':'passed','path_allowlist':'passed'},indent=2))
finally:
    p.terminate()
    try:p.wait(timeout=5)
    except subprocess.TimeoutExpired:p.kill();p.wait()
