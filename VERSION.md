# v0.2 deployed baseline

Public deployment:

```text
https://nz-economic-stress-lab.redice.chatgpt.site
```

Repository:

```text
TheWhiteWater/nz-economic-stress-lab
```

Baseline commit lineage:

- `0bcd0a2` — Python engine parity fixtures and Crown debt fix.
- `017958f` — full recursive `StressResult` parity test.

Status:

- Web UI preserved.
- Python engine is the canonical research implementation.
- Browser runtime is guarded by recursive parity against Python-generated golden fixtures.
- Production site deployed from unified `main`.

Known limits:

- Economic assumptions remain placeholders unless explicitly source-loaded.
- `required_capital_rate` is not yet calibrated.
- Current kill-test compares shock absorption; economic cost comparison is still pending.

