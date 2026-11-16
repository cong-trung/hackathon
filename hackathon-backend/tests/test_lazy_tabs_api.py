import csv
import os
import re
import shutil
from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault(
    "QUALITY_MATRIX_AUTH_SECRET", "test-auth-secret-at-least-thirty-two-characters"
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DATA_DIR = BACKEND_ROOT / "data"
OWNER_EMAIL = "me.owner@example.com"
MATRIX = "/pypcs/product-action-matrix"
OWNED_MODULE = "HDMx_Class"


def _user(username, role, email=""):
    return {
        "username": username,
        "display_name": username,
        "email": email,
        "role": role,
        "status": "active",
        "password_hash": "",
    }


USERS = [
    _user("admin1", "admin", "admin@example.com"),
    _user("me1", "ME", OWNER_EMAIL),
    _user("me2", "ME", "other.owner@example.com"),
    _user("ti1", "ti", "ti1@example.com"),
]


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.delenv("PROXY_SHARED_SECRET", raising=False)
    monkeypatch.delenv("EDIT_PIN", raising=False)
    data_dir = tmp_path / "data"
    for folder in ("QualityMatrix", "View2", "View3"):
        shutil.copytree(SOURCE_DATA_DIR / folder, data_dir / folder)

    import app.auth as auth
    import app.config as config
    import app.io.concurrency as concurrency
    import app.io.generic_csv as generic_csv
    import app.routers.auth as auth_router
    import app.services.product_action_matrix_service as matrix_service
    import app.services.pypcs_service as pypcs_service
    from app.main import app

    app.dependency_overrides.clear()
    user_file = data_dir / "Auth" / "Users.csv"
    user_file.parent.mkdir(parents=True, exist_ok=True)
    with user_file.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=auth.USER_HEADERS)
        writer.writeheader()
        writer.writerows(USERS)

    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(concurrency, "DATA_DIR", data_dir)
    monkeypatch.setattr(generic_csv, "DATA_DIR", data_dir)
    monkeypatch.setattr(matrix_service, "DATA_DIR", data_dir)
    monkeypatch.setattr(auth, "USER_FILE", user_file)
    monkeypatch.setattr(auth, "AUDIT_FILE", data_dir / "Auth" / "AuditLog.csv")
    monkeypatch.setattr(auth_router, "USER_FILE", user_file, raising=False)
    matrix_service.invalidate_product_action_matrix_cache()
    pypcs_service._canonical_module_keys.cache_clear()

    client = TestClient(app)
    client.data_dir = data_dir
    yield client, auth
    client.close()
    matrix_service.invalidate_product_action_matrix_cache()
    pypcs_service._canonical_module_keys.cache_clear()


def _headers(auth, username):
    token, _expires_at = auth.issue_token(username)
    return {"Authorization": f"Bearer {token}"}


def _owned_submission(client, auth, name="Zz Lazy Owned Product", status="draft"):
    response = client.post(
        "/pypcs/matrix-submission",
        json={
            "status": "draft",
            "selected_modules": [OWNED_MODULE],
            "product_name": name,
            "cells": [
                {"question_id": "product_name", "module_key": OWNED_MODULE, "answer": name},
                {"question_id": "pdo_owner", "module_key": OWNED_MODULE, "answer": OWNER_EMAIL},
            ],
        },
        headers=_headers(auth, "admin1"),
    )
    assert response.status_code == 200, response.text
    submission_id = response.json()["submission_id"]
    if status != "draft":
        _set_status(client.data_dir, submission_id, status)
    return submission_id


def _set_status(data_dir, submission_id, status):
    """Edit the temp-dir copy directly; final submit has extra required-field rules."""
    path = data_dir / "QualityMatrix" / "PYPCS_Submissions.csv"
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        fieldnames = reader.fieldnames
        rows = list(reader)
    for row in rows:
        if row["submission_id"] == submission_id:
            row["status"] = status
    with path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _largest_group(meta):
    return max((tab for tab in meta["tabs"] if tab["key"] != "__all__"), key=lambda t: t["count"])


def _ported_review_status(row, actions):
    """Independent re-implementation of the frontend reviewStatus()."""
    applicable = [
        action
        for action in actions
        if any(module.lower() == row["module_group"].lower() for module in action["modules"])
    ]
    if any(not row["cells"].get(str(action["nbr"]), {}).get("status") for action in applicable):
        return "needs_review"
    if any(
        row["cells"].get(str(action["nbr"]), {}).get("decision_state") == "draft"
        for action in applicable
    ):
        return "draft"
    return "reviewed"


def _natural(value):
    return [
        (0, int(part)) if part.isdigit() else (1, part)
        for part in re.split(r"(\d+)", value.casefold())
        if part
    ]


# --- Quality Product Matrix -------------------------------------------------


def test_matrix_meta_counts_match_full_data(env):
    client, auth = env
    _owned_submission(client, auth)
    full = client.get(MATRIX).json()
    meta = client.get(f"{MATRIX}/meta").json()

    assert set(meta) == {"tabs", "total_products", "generated_at"}
    assert meta["tabs"][0] == {"key": "__all__", "label": "All", "count": len(full["rows"])}
    assert [tab["key"] for tab in meta["tabs"][1:]] == [g["key"] for g in full["module_groups"]]
    for tab, group in zip(meta["tabs"][1:], full["module_groups"]):
        assert tab["label"] == group["label"]
        assert tab["count"] == group["product_count"]
        assert tab["action_count"] == len(
            [a for a in full["actions"] if group["key"] in a["modules"]]
        )
        assert tab["count"] == len([r for r in full["rows"] if r["module_group"] == group["key"]])
    assert meta["total_products"] == len({row["product_key"] for row in full["rows"]})
    assert meta["generated_at"]


