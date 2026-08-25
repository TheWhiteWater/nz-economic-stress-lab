from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
SOURCES_PATH = ROOT / "data" / "rbnz_sources.json"
RAW_DIR = ROOT / "data" / "raw" / "rbnz"
PROCESSED_DIR = ROOT / "data" / "processed" / "rbnz"
MANIFEST_DIR = ROOT / "data" / "manifests"

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


@dataclass(frozen=True)
class Sheet:
    name: str
    path: str


def safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    return cleaned.strip("_") or "sheet"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "nz-economic-stress-lab/0.2 research prototype",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        payload = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    root = ElementTree.fromstring(payload)
    values = []
    for item in root.findall("main:si", NS):
        text_parts = [node.text or "" for node in item.findall(".//main:t", NS)]
        values.append("".join(text_parts))
    return values


def load_sheets(archive: zipfile.ZipFile) -> list[Sheet]:
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_by_id = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("rel:Relationship", NS)
    }

    sheets = []
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = rel_by_id[rel_id]
        path = target if target.startswith("xl/") else f"xl/{target}"
        sheets.append(Sheet(name=sheet.attrib["name"], path=path))
    return sheets


def column_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    index = 0
    for char in letters:
        index = index * 26 + (ord(char.upper()) - ord("A") + 1)
    return index - 1


def cell_value(cell: ElementTree.Element, shared_strings: list[str]) -> str:
    value = cell.find("main:v", NS)
    if value is None:
        inline = cell.find("main:is/main:t", NS)
        return inline.text if inline is not None and inline.text is not None else ""

    raw = value.text or ""
    if cell.attrib.get("t") == "s":
        return shared_strings[int(raw)]
    return raw


def sheet_rows(archive: zipfile.ZipFile, sheet: Sheet, shared_strings: list[str]) -> list[list[str]]:
    root = ElementTree.fromstring(archive.read(sheet.path))
    rows = []
    for row in root.findall(".//main:sheetData/main:row", NS):
        values_by_col = {}
        max_col = -1
        for cell in row.findall("main:c", NS):
            col = column_index(cell.attrib.get("r", "A1"))
            values_by_col[col] = cell_value(cell, shared_strings)
            max_col = max(max_col, col)
        values = [values_by_col.get(col, "") for col in range(max_col + 1)]
        if any(value != "" for value in values):
            rows.append(values)
    return rows


def write_csv(path: Path, rows: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)


def process_workbook(code: str, payload: bytes) -> list[dict[str, object]]:
    outputs = []
    with zipfile.ZipFile(Path(RAW_DIR / f"{code}.xlsx")) as archive:
        shared_strings = load_shared_strings(archive)
        for sheet in load_sheets(archive):
            rows = sheet_rows(archive, sheet, shared_strings)
            csv_path = PROCESSED_DIR / code / f"{safe_name(sheet.name)}.csv"
            write_csv(csv_path, rows)
            outputs.append(
                {
                    "sheet": sheet.name,
                    "rows": len(rows),
                    "columns_max": max((len(row) for row in rows), default=0),
                    "csv_path": str(csv_path.relative_to(ROOT)),
                }
            )
    return outputs


def main() -> int:
    sources = json.loads(SOURCES_PATH.read_text())
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {
        "schema": "nz-economic-stress-lab.rbnz-ingestion-manifest.v0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_index": sources["source_index"],
        "series": [],
    }

    failures = []
    for series in sources["series"]:
        code = series["code"]
        try:
            payload = download(series["url"])
            raw_path = RAW_DIR / f"{code}.xlsx"
            raw_path.write_bytes(payload)
            manifest["series"].append(
                {
                    "code": code,
                    "title": series["title"],
                    "url": series["url"],
                    "sha256": sha256_bytes(payload),
                    "bytes": len(payload),
                    "raw_path": str(raw_path.relative_to(ROOT)),
                    "outputs": process_workbook(code, payload),
                }
            )
        except Exception as exc:  # pragma: no cover - exercised by live network failures.
            failures.append({"code": code, "url": series["url"], "error": repr(exc)})

    manifest["failures"] = failures
    manifest_path = MANIFEST_DIR / "rbnz_ingestion_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")

    if failures:
        print(json.dumps({"ok": False, "failures": failures}, indent=2), file=sys.stderr)
        return 1

    print(json.dumps({"ok": True, "manifest": str(manifest_path.relative_to(ROOT))}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

