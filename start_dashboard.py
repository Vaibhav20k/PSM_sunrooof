"""Portable launcher: Python 3.9+, no third-party packages."""
import argparse, sys, threading, webbrowser
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'tools'))
from serve_offline import Handler, ThreadingHTTPServer
if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port',type=int,default=5200)
    p.add_argument('--no-browser',action='store_true')
    args=p.parse_args()
    try: server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    except OSError as exc:
        sys.exit(f'Cannot start port {args.port}: {exc}. Try --port 5201.')
    url=f'http://localhost:{args.port}/'
    print(f'SUNROOOF dashboard: {url} (saved CRM snapshot; Ctrl+C to stop)',flush=True)
    if not args.no_browser:
        timer=threading.Timer(.5,webbrowser.open,args=(url,));timer.daemon=True;timer.start()
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
