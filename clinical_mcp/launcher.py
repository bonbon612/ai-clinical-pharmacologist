"""Start the network MCP provider and Streamlit UI with one command."""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    network = subprocess.Popen([sys.executable, "-m", "clinical_mcp.network_server"], cwd=root)
    try:
        time.sleep(1)
        raise SystemExit(subprocess.call([sys.executable, "-m", "streamlit", "run",
                                          "streamlit_app.py", "--server.headless=true"], cwd=root))
    finally:
        network.terminate()
        try:
            network.wait(timeout=3)
        except subprocess.TimeoutExpired:
            network.kill()


if __name__ == "__main__":
    main()