def test_matrix_page_paging_and_total(env):
    client, auth = env
    _owned_submission(client, auth)
    meta = client.get(f"{MATRIX}/meta").json()
    group = _largest_group(meta)["key"]
    full = client.get(MATRIX, params={"module_group": group}).json()

    first = client.get(MATRIX, params={"view": "page", "module_group": group, "limit": 2}).json()
    assert set(first) == {"module_group", "actions", "items", "total", "limit", "offset"}
    assert first["module_group"] == group
    assert first["total"] == len(full["rows"]) == _largest_group(meta)["count"]
    assert first["limit"] == 2 and first["offset"] == 0
    assert first["actions"] == full["actions"]
    assert len(first["items"]) == min(2, first["total"])

    collected = []
    offset = 0
    while True:
        page = client.get(
            MATRIX, params={"view": "page", "module_group": group, "limit": 2, "offset": offset}
        ).json()
        collected.extend(page["items"])
        offset += 2
        if offset >= page["total"]:
            break
    assert [r["product_key"] for r in collected] == [r["product_key"] for r in full["rows"]]

    beyond = client.get(
        MATRIX, params={"view": "page", "module_group": group, "offset": first["total"] + 5}
    ).json()
    assert beyond["items"] == [] and beyond["total"] == first["total"]


def test_matrix_page_all_group_includes_all_actions(env):
    client, auth = env
    full = client.get(MATRIX).json()
    for params in ({"view": "page"}, {"view": "page", "module_group": "__all__"}):
        page = client.get(MATRIX, params={**params, "limit": 200}).json()
        assert page["module_group"] == "__all__"
        assert page["actions"] == full["actions"]
        assert page["total"] == len(full["rows"])


def test_matrix_page_search(env):
    client, auth = env
    _owned_submission(client, auth, name="Zz Lazy Owned Product")
    page = client.get(MATRIX, params={"view": "page", "q": "zz LAZY owned", "limit": 200}).json()
    assert page["total"] >= 1
    assert all("zz lazy owned" in row["product_name"].lower() for row in page["items"])

    full = client.get(MATRIX).json()
    module_key = next(row["module_keys"][0] for row in full["rows"] if row["module_keys"])
    expected = [
        row
        for row in full["rows"]
        if any(
            module_key.lower() in str(value).lower()
            for value in (
                row["product_name"],
                row["prodgroup3"],
                row["module_group"],
                *row["module_keys"],
            )
        )
    ]
    by_key = client.get(
        MATRIX, params={"view": "page", "q": module_key.upper(), "limit": 200}
    ).json()
    assert by_key["total"] >= len(expected)
    assert client.get(MATRIX, params={"view": "page", "q": "no-such-thing-xyz"}).json()["total"] == 0


def test_review_status_port_on_synthetic_rows():
    from app.services.product_action_matrix_service import review_status

    actions = [
        {"nbr": 1, "modules": ["STHI"]},
        {"nbr": 2, "modules": ["sthi", "LCBI"]},
        {"nbr": 3, "modules": ["LCBI"]},
    ]

    def row(group, **cells):
        return {"module_group": group, "cells": {k[1:]: v for k, v in cells.items()}}

    assert review_status(row("STHI", n1={"status": "Y"}), actions) == "needs_review"
    assert review_status(row("sthi", n1={"status": "Y"}, n2={"status": "NA"}), actions) == "reviewed"
    assert (
        review_status(
            row("STHI", n1={"status": "Y"}, n2={"status": "N", "decision_state": "draft"}),
            actions,
        )
        == "draft"
    )
    # Action 3 is not applicable to STHI so it never affects the result.
    assert review_status(row("STHI", n1={"status": "Y"}, n2={"status": "Y"}), actions) == "reviewed"
    assert review_status({"module_group": "XYZ", "cells": {}}, actions) == "reviewed"
    assert review_status({"module_group": "STHI"}, actions) == "needs_review"
    # Missing status wins over draft.
    assert (
        review_status(row("STHI", n1={"decision_state": "draft"}, n2={"status": "Y"}), actions)
        == "needs_review"
    )


def test_matrix_needs_review_matches_ported_logic(env):
    client, auth = env
    _owned_submission(client, auth)
    full = client.get(MATRIX).json()
    expected = {
        (row["product_key"], row["module_group"]): _ported_review_status(row, full["actions"])
        for row in full["rows"]
    }
    assert "needs_review" in expected.values()

    page = client.get(MATRIX, params={"view": "page", "limit": 200}).json()
    assert page["total"] == len(expected)
    seen = Counter()
    offset = 0
    while offset < page["total"]:
        chunk = client.get(MATRIX, params={"view": "page", "limit": 200, "offset": offset}).json()
        for item in chunk["items"]:
            assert item["review_status"] == expected[(item["product_key"], item["module_group"])]
            seen[item["review_status"]] += 1
        offset += 200
    assert seen == Counter(expected.values())

    flagged = client.get(
        MATRIX, params={"view": "page", "needs_review": "true", "limit": 200}
    ).json()
    assert flagged["total"] == sum(1 for status in expected.values() if status != "reviewed")
    assert all(item["review_status"] != "reviewed" for item in flagged["items"])
    everything = client.get(
        MATRIX, params={"view": "page", "needs_review": "false", "limit": 200}
    ).json()
    assert everything["total"] == len(expected)


