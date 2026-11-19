"""Network MCP provider with Streamable HTTP and optional legacy SSE."""

from __future__ import annotations

import argparse

from .server import mcp


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--transport", choices=("streamable-http", "sse"), default="streamable-http")
    args = parser.parse_args()
    if args.transport == "sse":
        mcp.run(transport="sse", host=args.host, port=args.port,
                sse_path="/sse", message_path="/messages")
    else:
        mcp.run(transport="streamable-http", host=args.host, port=args.port,
                stateless_http=True, json_response=True)


if __name__ == "__main__":
    main()
