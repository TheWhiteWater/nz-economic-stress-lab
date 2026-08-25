from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from nzmi_stress_lab.model import run_stress


ROOT = Path(__file__).resolve().parents[1]
ASSUMPTIONS_PATH = ROOT / "data" / "assumptions.v0.json"
OUTPUT_PATH = ROOT / "fixtures" / "golden.v0.json"


def main() -> None:
    assumptions = json.loads(ASSUMPTIONS_PATH.read_text())
    fixtures = {
        "schema": "nz-economic-stress-lab.golden-fixtures.v0",
        "assumptions_schema": assumptions["schema"],
        "cases": [],
    }

    for scenario_name in assumptions["scenarios"]:
        for design_name in assumptions["designs"]:
            result = run_stress(assumptions, scenario_name, design_name)
            fixtures["cases"].append(
                {
                    "scenario": scenario_name,
                    "design": design_name,
                    "result": asdict(result),
                }
            )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(fixtures, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()