def test_matrix_reviewed_and_draft_rows_after_edits(env):
    client, auth = env
    admin = _headers(auth, "admin1")
    rows = client.get(MATRIX).json()["rows"][:2]
    for row, mode in zip(rows, ("final", "draft")):
        cells = [
            {"action_nbr": int(nbr), "status": "Y", "comment": "ok"} for nbr in row["cells"]
        ]
        response = client.put(
            f"{MATRIX}/rows",
            json={
                "product_key": row["product_key"],
                "module_group": row["module_group"],
                "mode": mode,
                "cells": cells,
            },
            headers=admin,
        )
        assert response.status_code == 200, response.text

    full = client.get(MATRIX).json()
    expected = {
        (r["product_key"], r["module_group"]): _ported_review_status(r, full["actions"])
        for r in full["rows"]
    }
    assert {"needs_review", "draft", "reviewed"} <= set(expected.values())
    page = client.get(MATRIX, params={"view": "page", "limit": 200}).json()
    for item in page["items"]:
        assert item["review_status"] == expected[(item["product_key"], item["module_group"])]
    flagged = client.get(MATRIX, params={"view": "page", "needs_review": "true", "limit": 200}).json()
    assert flagged["total"] == len(expected) - list(expected.values()).count("reviewed")
    assert page["total"] == flagged["total"] + 1


def test_matrix_sorting(env):
    client, auth = env
    _owned_submission(client, auth)
    full = client.get(MATRIX).json()
    limit_params = {"view": "page", "limit": 200}

    asc = client.get(MATRIX, params={**limit_params, "sort": "product_name", "dir": "asc"}).json()
    desc = client.get(MATRIX, params={**limit_params, "sort": "product_name", "dir": "desc"}).json()
    names = [_natural(item["product_name"]) for item in asc["items"]]
    assert names == sorted(names)
    desc_names = [_natural(item["product_name"]) for item in desc["items"]]
    assert desc_names == sorted(desc_names, reverse=True)
    assert asc["total"] == desc["total"] == len(full["rows"])

    default_dir = client.get(MATRIX, params={**limit_params, "sort": "prodgroup3"}).json()
    groups = [_natural(item["prodgroup3"]) for item in default_dir["items"]]
    assert groups == sorted(groups)

    order = ["needs_review", "draft", "reviewed"]
    by_review = client.get(MATRIX, params={**limit_params, "sort": "review_status"}).json()
    ranks = [order.index(item["review_status"]) for item in by_review["items"]]
    assert ranks == sorted(ranks)
    reversed_review = client.get(
        MATRIX, params={**limit_params, "sort": "review_status", "dir": "desc"}
    ).json()
    ranks = [order.index(item["review_status"]) for item in reversed_review["items"]]
    assert ranks == sorted(ranks, reverse=True)


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": 201},
        {"limit": "abc"},
        {"offset": -1},
        {"sort": "bogus"},
        {"dir": "sideways"},
        {"q": "x" * 201},
        {"view": "other"},
        {"needs_review": "maybe"},
    ],
)
def test_matrix_page_validation(env, params):
    client, _auth = env
    assert client.get(MATRIX, params={"view": "page", **params}).status_code in {422}


def test_matrix_page_unknown_group_is_422(env):
    client, _auth = env
    response = client.get(MATRIX, params={"view": "page", "module_group": "NOPE"})
    assert response.status_code == 422


def test_matrix_without_view_is_unchanged(env):
    client, auth = env
    _owned_submission(client, auth)
    plain = client.get(MATRIX)
    assert plain.status_code == 200
    body = plain.json()
    assert set(body) == {"module_groups", "actions", "rows"}
    ignored = client.get(
        MATRIX, params={"q": "zz", "needs_review": "true", "sort": "product_name", "limit": 1}
    )
    assert ignored.json() == body
    assert all("review_status" not in row for row in body["rows"])
    group = body["module_groups"][0]["key"]
    filtered = client.get(MATRIX, params={"module_group": group}).json()
    assert set(filtered) == {"module_groups", "actions", "rows"}
    assert all(row["module_group"] == group for row in filtered["rows"])


def test_matrix_page_items_keep_permission_flags(env):
    client, auth = env
    _owned_submission(client, auth)
    anonymous = client.get(MATRIX, params={"view": "page", "limit": 200}).json()
    assert anonymous["items"]
    assert all(item["can_edit"] is False for item in anonymous["items"])

    me_headers = _headers(auth, "me1")
    full = client.get(MATRIX, headers=me_headers).json()
    expected = {(r["product_key"], r["module_group"]): r["can_edit"] for r in full["rows"]}
    page = client.get(
        MATRIX, params={"view": "page", "limit": 200}, headers=me_headers
    ).json()
    assert any(item["can_edit"] for item in page["items"])
    for item in page["items"]:
        assert item["can_edit"] == expected[(item["product_key"], item["module_group"])]

    admin_page = client.get(
        MATRIX, params={"view": "page", "limit": 5}, headers=_headers(auth, "admin1")
    ).json()
    assert all(item["can_edit"] is True for item in admin_page["items"])


# --- Review submissions -----------------------------------------------------

SUBMISSIONS = "/pypcs/submissions"


def test_submissions_meta_counts_match_list(env):
    client, auth = env
    _owned_submission(client, auth, name="Zz Draft Product", status="draft")
    _owned_submission(client, auth, name="Zz Final Product", status="final")
    _owned_submission(client, auth, name="Zz Waiting Product", status="waiting_me")
    everything = client.get(SUBMISSIONS, params={"limit": 5000}).json()
    counts = Counter(item["status"] for item in everything["items"])

    meta = client.get(f"{SUBMISSIONS}/meta").json()
    assert [tab["key"] for tab in meta["tabs"]] == ["all", "draft", "waiting_me", "final"]
    tabs = {tab["key"]: tab["count"] for tab in meta["tabs"]}
    assert tabs["all"] == meta["total"] == everything["total"]
    for key in ("draft", "waiting_me", "final"):
        assert tabs[key] == counts.get(key, 0)
        filtered = client.get(SUBMISSIONS, params={"status": key, "limit": 5000}).json()
        assert filtered["total"] == tabs[key]
        assert all(item["status"] == key for item in filtered["items"])
    assert sum(tabs[key] for key in ("draft", "waiting_me", "final")) == tabs["all"]
    assert "assigned_to_me_count" not in meta


