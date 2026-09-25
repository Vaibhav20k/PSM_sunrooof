#!/usr/bin/env python3
"""Serve preserved frontend + bundled snapshot on loopback without cloud access."""
import argparse,json,mimetypes
from pathlib import Path
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'source/production/public'
DATA=ROOT/'data/snapshot'
class Handler(BaseHTTPRequestHandler):
    def send_bytes(self,status,body,mime='application/json'):
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        if self.command!='HEAD': self.wfile.write(body)
    def reply(self,status,obj): self.send_bytes(status,json.dumps(obj).encode())
    def do_GET(self):
        path=urlparse(self.path).path
        if path == '/data/meta.json':
            meta=json.loads((DATA/'meta.json').read_text())
            meta['rawLeadExport']=(DATA/'rawleads.json').is_file()
            meta['priorityLeadExport']=(DATA/'priorityleads.json').is_file()
            meta['mandateLeadExport']=(DATA/'mandateleads.json').is_file()
            return self.reply(200,meta)
        if path in ['/sync/status','/api/status']:
            meta=json.loads((DATA/'meta.json').read_text())
            return self.reply(200,{'state':'complete','message':'OFFLINE â€” bundled saved snapshot; CRM sync is disabled','automaticSync':False,'lastSuccess':meta.get('generatedAt'),'nextRefreshAt':None})
        if path in ['/','/index.html','/app.js','/pages.js','/styles.css']:
            p=PUBLIC/('index.html' if path=='/' else path[1:])
        elif path in ['/data/'+x+'.json' for x in ['meta','leads','calls','rawquote','dealstage','rawleads','priorityleads','mandateleads']]:
            p=DATA/path.split('/')[-1]
        else: return self.reply(404,{'error':'Not found'})
        if not p.is_file(): return self.reply(503,{'error':'Required packaged file unavailable'})
        return self.send_bytes(200,p.read_bytes(),mimetypes.guess_type(str(p))[0] or 'application/octet-stream')
    def do_HEAD(self): self.do_GET()
    def do_POST(self):
        if urlparse(self.path).path in ['/sync','/api/sync']:
            return self.reply(409,{'error':'Offline snapshot only. Configure the live backend for CRM sync.'})
        self.reply(404,{'error':'Not found'})
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=5200)
    args=parser.parse_args()
    print(f'Offline SUNROOOF dashboard: http://localhost:{args.port}/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
