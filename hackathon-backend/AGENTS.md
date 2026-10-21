# AGENTS.md

- always enable caveman

## Project

FastAPI backend ("Quality Matrix Multi-Module API") that serves/edits product data for two
modules, STHI and LCBI, backed directly by CSV/XLSX files grouped under [data/](data) — no database.
Code lives under the [app/](app) package; root [main.py](main.py) is only a thin
`from app.main import app` shim kept so `uvicorn main:app` keeps working.

## Run

```bash
source .venv/bin/activate
uvicorn main:app --reload
```

Run tests from `hackathon-backend` with:

```powershell
.\.venv\Scripts\python.exe -m pytest -q tests
```

## Architecture

- [app/config.py](app/config.py) — env loading (`.env.local` before `.env.production`; shell values win), `DATA_DIR`, `ALLOWED_ORIGINS`, and `QUALITY_MATRIX_DB_FEATURES`.
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
- [app/repositories/](app/repositories) — feature-level CSV access for action items, settings,
  submissions, decisions, product basis, solutions, and PdO matrices. Routers and services use
  these repositories rather than importing `app.io` or accessing data paths directly. Settings
  can use the database when `DATABASE_URL` is set and `QUALITY_MATRIX_DB_FEATURES=settings`;
  all other features remain CSV-backed.
- [app/db/](app/db) — optional SQLAlchemy 2 schema and lazy engine/session factory. No API feature
  uses it unless the `settings` database feature is enabled; settings CSVs are exported after
  committed writes for rollback compatibility.
- [alembic/](alembic) — database schema revisions. Upgrade with `python -m alembic upgrade head`
  after setting `DATABASE_URL`.
- [scripts/import_csv_to_db.py](scripts/import_csv_to_db.py) — preview-by-default CSV migration;
  `--apply` imports transactionally and verifies repository-shaped round trips. PostgreSQL is
  available locally as `quality-matrix-db` in root Compose; its data uses a named Docker volume.
  Repeated submission-answer keys are retained in `submission_answer_collision` in source order,
  preserving the required unique key in `submission_answer` without dropping CSV rows.
- `tests/test_database_migration.py` covers the SQLite schema and import path; run it with the
  existing characterization suite using `python -m pytest -q tests`.
- [app/services/pypcs_service.py](app/services/pypcs_service.py) — PYPCS CSV filenames, row
  normalization, and `build_pypcs_visible_questions()`.
- `data/View2/PYPCS_ActionItems.csv` (View 2) uses `nbr` as its key; applicability fields mirror
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

- `DATA_DIR` (env `QUALITY_MATRIX_DATA_DIR`, default `data`), `ALLOWED_ORIGINS` (env, comma
  separated, default covers Vite `:5173` and CRA `:3000`), and `PROXY_SHARED_SECRET` are
  configurable settings. When configured, `app.auth.get_actor(request)` verifies proxy identity
  headers and supplies the actor used for write attribution. Leave it empty for legacy behavior.
- The app refuses to import if any legacy data file remains directly in `DATA_DIR`; migrate the
  files before starting the backend.
- Endpoints retain legacy no-auth behavior while `PROXY_SHARED_SECRET` is empty. When configured,
  all routes except health and API documentation require trusted proxy identity.
- Wrap read-modify-write flows in `transaction(Resource...)` for all touched repository resources.
  It preserves deterministic multi-file lock ordering; read-only repository calls remain lock-free.
  In mixed settings/CSV transactions the DB commits before staged CSV writes are applied; a DB
  failure must not write any CSV. Writes use atomic replace.
- Keep a single uvicorn worker; editable flows accept optional `expected_version` and return 409 `{"code": "conflict"}`.

## PYPCS Views

- View 2 `data/View2/PYPCS_ActionItems.csv` has an optional `event_id` column immediately after `nbr`.
  It is trimmed, limited to 50 characters, and cannot contain `|`; old files read it as blank.
- View 1 matrix `operation` cell answers are validated per module and stored as trimmed,
  de-duplicated `|`-joined values. `Other` uses the existing custom-text convention.
- View 3 builds one API row per product/module-group. Its decisions-only file is
  `data/View3/PYPCS_ProductActionDecisions.csv` and retains labels for orphaned decisions.
  Product keys are `lower(trim(prodgroup3))||lower(trim(product_name))`; HDMx modules group
  under `HDMx`. Package suggestions set `Y` for a match and `NA` for a non-match; empty,
  `All`, or only-`NA` action packages and blank product packages produce no suggestion.
- View 3 rows expose `decision_state` (`draft`/`final`); legacy nonblank decisions default to `final`,
  and rebuilds preserve it while export includes it. PUT `mode` defaults to `final`; final statuses require comments, drafts allow optional comments, and blank draft cells clear.

## Data Layout and Migration

Set `QUALITY_MATRIX_DB_FEATURES=settings` together with `DATABASE_URL` to enable DB-backed
settings. Unknown feature names, missing configuration, an unreachable database, or a database
not at Alembic head fail startup. `.env.local` loads before `.env.production`; shell environment
values take precedence. Remove the `settings` feature flag to return to CSV settings mode.

- Quality Matrix submissions and slim cells live under `data/QualityMatrix/`; modules,
  questions, question/module mappings, and operation steps live under `data/QualityMatrix/Settings/`.
- Cells have exactly `submission_id, question_id, module_key, role, answer, updated_at,
  updated_by`. Blank `module_key` marks a submission-wide legacy answer. Matrix saves preserve
  these rows; deleting a submission removes them.
- View 2 action items live at `data/View2/PYPCS_ActionItems.csv`.
- View 3 decisions live at `data/View3/PYPCS_ProductActionDecisions.csv`; only decisions and
  identifying labels are stored. Active labels refresh during rebuilds; orphan labels persist.
- TI files live under `data/TI/`, PdO files under `data/PdO/`, and the solution catalog under
  `data/GL-MQR/`. Their APIs remain enabled when the corresponding UI tabs are hidden.
- Stop the backend before migration. From `hackathon-backend`, preview and then apply with an
  explicit data directory; apply backs up and verifies files before removing root-level sources:

  ```powershell
  .\.venv\Scripts\python.exe scripts\migrate_data_layout.py --data-dir "<data-dir>"
  .\.venv\Scripts\python.exe scripts\migrate_data_layout.py --data-dir "<data-dir>" --apply
  ```