def test_submissions_assigned_to_me(env):
    client, auth = env
    submission_id = _owned_submission(client, auth)

    anonymous_meta = client.get(f"{SUBMISSIONS}/meta").json()
    assert "assigned_to_me_count" not in anonymous_meta
    anonymous = client.get(SUBMISSIONS, params={"assigned_to_me": "true"}).json()
    assert anonymous["total"] == 0 and anonymous["items"] == []

    me_meta = client.get(f"{SUBMISSIONS}/meta", headers=_headers(auth, "me1")).json()
    assert me_meta["assigned_to_me_count"] == 1
    mine = client.get(
        SUBMISSIONS, params={"assigned_to_me": "true"}, headers=_headers(auth, "me1")
    ).json()
    assert mine["total"] == 1
    assert mine["items"][0]["submission_id"] == submission_id
    assert OWNER_EMAIL in mine["items"][0]["pdo_owner_emails"]

    other_meta = client.get(f"{SUBMISSIONS}/meta", headers=_headers(auth, "me2")).json()
    assert other_meta["assigned_to_me_count"] == 0
    other = client.get(
        SUBMISSIONS, params={"assigned_to_me": "true"}, headers=_headers(auth, "me2")
    ).json()
    assert other["total"] == 0
    assert "pdo_owner_emails" not in client.get(SUBMISSIONS).json()["items"][0]


def test_submissions_search_and_sort(env):
    client, auth = env
    _owned_submission(client, auth, name="Zz Alpha Lazy")
    _owned_submission(client, auth, name="Zz Beta Lazy")

    found = client.get(SUBMISSIONS, params={"q": "ZZ ALPHA"}).json()
    assert found["total"] == 1
    assert found["items"][0]["product_name"] == "Zz Alpha Lazy"
    assert client.get(SUBMISSIONS, params={"q": "sthi", "limit": 5000}).json()["total"] >= 2
    assert client.get(SUBMISSIONS, params={"q": "admin1"}).json()["total"] >= 2
    assert client.get(SUBMISSIONS, params={"q": "no-such-thing-xyz"}).json()["total"] == 0

    asc = client.get(
        SUBMISSIONS, params={"sort": "product_name", "dir": "asc", "limit": 5000}
    ).json()["items"]
    names = [item["product_name"].casefold() for item in asc]
    assert names == sorted(names)
    desc = client.get(
        SUBMISSIONS, params={"sort": "product_name", "dir": "desc", "limit": 5000}
    ).json()["items"]
    assert [item["product_name"].casefold() for item in desc] == sorted(names, reverse=True)

    newest_first = client.get(SUBMISSIONS, params={"limit": 5000}).json()["items"]
    stamps = [item["created_at"] for item in newest_first]
    assert stamps == sorted(stamps, reverse=True)
    oldest_first = client.get(
        SUBMISSIONS, params={"dir": "asc", "limit": 5000}
    ).json()["items"]
    assert [item["submission_id"] for item in oldest_first] == [
        item["submission_id"] for item in reversed(newest_first)
    ]
    by_status = client.get(SUBMISSIONS, params={"sort": "status", "limit": 5000}).json()["items"]
    statuses = [item["status"] for item in by_status]
    assert statuses == sorted(statuses)
    for key in ("updated_at", "prodgroup3"):
        assert client.get(SUBMISSIONS, params={"sort": key}).status_code == 200


def test_submissions_paging_and_flags(env):
    client, auth = env
    _owned_submission(client, auth, name="Zz Page One")
    _owned_submission(client, auth, name="Zz Page Two")
    full = client.get(SUBMISSIONS, params={"limit": 5000}).json()
    page = client.get(SUBMISSIONS, params={"limit": 2, "offset": 1}).json()
    assert page["total"] == full["total"]
    assert page["count"] == len(page["items"]) == 2
    assert [i["submission_id"] for i in page["items"]] == [
        i["submission_id"] for i in full["items"][1:3]
    ]
    assert all(item["can_edit"] is False for item in page["items"])

    me_page = client.get(SUBMISSIONS, params={"limit": 5000}, headers=_headers(auth, "me1")).json()
    assert any(item["can_edit"] for item in me_page["items"])


def test_submissions_without_new_params_is_unchanged(env):
    client, auth = env
    _owned_submission(client, auth)
    body = client.get(SUBMISSIONS).json()
    assert set(body) == {"count", "total", "limit", "offset", "items"}
    assert body["limit"] == 200 and body["offset"] == 0
    assert set(body["items"][0]) == {
        "submission_id", "created_at", "submitted_by", "role", "selected_modules",
        "product_name", "prodgroup3", "operation", "answer_count", "status", "updated_at",
        "can_edit", "can_final", "can_submit_ti", "can_delete",
    }
    stamps = [item["created_at"] for item in body["items"]]
    assert stamps == sorted(stamps, reverse=True)
    signed_in = client.get(SUBMISSIONS, headers=_headers(auth, "me1")).json()
    assert "pdo_owner_emails" in signed_in["items"][0]


