"""Web UI for three MCP providers and the JSON-RPC inspector."""

from __future__ import annotations

import asyncio
import json
import os

import streamlit as st

from clinical_mcp.client import call_tool, list_tools
from clinical_mcp.sanitizer import default_for, sanitize

st.set_page_config(page_title="MCP · Клинический фармаколог", page_icon="⚕", layout="wide")
st.title("ИИ клинический фармаколог · MCP")
st.caption("Калькуляторы и поиск лекарств. Без LLM.")

SOURCES = {
    "Локальный · stdio": ("stdio", ""),
    "Сетевой · Streamable HTTP": ("network", os.getenv("MCP_NETWORK_URL", "http://127.0.0.1:8000/mcp")),
    "RxNorm + DailyMed · локальный": ("evidence", os.getenv(
        "MCP_EVIDENCE_URL", "http://127.0.0.1:4173/api/mcp")),
}
SMART_DEFAULTS = {
    "weight_kg": 70.0,
    "height_cm": 175.0,
    "creatinine_mg_dl": 1.0,
    "age_years": 60,
    "eye": 4,
    "verbal": 5,
    "motor": 6,
    "page": 1,
}

source_label = st.sidebar.selectbox("Источник", list(SOURCES))
source, default_url = SOURCES[source_label]
url = default_url
if source != "stdio":
    url = st.sidebar.text_input("MCP URL", default_url)

if st.sidebar.button("Обновить инструменты", width="stretch") or "tools_key" not in st.session_state:
    try:
        tools, exchange = asyncio.run(list_tools(source, url))
        st.session_state.tools_key = (source, url)
        st.session_state.tools = tools
        st.session_state.list_exchange = exchange
    except Exception as exc:
        st.error(str(exc))
        st.stop()

if st.session_state.get("tools_key") != (source, url):
    try:
        tools, exchange = asyncio.run(list_tools(source, url))
        st.session_state.tools_key = (source, url)
        st.session_state.tools = tools
        st.session_state.list_exchange = exchange
    except Exception as exc:
        st.error(str(exc))
        st.stop()

tools = st.session_state.get("tools", [])
filter_text = st.text_input("Поиск", placeholder="рСКФ, препарат, Глазго…")
visible = [tool for tool in tools if filter_text.lower() in
           f"{tool.get('name', '')} {tool.get('description', '')}".lower()]
if not visible:
    st.info("Инструменты не найдены")
    st.stop()

labels = {f"{tool.get('name')} — {tool.get('description', '')}": tool for tool in visible}
selected_label = st.selectbox("Инструмент", list(labels))
tool = labels[selected_label]
schema = tool.get("inputSchema") or tool.get("input_schema") or {"type": "object", "properties": {}}

st.subheader(tool.get("description") or tool.get("name"))
values = {}
columns = st.columns(2)
for index, (name, field) in enumerate(schema.get("properties", {}).items()):
    with columns[index % 2]:
        label = field.get("description") or name
        default = field.get("default", SMART_DEFAULTS.get(name, default_for(field)))
        key = f"arg_{source}_{tool.get('name')}_{name}"
        if field.get("enum"):
            values[name] = st.selectbox(label, field["enum"], key=key)
        elif field.get("type") == "boolean":
            values[name] = st.checkbox(label, value=bool(default), key=key)
        elif field.get("type") in {"number", "integer"}:
            minimum, maximum = field.get("minimum"), field.get("maximum")
            kwargs = {"value": int(default) if field.get("type") == "integer" else float(default), "key": key}
            if minimum is not None:
                kwargs["min_value"] = int(minimum) if field.get("type") == "integer" else float(minimum)
            if maximum is not None:
                kwargs["max_value"] = int(maximum) if field.get("type") == "integer" else float(maximum)
            values[name] = st.number_input(label, **kwargs)
        else:
            values[name] = st.text_input(label, value=str(default), key=key)

if st.button("Выполнить", type="primary"):
    try:
        arguments = sanitize(schema, values)
        with st.spinner("MCP tools/call"):
            result, exchange = asyncio.run(call_tool(source, url, tool["name"], arguments))
        st.session_state.result = result
        st.session_state.call_exchange = exchange
    except Exception as exc:
        st.error(str(exc))

result = st.session_state.get("result")
if result:
    risk_colors = {"low": "green", "attention": "blue", "moderate": "orange",
                   "high": "red", "critical": "red"}
    if "value" in result:
        st.metric(result.get("name", "Результат"), f"{result['value']} {result.get('unit', '')}".strip())
    if result.get("risk"):
        color = risk_colors.get(result["risk"], "gray")
        st.markdown(f":{color}[**{result['risk'].upper()} · {result.get('interpretation', '')}**]")
    if result.get("components"):
        st.dataframe([{"компонент": key, "значение": value}
                      for key, value in result["components"].items()], hide_index=True, width="stretch")
    candidates = result.get("candidates") or result.get("labels")
    if candidates:
        st.dataframe(candidates, hide_index=True, width="stretch")
    source_url = result.get("source_url") or result.get("source")
    if source_url:
        st.link_button("Источник", source_url)
    with st.expander("Полный результат"):
        st.json(result)

with st.expander("JSON-RPC инспектор"):
    exchange = st.session_state.get("call_exchange") or st.session_state.get("list_exchange")
    if exchange:
        left, right = st.columns(2)
        with left:
            st.code(json.dumps(exchange.request, ensure_ascii=False, indent=2), language="json")
        with right:
            st.code(json.dumps(exchange.response, ensure_ascii=False, indent=2), language="json")
