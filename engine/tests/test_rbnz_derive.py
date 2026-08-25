import unittest

from scripts.derive_rbnz_model_inputs import excel_serial_to_date


class RbnzDeriveTests(unittest.TestCase):
    def test_excel_serial_to_date(self):
        self.assertEqual(excel_serial_to_date("46203"), "2026-06-30")


if __name__ == "__main__":
    unittest.main()

