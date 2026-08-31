"""Module/solution field configuration: CSV header <-> API field mapping."""

from typing import Any

from fastapi import HTTPException

MODULE_CONFIG = {
    "STHI": {
        "file": "ProductBasisInfo_STHI.csv",
        "fields": [
            "product",
            "prodgroup3",
            "module",
            "nsb",
            "mcp",
            "pkg",
            "pkg_1",
            "prd_seg",
            "xvi_tool_type",
            "fab_tech",
            "thermal_tech",
            "sw_platform",
            "lts_ball",
            "fusion_or_apse",
            "socket_type",
        ],
        "original_to_fe": {
            "Product (Die code name)": "product",
            "ProdGroup3": "prodgroup3",
            "Module": "module",
            "NSB? \n(Non-Synergy-Build)": "nsb",
            "NSB?\n(Non-Synergy-Build)": "nsb",
            "NSB? (Non-Synergy-Build)": "nsb",
            "MCP (Multi chip package - products have multiple dies?)": "mcp",
            "Package": "pkg",
            "Package (1)": "pkg_1",
            "Product segment": "prd_seg",
            "xVI tool type": "xvi_tool_type",
            "Fab Technology": "fab_tech",
            "Thermal Technology": "thermal_tech",
            "SW platform": "sw_platform",
            "LTS ball": "lts_ball",
            "Fusion or Apse": "fusion_or_apse",
            "Socket Type": "socket_type",
        },
        "fe_to_original": {
            "product": "Product (Die code name)",
            "prodgroup3": "ProdGroup3",
            "module": "Module",
            "nsb": "NSB? \n(Non-Synergy-Build)",
            "mcp": "MCP (Multi chip package - products have multiple dies?)",
            "pkg": "Package",
            "pkg_1": "Package (1)",
            "prd_seg": "Product segment",
            "xvi_tool_type": "xVI tool type",
            "fab_tech": "Fab Technology",
            "thermal_tech": "Thermal Technology",
            "sw_platform": "SW platform",
            "lts_ball": "LTS ball",
            "fusion_or_apse": "Fusion or Apse",
            "socket_type": "Socket Type",
        },
    },
    "LCBI": {
        "file": "ProductBasicInfo_LCBI.csv",
        "fields": [
            "product",
            "prodgroup3",
            "module",
            "pkg",
            "pkg_1",
            "prd_seg",
            "fab_tech",
        ],
        "original_to_fe": {
            "Product": "product",
            "ProdGroup3": "prodgroup3",
            "Module": "module",
            "Package": "pkg",
            "Package (1)": "pkg_1",
            "Product segment": "prd_seg",
            "Fab Technology": "fab_tech",
        },
        "fe_to_original": {
            "product": "Product",
            "prodgroup3": "ProdGroup3",
            "module": "Module",
            "pkg": "Package",
            "pkg_1": "Package (1)",
            "prd_seg": "Product segment",
            "fab_tech": "Fab Technology",
        },
    },
}

SOLUTION_CONFIG = {
    "file": "Solution.csv",
    "fields": ["id", "module", "solution", "key_summary", "excursion_related"],
    "original_to_fe": {
        "ID": "id",
        "Module": "module",
        "Solution": "solution",
        "Key Summary": "key_summary",
        "Excursion Releated": "excursion_related",
        "Excursion Related": "excursion_related",
    },
    "fe_to_original": {
        "id": "ID",
        "module": "Module",
        "solution": "Solution",
        "key_summary": "Key Summary",
        "excursion_related": "Excursion Releated",
    },
}

FIELD_LABELS = {
    "product": "Product",
    "prodgroup3": "ProdGroup3",
    "module": "Module",
    "nsb": "NSB",
    "mcp": "MCP",
    "pkg": "Package",
    "pkg_1": "Package (1)",
    "prd_seg": "Product Segment",
    "xvi_tool_type": "xVI Tool Type",
    "fab_tech": "Fab Technology",
    "thermal_tech": "Thermal Technology",
    "sw_platform": "SW Platform",
    "lts_ball": "LTS Ball",
    "fusion_or_apse": "Fusion or Apse",
    "socket_type": "Socket Type",
    "id": "ID",
    "solution": "Solution",
    "key_summary": "Key Summary",
    "excursion_related": "Excursion Related",
}

MODULE_SOLUTION_CONFIG = {
    "STHI": {
        "file": "ProductSolutionMatrix_STHI.csv",
        "fields": ["pdid", "solutionid", "status", "note"],
        "original_to_fe": {
            "PdID": "pdid",
            "SolutionID": "solutionid",
            "Status": "status",
            "Note": "note",
        },
        "fe_to_original": {
            "pdid": "PdID",
            "solutionid": "SolutionID",
            "status": "Status",
            "note": "Note",
        },
    },
    "LCBI": {
        "file": "ProductSolutionMatrix_LCBI.csv",
        "fields": ["pdid", "solutionid", "status", "note"],
        "original_to_fe": {
            "PdID": "pdid",
            "SolutionID": "solutionid",
            "Status": "status",
            "Note": "note",
        },
        "fe_to_original": {
            "pdid": "PdID",
            "solutionid": "SolutionID",
            "status": "Status",
            "note": "Note",
        },
    },
}


def get_module_config(module: str) -> dict[str, Any]:
    key = module.upper().strip()
    if key not in MODULE_CONFIG:
        raise HTTPException(status_code=404, detail=f"Unsupported module '{module}'")
    return MODULE_CONFIG[key]


def get_module_solution_config(module: str) -> dict[str, Any]:
    key = module.upper().strip()
    if key not in MODULE_SOLUTION_CONFIG:
        raise HTTPException(status_code=404, detail=f"Unsupported module '{module}'")
    return MODULE_SOLUTION_CONFIG[key]


def field_schema(config: dict[str, Any]) -> dict[str, Any]:
    fields = []
    for key in config["fields"]:
        label = FIELD_LABELS.get(key, key)
        fields.append(
            {
                "key": key,
                "label": label,
                "type": "string",
                "required": key not in {"key_summary", "excursion_related"},
                "minLength": 1
                if key not in {"key_summary", "excursion_related"}
                else 0,
                "placeholder": label,
                "errorMessage": f"{label} is required"
                if key not in {"key_summary", "excursion_related"}
                else "",
            }
        )
    return {"fields": fields}