@pytest.mark.parametrize(
    "params",
    [
        {"status": "bogus"},
        {"sort": "bogus"},
        {"dir": "up"},
        {"q": "x" * 201},
        {"limit": 0},
        {"limit": 5001},
        {"offset": -1},
        {"assigned_to_me": "perhaps"},
    ],
)
def test_submissions_validation(env, params):
    client, _auth = env
    assert client.get(SUBMISSIONS, params=params).status_code == 422


def test_submissions_meta_route_not_shadowed_by_detail(env):
    client, _auth = env
    response = client.get(f"{SUBMISSIONS}/meta")
    assert response.status_code == 200
    assert "tabs" in response.json()


# --- Actionable items -------------------------------------------------------

ACTION_ITEMS = "/pypcs/action-items"


def _action_tabs(client):
    meta = client.get(f"{ACTION_ITEMS}/meta").json()
    return meta, {tab["key"]: tab["count"] for tab in meta["tabs"]}


def test_action_items_meta_counts_match_full_data(env):
    client, _auth = env
    full = client.get(ACTION_ITEMS).json()
    groups = client.get(f"{ACTION_ITEMS}/options").json()["fields"]["module"]
    meta, counts = _action_tabs(client)

    assert set(meta) == {"tabs", "total"}
    assert meta["total"] == full["count"] == len(full["items"])
    assert [tab["key"] for tab in meta["tabs"]] == groups
    assert all(tab["label"] for tab in meta["tabs"])
    assert len([key for key in groups if key.lower().startswith("hdmx")]) == 1
    for group in groups:
        assert counts[group] == len([i for i in full["items"] if group in i["module"]])
    assert any(count for count in counts.values())


def test_action_items_page_paging_and_total(env):
    client, _auth = env
    _meta, counts = _action_tabs(client)
    group = max(counts, key=counts.get)
    full = [i for i in client.get(ACTION_ITEMS).json()["items"] if group in i["module"]]

    first = client.get(
        ACTION_ITEMS, params={"view": "page", "module": group, "limit": 2}
    ).json()
    assert set(first) == {"module", "items", "total", "limit", "offset"}
    assert first["module"] == group
    assert first["total"] == len(full) == counts[group]
    assert first["limit"] == 2 and first["offset"] == 0
    assert len(first["items"]) == min(2, first["total"])

    collected = []
    offset = 0
    while offset < first["total"]:
        page = client.get(
            ACTION_ITEMS,
            params={"view": "page", "module": group, "limit": 2, "offset": offset},
        ).json()
        collected.extend(page["items"])
        offset += 2
    assert collected == full
    beyond = client.get(
        ACTION_ITEMS, params={"view": "page", "module": group, "offset": 100000}
    ).json()
    assert beyond["items"] == [] and beyond["total"] == first["total"]


def test_action_items_page_without_module_returns_all(env):
    client, _auth = env
    full = client.get(ACTION_ITEMS).json()["items"]
    page = client.get(ACTION_ITEMS, params={"view": "page", "limit": 200}).json()
    assert page["module"] == ""
    assert page["total"] == len(full)
    assert page["items"] == full[:200]


def test_action_items_page_search(env):
    client, _auth = env
    full = client.get(ACTION_ITEMS).json()["items"]
    target = next(i for i in full if i["actionable_item"].strip())
    needle = target["actionable_item"].strip()[:12].upper()

    found = client.get(
        ACTION_ITEMS, params={"view": "page", "q": needle, "limit": 200}
    ).json()
    assert target["nbr"] in [i["nbr"] for i in found["items"]]
    assert found["total"] == len(found["items"]) or found["total"] > 200
    assert all(
        needle.lower()
        in " ".join(
            " ".join(v) if isinstance(v, list) else str(v)
            for k, v in i.items()
            if k != "version"
        ).lower()
        for i in found["items"]
    )

    list_item = next(i for i in full if i["module"])
    by_list = client.get(
        ACTION_ITEMS,
        params={"view": "page", "q": list_item["module"][0].lower(), "limit": 200},
    ).json()
    assert list_item["nbr"] in [i["nbr"] for i in by_list["items"]]

    none = client.get(
        ACTION_ITEMS, params={"view": "page", "q": "no-such-thing-xyz"}
    ).json()
    assert none["total"] == 0 and none["items"] == []


def test_action_items_page_sorting(env):
    client, _auth = env
    full = client.get(ACTION_ITEMS).json()["items"]

    def fetch(sort, direction):
        return client.get(
            ACTION_ITEMS,
            params={"view": "page", "sort": sort, "dir": direction, "limit": 200},
        ).json()["items"]

    assert [i["nbr"] for i in fetch("nbr", "asc")] == [i["nbr"] for i in full][:200]
    desc = [i["nbr"] for i in fetch("nbr", "desc")]
    assert desc == sorted((i["nbr"] for i in full), reverse=True)[:200]
    for key in ("event_id", "actionable_item", "owner"):
        values = [str(i[key]).casefold() for i in fetch(key, "asc")]
        assert [_natural(v) for v in values] == sorted(_natural(v) for v in values)
    stamps = [i["updated_at"] for i in fetch("updated_at", "desc")]
    assert stamps == sorted(stamps, reverse=True)


def test_action_items_without_view_is_unchanged(env):
    client, _auth = env
    body = client.get(ACTION_ITEMS).json()
    assert set(body) == {"count", "items"}
    nbrs = [i["nbr"] for i in body["items"]]
    assert nbrs == sorted(nbrs)
    ignored = client.get(
        ACTION_ITEMS, params={"module": "STHI", "q": "zz", "sort": "owner", "limit": 1}
    )
    assert ignored.json() == body


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": 201},
        {"limit": "abc"},
        {"offset": -1},
        {"sort": "bogus"},
        {"dir": "sideways"},
        {"q": "x" * 201},
        {"view": "other"},
        {"module": "NOPE"},
    ],
)
def test_action_items_page_validation(env, params):
    client, _auth = env
    assert client.get(ACTION_ITEMS, params={"view": "page", **params}).status_code == 422


