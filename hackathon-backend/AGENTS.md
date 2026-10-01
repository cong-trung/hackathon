# AGENTS.md

- always enable caveman

## Project

FastAPI backend ("Quality Matrix Multi-Module API") that serves/edits product data for two
modules, STHI and LCBI, backed directly by CSV/XLSX files in [data/](data) — no database.
Code lives under the [app/](app) package; root [main.py](main.py) is only a thin
`from app.main import app` shim kept so `uvicorn main:app` keeps working.

## Run

```bash
source .venv/bin/activate
uvicorn main:app --reload
```

No test suite or lint config exists yet.

## Architecture

- [app/config.py](app/config.py) — env loading (`.env.production`), `DATA_DIR`, `ALLOWED_ORIGINS`.
- [app/schema_config.py](app/schema_config.py) — `MODULE_CONFIG["STHI"|"LCBI"]`, `SOLUTION_CONFIG`,
  `MODULE_SOLUTION_CONFIG`, `FIELD_LABELS`, `get_module_config()`, `get_module_solution_config()`,
  `field_schema()`. Each module entry maps a data file to its `fields` (frontend/API keys),
  `original_to_fe` (CSV header -> API key), and `fe_to_original` (reverse). CSV headers are messy
  real-world strings (typos, embedded newlines, e.g. `"NSB? \n(Non-Synergy-Build)"`,
  `"Excursion Releated"`) — `original_to_fe` maps multiple header variants to the same key to
  tolerate that.
- To add/rename a field: update `fields`, both header maps, and `FIELD_LABELS` together — all
  four must stay in sync or `field_schema()`/read/write will drop or mislabel the column.
- [app/io/csv_excel.py](app/io/csv_excel.py) — `read_data`/`write_data` auto-detect file format via
  `is_excel_file()` (checks if the file is a real zip/xlsx, not by extension) and dispatch to the
  CSV or `openpyxl` codepath accordingly — current `data/*.csv` files are true CSV, so the excel
  path is currently unused but must keep working if a file is swapped for a real `.xlsx`. Also
  holds `find_by_key()` (case-insensitive, linear scan — fine at this data size, no indexing).
- [app/io/generic_csv.py](app/io/generic_csv.py) — schema-less CSV helpers (`read_generic_csv`,
  `append_rows_to_csv`, etc.) used by the PYPCS subsystem, plus `split_options`/`safe_int`/
  `yn_to_bool`.
- [app/services/pypcs_service.py](app/services/pypcs_service.py) — PYPCS CSV filenames, row
  normalization, and `build_pypcs_visible_questions()`.
- `data/PYPCS_ActionItems.csv` (View 2) uses `nbr` as its key; applicability fields mirror
  PYPCS_Questions `question_id`s and are `|`-joined, with `All`/`NA`/`Multiple` semantics.
  Action items support add/edit only through the `/pypcs/action-items` endpoints.
- [app/services/chat_service.py](app/services/chat_service.py) — `get_nyra_client()` for the AI
  chat endpoints.
- [app/routers/](app/routers) — one FastAPI `APIRouter` per feature area (`health`,
  `product_basis`, `solutions`, `pdsolutions`, `pypcs`, `chat`), wired up in
  [app/main.py](app/main.py).
- Row identity: product-basis rows are keyed by `prodgroup3`, solutions by `id` (auto-incremented
  in `create_solution`).
- `MODULE_SOLUTION_CONFIG` (`ProductSolutionMatrix_{STHI,LCBI}.csv`) backs `/pdsolutions/{module}`
  only (status/note per product-solution pair) — there's no CRUD for solution rows themselves via
  this config. `data/Role.csv`, `data/User.csv`, `data/XRB.csv` also exist but aren't read
  anywhere in `app/` — don't assume they're wired up.

## Conventions

- `DATA_DIR` (env `QUALITY_MATRIX_DATA_DIR`, default `data`) and `ALLOWED_ORIGINS` (env, comma
  separated, default covers Vite `:5173` and CRA `:3000`) are the only configurable settings.
- Endpoints are no-auth by design (see app description in [app/main.py](app/main.py)); don't add
  auth without being asked.
- New module-scoped endpoints should follow the existing pattern: add them to the relevant
  router in [app/routers/](app/routers) (or create a new router + include it in
  [app/main.py](app/main.py)), resolve config via `get_module_config(module)`, read all rows,
  mutate the list, then `write_data(...)` the whole file back (no partial/streaming writes).

## Planned

- Future View 3 will merge Quality Matrix submissions with View 2. For each Quality Matrix
  product, the user will select the matching AR follow-up from View 2 using applicability
  question IDs; this is not implemented.
