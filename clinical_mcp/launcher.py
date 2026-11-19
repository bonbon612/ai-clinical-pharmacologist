"""Start the network MCP provider and Streamlit UI with one command."""

from __future__ import annotations

import subprocess
import shutil
import sys
import time
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    node = shutil.which("node")
    if not node:
        raise SystemExit("Для провайдера RxNorm/DailyMed требуется Node.js 22+")
    network = subprocess.Popen([sys.executable, "-m", "clinical_mcp.network_server"], cwd=root)
    evidence = subprocess.Popen([node, "local-server.mjs"], cwd=root)
    try:
        time.sleep(1)
        raise SystemExit(subprocess.call([sys.executable, "-m", "streamlit", "run",
                                          "streamlit_app.py", "--server.headless=true"], cwd=root))
    finally:
        for process in (network, evidence):
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