def test_action_items_meta_route_not_shadowed(env):
    client, _auth = env
    assert "tabs" in client.get(f"{ACTION_ITEMS}/meta").json()
    assert "fields" in client.get(f"{ACTION_ITEMS}/options").json()


# --- Field options (option review) -----------------------------------------

OPTION_REVIEW = "/pypcs/option-review"
CELL_HEADERS = [
    "submission_id", "question_id", "module_key", "role", "answer", "updated_at", "updated_by",
]
SUBMISSION_HEADERS = [
    "submission_id", "created_at", "updated_at", "submitted_by", "role", "selected_modules",
    "product_name", "prodgroup3", "operation", "answer_count", "status",
]


def _append_csv(path, rows, headers):
    with path.open(encoding="utf-8-sig", newline="") as source:
        existing = list(csv.DictReader(source))
    with path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=headers)
        writer.writeheader()
        writer.writerows([*existing, *rows])


def _seed_custom_options(client, values=("ZZ Pkg Alpha", "ZZ Pkg Beta")):
    quality = client.data_dir / "QualityMatrix"
    cells, submissions = [], []
    for index, value in enumerate(values):
        sid = f"zz-opt-{index}"
        cells.append(
            {"submission_id": sid, "question_id": "package", "module_key": "", "role": "TI",
             "answer": value, "updated_at": "2026-01-01T00:00:00Z", "updated_by": "seed"}
        )
        submissions.append(
            {"submission_id": sid, "created_at": "2026-01-01T00:00:00Z", "updated_at": "",
             "submitted_by": "seed", "role": "TI", "selected_modules": "STHI",
             "product_name": f"Zz Opt Product {index}", "prodgroup3": "", "operation": "",
             "answer_count": "0", "status": "draft" if index == 0 else "final"}
        )
    _append_csv(quality / "PYPCS_SubmissionCells.csv", cells, CELL_HEADERS)
    _append_csv(quality / "PYPCS_Submissions.csv", submissions, SUBMISSION_HEADERS)


def test_option_review_meta_counts_match_list(env):
    client, auth = env
    _seed_custom_options(client)
    headers = _headers(auth, "ti1")
    meta = client.get(f"{OPTION_REVIEW}/meta", headers=headers).json()
    assert [tab["key"] for tab in meta["tabs"]] == [
        "pending", "approved", "mapped", "rejected", "all"
    ]
    counts = {tab["key"]: tab["count"] for tab in meta["tabs"]}
    for key in ("pending", "approved", "mapped", "rejected"):
        listed = client.get(OPTION_REVIEW, params={"status": key}, headers=headers).json()
        assert counts[key] == len(listed["items"]) == listed["counts"][key]
    everything = client.get(OPTION_REVIEW, params={"status": "all"}, headers=headers).json()
    assert counts["all"] == len(everything["items"])
    assert counts["pending"] >= 2


def test_option_review_permissions(env):
    client, auth = env
    assert client.get(f"{OPTION_REVIEW}/meta").status_code == 401
    assert client.get(f"{OPTION_REVIEW}/meta", headers=_headers(auth, "me1")).status_code == 403
    assert client.get(f"{OPTION_REVIEW}/meta", headers=_headers(auth, "ti1")).status_code == 200
    assert client.get(f"{OPTION_REVIEW}/meta", headers=_headers(auth, "admin1")).status_code == 200
    page = {"view": "page"}
    assert client.get(OPTION_REVIEW, params=page, headers=_headers(auth, "me1")).status_code == 403
    assert client.get(OPTION_REVIEW, params=page, headers=_headers(auth, "ti1")).status_code == 200


def test_option_review_page_includes_product_names(env):
    client, auth = env
    _seed_custom_options(client)
    headers = _headers(auth, "ti1")
    page = client.get(
        OPTION_REVIEW,
        params={"view": "page", "q": "zz pkg alpha", "limit": 10},
        headers=headers,
    ).json()
    assert set(page) == {"items", "total", "limit", "offset", "counts"}
    assert page["total"] == 1
    item = page["items"][0]
    assert item["submission_ids"] == ["zz-opt-0"]
    assert item["submissions"] == [
        {"submission_id": "zz-opt-0", "product_name": "Zz Opt Product 0",
         "module_key": "", "status": "draft"}
    ]
    final = client.get(
        OPTION_REVIEW, params={"view": "page", "q": "ZZ PKG BETA"}, headers=headers
    ).json()["items"][0]
    assert final["submissions"][0]["status"] == "final"
    assert final["submissions"][0]["product_name"] == "Zz Opt Product 1"


def test_option_review_page_paging_and_filters(env):
    client, auth = env
    _seed_custom_options(client)
    headers = _headers(auth, "ti1")
    full = client.get(OPTION_REVIEW, params={"status": "pending"}, headers=headers).json()["items"]

    collected, offset = [], 0
    while True:
        page = client.get(
            OPTION_REVIEW,
            params={"view": "page", "status": "pending", "limit": 1, "offset": offset},
            headers=headers,
        ).json()
        assert page["total"] == len(full)
        collected.extend(page["items"])
        offset += 1
        if offset >= page["total"]:
            break
    assert [(i["question_id"], i["module_key"], i["value"]) for i in collected] == [
        (i["question_id"], i["module_key"], i["value"]) for i in full
    ]

    by_question = client.get(
        OPTION_REVIEW,
        params={"view": "page", "question_id": "package", "limit": 200},
        headers=headers,
    ).json()
    assert by_question["total"] == len([i for i in full if i["question_id"] == "package"])
    assert all(i["question_id"] == "package" for i in by_question["items"])
    searched = client.get(
        OPTION_REVIEW, params={"view": "page", "q": "no-such-thing-xyz"}, headers=headers
    ).json()
    assert searched["total"] == 0


