import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.fetch_rbnz_sources import load_shared_strings, load_sheets, sheet_rows


class RbnzFetchTests(unittest.TestCase):
    def test_minimal_xlsx_sheet_is_parsed_without_external_dependencies(self):
        with tempfile.TemporaryDirectory() as tmp:
            workbook = Path(tmp) / "sample.xlsx"
            with zipfile.ZipFile(workbook, "w") as archive:
                archive.writestr(
                    "xl/workbook.xml",
                    """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Data" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>""",
                )
                archive.writestr(
                    "xl/_rels/workbook.xml.rels",
                    """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
</Relationships>""",
                )
                archive.writestr(
                    "xl/sharedStrings.xml",
                    """<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>Date</t></si>
  <si><t>Value</t></si>
</sst>""",
                )
                archive.writestr(
                    "xl/worksheets/sheet1.xml",
                    """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2"><v>45100</v></c><c r="B2"><v>123.45</v></c></row>
  </sheetData>
</worksheet>""",
                )

            with zipfile.ZipFile(workbook) as archive:
                shared_strings = load_shared_strings(archive)
                sheets = load_sheets(archive)
                rows = sheet_rows(archive, sheets[0], shared_strings)

        self.assertEqual([sheet.name for sheet in sheets], ["Data"])
        self.assertEqual(rows, [["Date", "Value"], ["45100", "123.45"]])


if __name__ == "__main__":
    unittest.main()

