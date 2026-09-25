from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path
import os
os.chdir(Path(__file__).parent)
class Handler(SimpleHTTPRequestHandler):
    def proxy(self):
        payload = self.rfile.read(int(self.headers.get('Content-Length', 0))) if self.command == 'POST' else None
        req = Request('https://sunrooof-psm-dashboard.vercel.app' + self.path, data=payload, method=self.command)
        try:
            response = urlopen(req, timeout=120)
        except HTTPError as error:
            response = error
        except Exception:
            self.send_error(502, 'Cloud connection unavailable')
            return
        with response:
            self.send_response(response.status)
            self.send_header('Content-Type', response.headers.get('Content-Type', 'application/octet-stream'))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk: break
                self.wfile.write(chunk)
    def do_GET(self):
        if self.path.startswith(('/data/', '/sync', '/api/')): self.proxy()
        elif self.path.split('?')[0] in ('/', '/index.html', '/styles.css', '/app.js', '/pages.js'): super().do_GET()
        else: self.send_error(404)
    def do_POST(self):
        if self.path.split('?')[0] == '/sync': self.proxy()
        else: self.send_error(404)
ThreadingHTTPServer(('127.0.0.1', 5198), Handler).serve_forever()
