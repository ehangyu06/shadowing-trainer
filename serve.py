#!/usr/bin/env python3
"""Tiny static server for Shadowing Trainer. Independent of any other app."""

from __future__ import annotations

import argparse
import cgi
import json
import os
import posixpath
import re
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
VIDEOS_DIR = os.path.join(ROOT, "videos")
CLIPS_PATH = os.path.join(ROOT, "data", "clips.json")
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm"}


def local_ips():
    ips = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except OSError:
        pass
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        if ip not in ips and not ip.startswith("127."):
            ips.append(ip)
    except OSError:
        pass
    return ips


def safe_filename(name: str) -> str:
    base = os.path.basename(unquote(name or "video.mp4"))
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base)
    return base or "video.mp4"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        if self.path.endswith((".html", ".js", ".css", ".json", ".webmanifest")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = posixpath.normpath(unquote(self.path.split("?", 1)[0]))
        if path == "/api/videos":
            self.send_json(list_videos())
            return
        if path == "/api/clips":
            self.send_json(read_clips())
            return
        super().do_GET()

    def do_PUT(self):
        path = posixpath.normpath(unquote(self.path.split("?", 1)[0]))
        if path != "/api/clips":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            clips = json.loads(raw.decode("utf-8"))
            if not isinstance(clips, list):
                raise ValueError("clips must be a list")
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_error(400, str(exc))
            return
        os.makedirs(os.path.dirname(CLIPS_PATH), exist_ok=True)
        with open(CLIPS_PATH, "w", encoding="utf-8") as fh:
            json.dump(clips, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        self.send_json({"ok": True, "count": len(clips)})

    def do_POST(self):
        path = posixpath.normpath(unquote(self.path.split("?", 1)[0]))
        if path != "/api/upload":
            self.send_error(404)
            return
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            },
        )
        item = form["file"] if "file" in form else None
        if item is None or not getattr(item, "file", None):
            self.send_error(400, "missing file")
            return
        filename = safe_filename(getattr(item, "filename", "") or "video.mp4")
        ext = os.path.splitext(filename)[1].lower()
        if ext not in VIDEO_EXTS:
            self.send_error(400, "unsupported video type")
            return
        os.makedirs(VIDEOS_DIR, exist_ok=True)
        dest = os.path.join(VIDEOS_DIR, filename)
        with open(dest, "wb") as out:
            while True:
                chunk = item.file.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        self.send_json({"ok": True, "id": os.path.splitext(filename)[0], "filename": filename, "title": os.path.splitext(filename)[0]})


def list_videos():
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    items = []
    for name in sorted(os.listdir(VIDEOS_DIR)):
        ext = os.path.splitext(name)[1].lower()
        if ext in VIDEO_EXTS:
            stem = os.path.splitext(name)[0]
            vid = re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_") or "video"
            items.append({
                "id": vid,
                "title": stem,
                "filename": name,
            })
    return items


def read_clips():
    if not os.path.exists(CLIPS_PATH):
        return []
    with open(CLIPS_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def main():
    parser = argparse.ArgumentParser(description="Shadowing Trainer local server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    os.chdir(ROOT)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print("Shadowing Trainer", flush=True)
    print("Open on this computer: http://127.0.0.1:%s/" % args.port, flush=True)
    for ip in local_ips():
        print("Open on iPad (same Wi-Fi): http://%s:%s/" % (ip, args.port), flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
