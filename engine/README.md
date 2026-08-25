# NZ Economic Stress Lab engine

Canonical calculation engine for the NZ Economic Stress Lab.

Run tests:

```bash
cd engine
PYTHONPATH=. python3 -m unittest discover -s tests
```

Regenerate cross-language golden fixtures:

```bash
cd engine
PYTHONPATH=. python3 scripts/generate_golden_fixtures.py
```

Current status: v0.2 prototype. The mechanics are explicit and tested, but assumptions are placeholders until calibrated against official data.
