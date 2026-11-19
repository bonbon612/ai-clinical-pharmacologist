"""Schema-aware conversion of values entered in the web UI."""

from __future__ import annotations


def default_for(schema: dict):
    if "default" in schema:
        return schema["default"]
    if schema.get("enum"):
        return schema["enum"][0]
    kind = schema.get("type")
    if kind == "boolean":
        return False
    if kind in {"number", "integer"}:
        low, high = schema.get("minimum"), schema.get("maximum")
        if low is not None and high is not None:
            return (low + high) / 2
        return low if low is not None else 0
    return ""


def sanitize(schema: dict, values: dict) -> dict:
    result = {}
    required = set(schema.get("required", []))
    for name, field in schema.get("properties", {}).items():
        value = values.get(name, default_for(field))
        kind = field.get("type")
        if kind == "integer":
            value = int(value)
        elif kind == "number":
            value = float(value)
        elif kind == "boolean":
            value = bool(value)
        elif kind == "string":
            value = str(value).strip()
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if "minimum" in field:
                value = max(value, field["minimum"])
            if "maximum" in field:
                value = min(value, field["maximum"])
        if name in required or value not in ("", None):
            result[name] = value
    return result
