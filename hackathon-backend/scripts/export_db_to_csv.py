import argparse
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import func, select

from app.db import models
from app.db.session import get_session_factory
from app.repositories import settings as settings_repository

EXPORTS = {
    "settings": {
        "modules": models.Module,
        "questions": models.Question,
        "question_module": models.QuestionModule,
        "operations": models.Operation,
    }
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Preview or export database-backed features to CSV"
    )
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--features", default="settings")
    parser.add_argument("--apply", action="store_true", help="write CSV files")
    args = parser.parse_args()
    features = {item.strip().casefold() for item in args.features.split(",") if item.strip()}
    unsupported = features - EXPORTS.keys()
    if unsupported:
        parser.error(f"unsupported features: {', '.join(sorted(unsupported))}")
    if not os.getenv("DATABASE_URL"):
        parser.error("DATABASE_URL is required")
    if not args.data_dir.is_dir():
        parser.error(f"data directory does not exist: {args.data_dir}")
    factory = get_session_factory()
    if factory is None:
        parser.error("DATABASE_URL is required")

    counts = {}
    try:
        with factory() as session:
            for feature in sorted(features):
                for name, model in EXPORTS[feature].items():
                    counts[name] = session.scalar(select(func.count()).select_from(model))
        print("Database rows to export:")
        for name, count in counts.items():
            print(f"  {name}: {count}")
        if args.apply:
            if "settings" in features:
                settings_repository.export_settings_to_csv(data_dir=args.data_dir)
            print(f"Exported to {args.data_dir}")
        else:
            print("Preview only; no files changed. Pass --apply to export.")
        return 0
    except Exception:
        print("Database export failed; check DATABASE_URL, schema, and data directory.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())