def test_option_review_without_view_is_unchanged(env):
    client, auth = env
    _seed_custom_options(client)
    headers = _headers(auth, "ti1")
    body = client.get(OPTION_REVIEW, headers=headers).json()
    assert set(body) == {"items", "counts"}
    assert all("submissions" not in item for item in body["items"])
    assert all(item["status"] == "pending" for item in body["items"])
    ignored = client.get(OPTION_REVIEW, params={"q": "zz", "limit": 1}, headers=headers)
    assert ignored.json() == body


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": 201},
        {"offset": -1},
        {"q": "x" * 201},
        {"view": "other"},
        {"status": "bogus"},
    ],
)
def test_option_review_page_validation(env, params):
    client, auth = env
    response = client.get(
        OPTION_REVIEW, params={"view": "page", **params}, headers=_headers(auth, "ti1")
    )
    assert response.status_code == 422


# --- Users ------------------------------------------------------------------

USERS_URL = "/auth/users"


def _add_account(client, username, email):
    response = client.post(
        "/auth/request-account",
        json={
            "username": username,
            "display_name": f"Name {username}",
            "email": email,
            "password": "Passw0rd!long",
        },
    )
    assert response.status_code == 201, response.text


def test_users_meta_counts_and_admin_only(env):
    client, auth = env
    _add_account(client, "pend1", "pend1@example.com")
    admin = _headers(auth, "admin1")
    meta = client.get(f"{USERS_URL}/meta", headers=admin).json()
    assert [tab["key"] for tab in meta["tabs"]] == ["pending", "active", "rejected", "disabled"]
    counts = {tab["key"]: tab["count"] for tab in meta["tabs"]}
    assert counts["pending"] == 1
    assert counts["active"] == len(USERS)
    for key, count in counts.items():
        assert len(client.get(USERS_URL, params={"status": key}, headers=admin).json()["users"]) == count

    assert client.get(f"{USERS_URL}/meta").status_code == 401
    assert client.get(f"{USERS_URL}/meta", headers=_headers(auth, "ti1")).status_code == 403
    assert client.get(f"{USERS_URL}/meta", headers=_headers(auth, "me1")).status_code == 403


def test_users_unchanged_without_paging_params(env):
    client, auth = env
    body = client.get(USERS_URL, headers=_headers(auth, "admin1")).json()
    assert set(body) == {"users"}
    assert len(body["users"]) == len(USERS)
    assert client.get(USERS_URL).status_code == 401
    assert client.get(USERS_URL, headers=_headers(auth, "ti1")).status_code == 403


def test_users_paging_and_search(env):
    client, auth = env
    admin = _headers(auth, "admin1")
    _add_account(client, "pend1", "pend1@example.com")
    everyone = client.get(USERS_URL, headers=admin).json()["users"]

    page = client.get(USERS_URL, params={"limit": 2, "offset": 1}, headers=admin).json()
    assert set(page) == {"items", "total", "limit", "offset"}
    assert page["total"] == len(everyone) and page["limit"] == 2 and page["offset"] == 1
    assert page["items"] == everyone[1:3]

    default = client.get(USERS_URL, params={"view": "page"}, headers=admin).json()
    assert default["limit"] == 50 and default["items"] == everyone

    for term, expected in (("PEND1", "pend1"), ("other.owner@", "me2"), ("name pend", "pend1")):
        found = client.get(USERS_URL, params={"q": term}, headers=admin).json()
        assert [u["username"] for u in found["items"]] == [expected]
        assert found["total"] == 1
    pending = client.get(
        USERS_URL, params={"q": "name", "status": "pending"}, headers=admin
    ).json()
    assert [u["username"] for u in pending["items"]] == ["pend1"]
    assert client.get(USERS_URL, params={"q": "nobody-xyz"}, headers=admin).json()["items"] == []


def test_users_never_expose_password_hash(env):
    client, auth = env
    admin = _headers(auth, "admin1")
    _add_account(client, "pend1", "pend1@example.com")
    for params in ({}, {"limit": 5}, {"q": "pend"}, {"view": "page"}):
        response = client.get(USERS_URL, params=params, headers=admin)
        assert "password" not in response.text
        body = response.json()
        for user in body.get("users", body.get("items", [])):
            assert "password_hash" not in user


@pytest.mark.parametrize(
    "params",
    [{"limit": 0}, {"limit": 201}, {"offset": -1}, {"q": "x" * 201}, {"view": "other"}, {"status": "bogus"}],
)
def test_users_validation(env, params):
    client, auth = env
    response = client.get(USERS_URL, params=params, headers=_headers(auth, "admin1"))
    assert response.status_code == 422


def test_users_meta_route_not_shadowed(env):
    client, auth = env
    response = client.get(f"{USERS_URL}/meta", headers=_headers(auth, "admin1"))
    assert response.status_code == 200 and "tabs" in response.json()


# --- Matrix summary fields and row detail -----------------------------------

SUMMARY_ROW_KEYS = {
    "product_key", "product_name", "prodgroup3", "module_group", "module_keys", "operations",
    "submission_status", "package", "bare_die_lid", "segment", "fab_technology",
    "review_status", "can_edit", "cells",
}
SUMMARY_CELL_KEYS = {"status", "decision_state", "comment", "updated_by", "updated_at"}


