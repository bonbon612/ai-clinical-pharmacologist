import unittest

from clinical_mcp.calculators import (
    calculate_bmi,
    calculate_cha2ds2_vasc,
    calculate_cockcroft_gault,
    calculate_egfr_2021,
    calculate_gcs,
    list_calculators,
)
from clinical_mcp.sanitizer import sanitize


class CalculatorTests(unittest.TestCase):
    def test_bmi(self):
        result = calculate_bmi(70, 175)
        self.assertEqual(result["value"], 22.9)
        self.assertEqual(result["risk"], "low")

    def test_egfr(self):
        result = calculate_egfr_2021(1.0, 60, "male")
        self.assertGreater(result["value"], 60)
        self.assertLess(result["value"], 100)

    def test_cockcroft(self):
        result = calculate_cockcroft_gault(1.0, 65, 70, "male")
        self.assertAlmostEqual(result["value"], 72.9, places=1)

    def test_cha2ds2_vasc(self):
        result = calculate_cha2ds2_vasc(76, "female", hypertension=True, diabetes=True)
        self.assertEqual(result["value"], 5)

    def test_gcs(self):
        self.assertEqual(calculate_gcs(4, 5, 6)["value"], 15)

    def test_bounds(self):
        with self.assertRaises(ValueError):
            calculate_bmi(10, 175)

    def test_catalog(self):
        self.assertEqual(len(list_calculators()["calculators"]), 5)

    def test_sanitizer(self):
        schema = {"required": ["age"], "properties": {"age": {"type": "integer", "minimum": 18, "maximum": 120}}}
        self.assertEqual(sanitize(schema, {"age": "200"}), {"age": 120})


if __name__ == "__main__":
    unittest.main()
