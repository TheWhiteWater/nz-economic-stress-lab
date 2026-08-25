from __future__ import annotations

import csv
import json
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = ROOT / "data" / "processed" / "rbnz"
DERIVED_DIR = ROOT / "data" / "derived"
OUTPUT_PATH = DERIVED_DIR / "rbnz_model_inputs.json"

NZD_M = 1_000_000


def excel_serial_to_date(value: str) -> str:
    serial = int(float(value))
    # Excel's 1900 date system includes the fictitious 1900-02-29, so use
    # 1899-12-30 as the practical origin.
    return (date(1899, 12, 30) + timedelta(days=serial)).isoformat()


def read_data_rows(code: str) -> list[list[str]]:
    path = PROCESSED_DIR / code / "Data.csv"
    with path.open(newline="") as handle:
        rows = list(csv.reader(handle))
    return [row for row in rows[5:] if row and row[0].strip()]


def latest_numeric_row(code: str) -> list[str]:
    rows = read_data_rows(code)
    if not rows:
        raise ValueError(f"No data rows found for {code}")
    return rows[-1]


def as_float(value: str) -> float:
    return float(value) if value != "" else 0.0


def derive() -> dict[str, object]:
    c35 = latest_numeric_row("C35")
    c30 = latest_numeric_row("C30")
    b30 = latest_numeric_row("B30")

    total_mortgage_book_m = as_float(c35[10])
    high_lvr_outstanding_m = as_float(c35[20]) if len(c35) > 20 else as_float(c35[11])
    c30_total_new_commitments_m = as_float(c30[1])
    c30_lvr_above_80_m = as_float(c30[2])
    c30_lvr_above_70_m = as_float(c30[3])
    c30_lvr_above_60_m = as_float(c30[5])

    return {
        "schema": "nz-economic-stress-lab.rbnz-derived-inputs.v0",
        "note": "Source-loaded RBNZ snapshot. These values are inputs/candidates, not automatic replacement for calibrated model assumptions.",
        "sources": {
            "C35": "Residential mortgage loan reconciliation",
            "C30": "New residential mortgage lending by LVR",
            "B30": "New residential mortgage weighted/simple average interest rates",
        },
        "mortgage_book_anchor": {
            "source": "C35",
            "date": excel_serial_to_date(c35[0]),
            "series_id": "LVRP.QMF2.A",
            "label": "Total lending / closing position",
            "value_nzd_m": total_mortgage_book_m,
            "value_nzd": total_mortgage_book_m * NZD_M,
        },
        "high_lvr_outstanding_anchor": {
            "source": "C35",
            "date": excel_serial_to_date(c35[0]),
            "label": "Higher than 80% LVR lending / closing position",
            "value_nzd_m": high_lvr_outstanding_m,
            "value_nzd": high_lvr_outstanding_m * NZD_M,
            "share_of_total": high_lvr_outstanding_m / total_mortgage_book_m if total_mortgage_book_m else None,
        },
        "new_lending_lvr_flow": {
            "source": "C30",
            "date": excel_serial_to_date(c30[0]),
            "total_new_commitments_nzd_m": c30_total_new_commitments_m,
            "lvr_above_80_nzd_m": c30_lvr_above_80_m,
            "lvr_above_70_nzd_m": c30_lvr_above_70_m,
            "lvr_above_60_nzd_m": c30_lvr_above_60_m,
            "lvr_above_80_share": c30_lvr_above_80_m / c30_total_new_commitments_m if c30_total_new_commitments_m else None,
            "caveat": "C30 is new commitments flow, not outstanding-book LVR distribution.",
        },
        "mortgage_rate_snapshot": {
            "source": "B30",
            "date": excel_serial_to_date(b30[0]),
            "unit": "percent_per_annum",
            "floating": as_float(b30[1]),
            "six_month": as_float(b30[2]),
            "one_year": as_float(b30[3]),
            "eighteen_month": as_float(b30[4]),
            "two_year": as_float(b30[5]),
        },
    }


def main() -> None:
    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(derive(), indent=2, sort_keys=True) + "\n")
    print(json.dumps({"ok": True, "output": str(OUTPUT_PATH.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()

