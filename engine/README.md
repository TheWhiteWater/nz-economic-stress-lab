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

Fetch the first RBNZ source slice:

```bash
cd engine
PYTHONPATH=. python3 scripts/fetch_rbnz_sources.py
```

Derive the first source-loaded model input snapshot:

```bash
cd engine
PYTHONPATH=. python3 scripts/derive_rbnz_model_inputs.py
```

The downloader writes raw files, normalized CSV sheets and a manifest under ignored paths:

```text
engine/data/raw/
engine/data/processed/
engine/data/manifests/
engine/data/derived/
```

Current status: v0.2 prototype. The mechanics are explicit and tested, but assumptions are placeholders until calibrated against official data.
