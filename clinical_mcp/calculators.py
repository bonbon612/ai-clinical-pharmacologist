"""Deterministic clinical calculators shared by MCP transports."""

from __future__ import annotations

from typing import Literal

SOURCE_URLS = {
    "bmi": "https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html",
    "egfr": "https://www.kidney.org/ckd-epi-creatinine-equation-2021",
    "cockcroft": "https://pubmed.ncbi.nlm.nih.gov/1244564/",
    "cha2ds2_vasc": "https://www.escardio.org/Guidelines/Clinical-Practice-Guidelines/Atrial-Fibrillation-Management",
    "gcs": "https://www.glasgowcomascale.org/",
}


def _number(name: str, value: float, low: float, high: float) -> float:
    value = float(value)
    if not low <= value <= high:
        raise ValueError(f"{name}: допустимый диапазон {low}–{high}")
    return value


def calculate_bmi(weight_kg: float, height_cm: float) -> dict:
    weight = _number("Масса", weight_kg, 20, 350)
    height = _number("Рост", height_cm, 80, 250)
    value = weight / (height / 100) ** 2
    if value < 18.5:
        risk, interpretation = "attention", "Дефицит массы тела"
    elif value < 25:
        risk, interpretation = "low", "Диапазон нормы"
    elif value < 30:
        risk, interpretation = "moderate", "Избыточная масса тела"
    else:
        risk, interpretation = "high", "Ожирение"
    return _result("ИМТ", round(value, 1), "кг/м²", risk, interpretation,
                   {"масса_кг": weight, "рост_см": height}, SOURCE_URLS["bmi"])


def calculate_egfr_2021(
    creatinine_mg_dl: float,
    age_years: int,
    sex: Literal["female", "male"],
) -> dict:
    scr = _number("Креатинин", creatinine_mg_dl, 0.2, 20)
    age = int(_number("Возраст", age_years, 18, 120))
    if sex not in {"female", "male"}:
        raise ValueError("Пол: female или male")
    kappa = 0.7 if sex == "female" else 0.9
    alpha = -0.241 if sex == "female" else -0.302
    value = 142 * min(scr / kappa, 1) ** alpha * max(scr / kappa, 1) ** -1.2
    value *= 0.9938**age
    if sex == "female":
        value *= 1.012
    if value >= 90:
        risk, interpretation = "low", "G1 при наличии признаков поражения почек"
    elif value >= 60:
        risk, interpretation = "attention", "G2"
    elif value >= 45:
        risk, interpretation = "moderate", "G3a"
    elif value >= 30:
        risk, interpretation = "high", "G3b"
    elif value >= 15:
        risk, interpretation = "high", "G4"
    else:
        risk, interpretation = "critical", "G5"
    return _result("рСКФ CKD-EPI 2021", round(value, 1), "мл/мин/1,73 м²", risk,
                   interpretation, {"креатинин_мг_дл": scr, "возраст": age, "пол": sex},
                   SOURCE_URLS["egfr"])


def calculate_cockcroft_gault(
    creatinine_mg_dl: float,
    age_years: int,
    weight_kg: float,
    sex: Literal["female", "male"],
) -> dict:
    scr = _number("Креатинин", creatinine_mg_dl, 0.2, 20)
    age = int(_number("Возраст", age_years, 18, 120))
    weight = _number("Масса", weight_kg, 20, 350)
    if sex not in {"female", "male"}:
        raise ValueError("Пол: female или male")
    value = (140 - age) * weight / (72 * scr)
    if sex == "female":
        value *= 0.85
    if value >= 90:
        risk, interpretation = "low", "Клиренс не снижен"
    elif value >= 60:
        risk, interpretation = "attention", "Незначительное снижение"
    elif value >= 30:
        risk, interpretation = "moderate", "Снижение: проверить дозирование"
    elif value >= 15:
        risk, interpretation = "high", "Выраженное снижение"
    else:
        risk, interpretation = "critical", "Тяжёлое снижение"
    return _result("Клиренс креатинина Cockcroft–Gault", round(value, 1), "мл/мин", risk,
                   interpretation, {"креатинин_мг_дл": scr, "возраст": age,
                                    "масса_кг": weight, "пол": sex}, SOURCE_URLS["cockcroft"])


def calculate_cha2ds2_vasc(
    age_years: int,
    sex: Literal["female", "male"],
    heart_failure: bool = False,
    hypertension: bool = False,
    diabetes: bool = False,
    stroke_tia_history: bool = False,
    vascular_disease: bool = False,
) -> dict:
    age = int(_number("Возраст", age_years, 18, 120))
    if sex not in {"female", "male"}:
        raise ValueError("Пол: female или male")
    components = {
        "сердечная_недостаточность": int(heart_failure),
        "гипертензия": int(hypertension),
        "возраст": 2 if age >= 75 else int(age >= 65),
        "диабет": int(diabetes),
        "инсульт_или_ТИА": 2 * int(stroke_tia_history),
        "сосудистое_заболевание": int(vascular_disease),
        "женский_пол": int(sex == "female"),
    }
    score = sum(components.values())
    risk = "low" if score <= 1 else "moderate" if score == 2 else "high"
    interpretation = "Низкий" if score <= 1 else "Промежуточный" if score == 2 else "Повышенный"
    return _result("CHA₂DS₂-VASc", score, "баллов", risk, interpretation,
                   components, SOURCE_URLS["cha2ds2_vasc"])


def calculate_gcs(eye: int, verbal: int, motor: int) -> dict:
    eye = int(_number("Открывание глаз", eye, 1, 4))
    verbal = int(_number("Речевая реакция", verbal, 1, 5))
    motor = int(_number("Двигательная реакция", motor, 1, 6))
    score = eye + verbal + motor
    if score >= 13:
        risk, interpretation = "low", "Лёгкое нарушение или ясное сознание"
    elif score >= 9:
        risk, interpretation = "high", "Умеренное нарушение"
    else:
        risk, interpretation = "critical", "Тяжёлое нарушение"
    return _result("Шкала комы Глазго", score, "баллов", risk, interpretation,
                   {"глаза": eye, "речь": verbal, "движение": motor}, SOURCE_URLS["gcs"])


def list_calculators() -> dict:
    return {
        "calculators": [
            {"name": "calculate_bmi", "domain": "антропометрия"},
            {"name": "calculate_egfr_2021", "domain": "нефрология"},
            {"name": "calculate_cockcroft_gault", "domain": "клиническая фармакология"},
            {"name": "calculate_cha2ds2_vasc", "domain": "кардиология"},
            {"name": "calculate_gcs", "domain": "неврология"},
        ]
    }


def _result(name: str, value: float | int, unit: str, risk: str, interpretation: str,
            components: dict, source_url: str) -> dict:
    return {
        "name": name,
        "value": value,
        "unit": unit,
        "risk": risk,
        "interpretation": interpretation,
        "components": components,
        "source_url": source_url,
        "educational_notice": "Учебный расчёт. Клиническое решение принимает специалист.",
    }
