"""Async client used by the Streamlit MCP inspector."""

from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from mcp import StdioServerParameters
from mcp.client import Client

ROOT = Path(__file__).resolve().parents[1]


@dataclass
class Exchange:
    request: dict
    response: dict


def _model(value: Any) -> dict:
    if hasattr(value, "model_dump"):
        return value.model_dump(by_alias=True, exclude_none=True)
    return value if isinstance(value, dict) else {"value": value}


def _server(source: str, network_url: str):
    if source == "stdio":
        return StdioServerParameters(command=sys.executable, args=["-m", "clinical_mcp.server"], cwd=str(ROOT))
    return network_url


async def list_tools(source: str, network_url: str) -> tuple[list[dict], Exchange]:
    request = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    if source == "evidence":
        response = await _evidence_rpc(network_url, request)
        return response.get("result", {}).get("tools", []), Exchange(request, response)
    async with Client(_server(source, network_url)) as client:
        result = await asyncio.wait_for(client.list_tools(), timeout=12)
    data = _model(result)
    return data.get("tools", []), Exchange(request, {"jsonrpc": "2.0", "id": 1, "result": data})


async def call_tool(source: str, network_url: str, name: str, arguments: dict) -> tuple[dict, Exchange]:
    request = {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
               "params": {"name": name, "arguments": arguments}}
    if source == "evidence":
        response = await _evidence_rpc(network_url, request)
        result = response.get("result", {})
        if response.get("error"):
            raise RuntimeError(response["error"].get("message", "JSON-RPC error"))
        if result.get("isError") or result.get("is_error"):
            raise RuntimeError(_content_text(result) or "MCP tool error")
        return _structured(result), Exchange(request, response)
    last_error = None
    for attempt in range(3):
        try:
            async with Client(_server(source, network_url)) as client:
                result = await asyncio.wait_for(client.call_tool(name, arguments), timeout=12)
            data = _model(result)
            if data.get("isError") or data.get("is_error"):
                raise RuntimeError(_content_text(data) or "MCP tool error")
            return _structured(data), Exchange(request, {"jsonrpc": "2.0", "id": 2, "result": data})
        except Exception as exc:  # connection retry is deliberate at UI boundary
            last_error = exc
            if attempt < 2:
                await asyncio.sleep(0.35 * (attempt + 1))
    raise RuntimeError(f"MCP недоступен после 3 попыток: {last_error}")


async def _evidence_rpc(url: str, payload: dict) -> dict:
    def send() -> dict:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        req = Request(url, data=json.dumps(payload).encode("utf-8"), method="POST", headers=headers)
        try:
            with urlopen(req, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError) as exc:
            raise RuntimeError(f"Локальный провайдер RxNorm/DailyMed недоступен: {exc}") from exc
    return await asyncio.to_thread(send)


def _structured(result: dict) -> dict:
    structured = result.get("structuredContent") or result.get("structured_content")
    if isinstance(structured, dict):
        return structured
    text = _content_text(result)
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else {"value": value}
    except (json.JSONDecodeError, TypeError):
        return {"text": text}


def _content_text(result: dict) -> str:
    return "\n".join(item.get("text", "") for item in result.get("content", [])
                     if isinstance(item, dict) and item.get("type") == "text")
