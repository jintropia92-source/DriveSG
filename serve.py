#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

HERE = Path(__file__).resolve().parent
os.chdir(HERE)

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

port = 8080
while port < 8090:
    try:
        print(f'DriveSG: http://localhost:{port}')
        ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
        break
    except OSError:
        port += 1