def _put_long_comment(client, auth, row, action_nbr, comment):
    response = client.put(
        f"{MATRIX}/rows",
        json={
            "product_key": row["product_key"],
            "module_group": row["module_group"],
            "cells": [{"action_nbr": int(action_nbr), "status": "Y", "comment": comment}],
        },
        headers=_headers(auth, "admin1"),
    )
    assert response.status_code == 200, response.text


def test_matrix_page_summary_keeps_only_table_fields(env):
    client, auth = env
    _owned_submission(client, auth)
    params = {"view": "page", "limit": 200}
    full = client.get(MATRIX, params=params).json()
    summary = client.get(MATRIX, params={**params, "fields": "summary"}).json()

    assert set(summary) == set(full)
    assert summary["actions"] == full["actions"]
    assert summary["total"] == full["total"]
    assert len(summary["items"]) == len(full["items"]) > 0
    for slim, row in zip(summary["items"], full["items"]):
        assert set(slim) == SUMMARY_ROW_KEYS
        assert slim["product_key"] == row["product_key"]
        assert slim["review_status"] == row["review_status"]
        assert slim["can_edit"] == row["can_edit"]
        assert set(slim["cells"]) == set(row["cells"])
        for nbr, cell in slim["cells"].items():
            assert set(cell) <= SUMMARY_CELL_KEYS | {"comment_truncated"}
            for key in SUMMARY_CELL_KEYS:
                assert cell[key] == row["cells"][nbr][key]


def test_matrix_page_summary_truncates_long_comments(env):
    client, auth = env
    _owned_submission(client, auth)
    row = client.get(MATRIX, params={"view": "page", "q": "zz LAZY owned"}).json()["items"][0]
    nbr = next(iter(row["cells"]))
    long_comment = "x" * 300
    _put_long_comment(client, auth, row, nbr, long_comment)

    params = {"view": "page", "q": "zz LAZY owned", "fields": "summary"}
    cells = client.get(MATRIX, params=params).json()["items"][0]["cells"]
    assert cells[nbr]["comment"] == "x" * 120
    assert cells[nbr]["comment_truncated"] is True
    assert all("comment_truncated" not in c for n, c in cells.items() if n != nbr)

    full = client.get(MATRIX, params={"view": "page", "q": "zz LAZY owned"}).json()["items"][0]
    assert full["cells"][nbr]["comment"] == long_comment
    assert "comment_truncated" not in full["cells"][nbr]


def test_matrix_page_default_rows_keep_full_shape(env):
    client, auth = env
    _owned_submission(client, auth)
    item = client.get(MATRIX, params={"view": "page", "limit": 1}).json()["items"][0]
    assert {"submission_id", "submission_updated_at", "foveros", "lts_ball"} <= set(item)
    cell = next(iter(item["cells"].values()))
    assert {"version", "suggested_status", "suggested_comment"} <= set(cell)


def test_matrix_page_summary_rejects_unknown_fields_value(env):
    client, _auth = env
    assert client.get(MATRIX, params={"view": "page", "fields": "bogus"}).status_code == 422


def test_matrix_row_detail_matches_full_row(env):
    client, auth = env
    _owned_submission(client, auth)
    full = client.get(MATRIX, headers=_headers(auth, "admin1")).json()
    for row in (full["rows"][0], full["rows"][-1]):
        response = client.get(
            f"{MATRIX}/row",
            params={"product_key": row["product_key"], "module_group": row["module_group"]},
            headers=_headers(auth, "admin1"),
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert set(body) == {"row", "actions"}
        detail = dict(body["row"])
        assert detail.pop("review_status") in {"needs_review", "draft", "reviewed"}
        assert detail == row
        assert detail["can_edit"] is True
        assert body["actions"] == [
            a for a in full["actions"] if row["module_group"] in a["modules"]
        ]
        for cell in detail["cells"].values():
            assert {"version", "suggested_status", "suggested_comment"} <= set(cell)


def test_matrix_row_detail_can_edit_per_user(env):
    client, auth = env
    _owned_submission(client, auth)
    row = client.get(MATRIX, params={"q": "zz LAZY owned"}).json()["rows"]
    row = next(r for r in row if r["product_name"] == "Zz Lazy Owned Product")
    params = {"product_key": row["product_key"], "module_group": row["module_group"]}
    anonymous = client.get(f"{MATRIX}/row", params=params).json()["row"]
    assert anonymous["can_edit"] is False
    owner = client.get(f"{MATRIX}/row", params=params, headers=_headers(auth, "me1")).json()["row"]
    other = client.get(f"{MATRIX}/row", params=params, headers=_headers(auth, "me2")).json()["row"]
    assert owner["can_edit"] is True
    assert other["can_edit"] is False


def test_matrix_row_detail_not_found_and_validation(env):
    client, auth = env
    row = client.get(MATRIX).json()["rows"][0]
    good = {"product_key": row["product_key"], "module_group": row["module_group"]}
    assert client.get(f"{MATRIX}/row", params={**good, "product_key": "nope"}).status_code == 404
    assert client.get(f"{MATRIX}/row", params={**good, "module_group": "NOPE"}).status_code == 404
    assert client.get(f"{MATRIX}/row", params={"module_group": good["module_group"]}).status_code == 422
    assert client.get(f"{MATRIX}/row", params={"product_key": good["product_key"]}).status_code == 422
    assert client.get(f"{MATRIX}/row", params={**good, "product_key": ""}).status_code == 422
