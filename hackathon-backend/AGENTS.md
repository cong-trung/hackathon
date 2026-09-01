# AGENTS.md

- always enable caveman

## Project

Single-file FastAPI backend ("Quality Matrix Multi-Module API") that serves/edits product
data for two modules, STHI and LCBI, backed directly by CSV/XLSX files in [data/](data) — no
database. All logic lives in [main.py](main.py).

## Run

```bash
source .venv/bin/activate
uvicorn main:app --reload
```

No test suite or lint config exists yet.

## Architecture

- `MODULE_CONFIG["STHI"|"LCBI"]` and `SOLUTION_CONFIG` drive everything: each entry maps a
  data file to its `fields` (frontend/API keys), `original_to_fe` (CSV header -> API key), and
  `fe_to_original` (reverse). CSV headers are messy real-world strings (typos, embedded
  newlines, e.g. `"NSB? \n(Non-Synergy-Build)"`, `"Excursion Releated"`) — `original_to_fe` maps
  multiple header variants to the same key to tolerate that.
- To add/rename a field: update `fields`, both header maps, and `FIELD_LABELS` together — all
  four must stay in sync or `field_schema()`/read/write will drop or mislabel the column.
- `read_data`/`write_data` auto-detect file format via `is_excel_file()` (checks if the file is
  a real zip/xlsx, not by extension) and dispatch to the CSV or `openpyxl` codepath
  accordingly — current `data/*.csv` files are true CSV, so the excel path is currently unused
  but must keep working if a file is swapped for a real `.xlsx`.
- Row identity: product-basis rows are keyed by `prodgroup3`, solutions by `id` (auto-incremented
  in `create_solution`). Lookups use `find_by_key()` (case-insensitive, linear scan — fine at this
  data size, no indexing).
- `MODULE_SOLUTION_CONFIG` (`ProductSolutionMatrix_{STHI,LCBI}.csv`) is defined but has **no
  endpoints yet**. `data/Role.csv`, `data/User.csv`, `data/XRB.csv` also exist but aren't read
  anywhere in `main.py` — don't assume they're wired up.

## Conventions

- `DATA_DIR` (env `QUALITY_MATRIX_DATA_DIR`, default `data`) and `ALLOWED_ORIGINS` (env, comma
  separated, default covers Vite `:5173` and CRA `:3000`) are the only configurable settings.
- Endpoints are no-auth by design (see app description in [main.py](main.py)); don't add auth
  without being asked.
- New module-scoped endpoints should follow the existing pattern: resolve config via
  `get_module_config(module)`, read all rows, mutate the list, then `write_data(...)` the whole
  file back (no partial/streaming writes).
