"""Local MCP server over JSON-RPC 2.0 on stdin/stdout."""

from __future__ import annotations

import logging
import sys
from typing import Annotated, Literal

from mcp.server.mcpserver import MCPServer
from pydantic import Field

from .calculators import (
    calculate_bmi as bmi,
    calculate_cha2ds2_vasc as cha2ds2_vasc,
    calculate_cockcroft_gault as cockcroft_gault,
    calculate_egfr_2021 as egfr_2021,
    calculate_gcs as gcs,
    list_calculators as calculator_catalog,
)

logging.basicConfig(stream=sys.stderr, level=logging.INFO)
mcp = MCPServer("clinical-calculators", version="2.0.0")


@mcp.tool(structured_output=True)
def calculate_bmi(
    weight_kg: Annotated[float, Field(ge=20, le=350, description="Масса, кг")],
    height_cm: Annotated[float, Field(ge=80, le=250, description="Рост, см")],
) -> dict[str, object]:
    """Рассчитать индекс массы тела."""
    return bmi(weight_kg, height_cm)


@mcp.tool(structured_output=True)
def calculate_egfr_2021(
    creatinine_mg_dl: Annotated[float, Field(ge=0.2, le=20, description="Креатинин, мг/дл")],
    age_years: Annotated[int, Field(ge=18, le=120, description="Возраст")],
    sex: Literal["female", "male"],
) -> dict[str, object]:
    """Рассчитать рСКФ по CKD-EPI 2021."""
    return egfr_2021(creatinine_mg_dl, age_years, sex)


@mcp.tool(structured_output=True)
def calculate_cockcroft_gault(
    creatinine_mg_dl: Annotated[float, Field(ge=0.2, le=20)],
    age_years: Annotated[int, Field(ge=18, le=120)],
    weight_kg: Annotated[float, Field(ge=20, le=350)],
    sex: Literal["female", "male"],
) -> dict[str, object]:
    """Рассчитать клиренс креатинина Cockcroft–Gault."""
    return cockcroft_gault(creatinine_mg_dl, age_years, weight_kg, sex)


@mcp.tool(structured_output=True)
def calculate_cha2ds2_vasc(
    age_years: Annotated[int, Field(ge=18, le=120)],
    sex: Literal["female", "male"],
    heart_failure: bool = False,
    hypertension: bool = False,
    diabetes: bool = False,
    stroke_tia_history: bool = False,
    vascular_disease: bool = False,
) -> dict[str, object]:
    """Рассчитать CHA2DS2-VASc."""
    return cha2ds2_vasc(age_years, sex, heart_failure, hypertension, diabetes,
                        stroke_tia_history, vascular_disease)


@mcp.tool(structured_output=True)
def calculate_gcs(
    eye: Annotated[int, Field(ge=1, le=4)],
    verbal: Annotated[int, Field(ge=1, le=5)],
    motor: Annotated[int, Field(ge=1, le=6)],
) -> dict[str, object]:
    """Рассчитать сумму по шкале комы Глазго."""
    return gcs(eye, verbal, motor)


@mcp.tool(structured_output=True)
def list_calculators() -> dict[str, object]:
    """Показать доступные калькуляторы и медицинские области."""
    return calculator_catalog()


if __name__ == "__main__":
    mcp.run(transport="stdio")
