#!/usr/bin/env python3
"""
VaultX dev runner.

NOTE: VaultX is a Vite + TanStack Start (React) app, not a Python service.
The Lovable preview already runs the app for you. If you want to run it
locally outside Lovable, install Node 20+ and Bun, then:

    bun install
    bun run dev

This script provides a small convenience: it starts `bun run dev` and
prints the local URL. The dev server listens on Vite's default port
(usually 5173) — there is no Python backend on :8000.
"""
from __future__ import annotations

import shutil
import subprocess
import sys


def main() -> int:
    if shutil.which("bun") is None:
        print("bun is not installed. See https://bun.sh", file=sys.stderr)
        return 1
    print("Starting VaultX dev server (Vite). Open the URL printed below.")
    print("Tip: this is a web app — there is no localhost:8000 backend.\n")
    try:
        return subprocess.call(["bun", "run", "dev"])
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
