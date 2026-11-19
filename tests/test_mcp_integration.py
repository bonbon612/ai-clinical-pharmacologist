import unittest

from mcp.client import Client

from clinical_mcp.server import mcp


class MCPIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_lists_six_typed_tools(self):
        async with Client(mcp) as client:
            result = await client.list_tools()
        self.assertEqual(len(result.tools), 6)
        egfr = next(tool for tool in result.tools if tool.name == "calculate_egfr_2021")
        self.assertEqual(egfr.input_schema["properties"]["sex"]["enum"], ["female", "male"])
        self.assertEqual(egfr.input_schema["properties"]["age_years"]["maximum"], 120)

    async def test_calls_tool_through_mcp_protocol(self):
        async with Client(mcp) as client:
            result = await client.call_tool("calculate_bmi", {"weight_kg": 70, "height_cm": 175})
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content["value"], 22.9)

    async def test_validation_is_protocol_error_result(self):
        async with Client(mcp) as client:
            result = await client.call_tool("calculate_bmi", {"weight_kg": 10, "height_cm": 175})
        self.assertTrue(result.is_error)


if __name__ == "__main__":
    unittest.main()
