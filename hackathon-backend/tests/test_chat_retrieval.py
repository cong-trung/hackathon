"""Tests for targeted chat retrieval over the app data files."""

import pytest

import app.services.chat_retrieval as retrieval


@pytest.fixture(autouse=True)
def _reset_retrieval_state():
    retrieval._cache.clear()
    retrieval._xrb_state.update({"rows": [], "at": 0.0, "building": False})
    yield
    retrieval._cache.clear()


@pytest.fixture()
def data_dir(tmp_path, monkeypatch):
    def write(relative: str, content: str) -> None:
        path = tmp_path / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    write(
        "QualityMatrix/PYPCS_Submissions.csv",
        "submission_id,created_at,updated_at,submitted_by,role,selected_modules,"
        "product_name,prodgroup3,operation,answer_count,status\n"
        "sub-1,d1,d2,tester,TI,STHI,DG2-128,DG128,7460,2,draft\n"
        "sub-2,d1,d2,tester,TI,LCBI,OtherProduct,OTHER,7461,1,draft\n",
    )
    write(
        "QualityMatrix/PYPCS_SubmissionCells.csv",
        "submission_id,question_id,module_key,role,answer,updated_at,updated_by\n"
        "sub-1,product_name,,TI,DG2-128,2026-10-01T00:00:00Z,tester\n"
        "sub-1,status_check,STHI,TI,pass,2026-10-01T00:00:00Z,tester\n",
    )
    write(
        "QualityMatrix/Settings/PYPCS_Modules.csv",
        "module_id,module_key,module_label,enabled_default,allowed_roles,sort_order,notes\n"
        "1,LCBI,LCBI,Y,TI,1,\n"
        "2,STHI,STHI,Y,TI,2,\n",
    )
    write(
        "QualityMatrix/Settings/PYPCS_Questions.csv",
        "question_id,source_prefix,header,display_label,description,role,field_type,"
        "required_default,sort_order,options,dependency_rule,notes\n"
        "product_name,0,Product Name,Product Name,,TI,text,Y,1,,,\n"
        "status_check,0,Status Check,Status Check,,TI,text,N,2,,,\n",
    )
    write(
        "QualityMatrix/Settings/PYPCS_QuestionModuleMap.csv",
        "question_id,module_id,module_key,required,visible_default,source_rule,notes\n"
        "product_name,1,LCBI,Y,Y,0 common,\n"
        "status_check,2,STHI,Y,Y,0 common,\n",
    )
    write(
        "View2/PYPCS_ActionItems.csv",
        "nbr,event_id,module,ar_follow_up,actionable_item,reference,description,"
        "package,bare_die_lid,foveros,segment,xvi_tool_type,xvi_tool_comment,"
        "lts_ball,hdmx_ap_pan,owner,update_by,scenario,updated_at\n"
        "1,11899213,HDMx,,CMMS golden file require to be updated during NPI.,"
        "Audit 11899213,CMMS Golden file need to be tracked,All,All,All,All,"
        "Multiple,,All,All,TRB,Luan,scenario A,2026-10-01T02:05:35Z\n"
        "2,12172696,HDMx,,Optimize Deactuate Work Flow with function check V3 valve.,"
        "DRB 12172696,Deactuate workflow,All,All,All,All,,All,All,"
        "Module Engineer,An,scenario B,2026-10-02T02:05:35Z\n",
    )
    write(
        "GL-MQR/Solution.csv",
        "ID,Module,Solution,Key Summary,Excursion Releated\n"
        "1,LCBI,Follow up with TP owner to release new TP version to re-bin 9982,"
        "Re-bin summary,\n"
        "2,STHI,Purge enable,Purge summary,\n",
    )
    write(
        "PdO/ProductSolutionMatrix_LCBI.csv",
        "PdID,SolutionID,Status,Note\n"
        "ADLN081/ ASL,1,N-reviewed,\n",
    )
    write("PdO/ProductSolutionMatrix_STHI.csv", "PdID,SolutionID,Status,Note\n")
    write(
        "TI/ProductBasisInfo_STHI.csv",
        "Product (Die code name),ProdGroup3,Module,Package,Product segment\n"
        "DG2-128 Delivery,DG128,7560,FCBGA,FVS\n",
    )
    write(
        "TI/ProductBasisInfo_LCBI.csv",
        "Product,ProdGroup3,Module,Package,Product segment\n"
        "OtherProduct,OTHER,9000,FCBGA,LCC\n",
    )
    monkeypatch.setattr(retrieval, "DATA_DIR", tmp_path)
    return tmp_path


def test_submission_lookup_returns_row_and_answers(data_dir):
    out = retrieval.get_relevant_data(
        "What is the status of the submission for product DG2-128?"
    )
    assert "DG2-128" in out
    assert "sub-1" in out
    assert "status=draft" in out
    assert "Product Name" in out


def test_action_items_by_owner(data_dir):
    out = retrieval.get_relevant_data(
        "List all action items owned by TRB with their descriptions."
    )
    assert "TRB" in out
    assert "CMMS golden file" in out


def test_solution_query_joins_pdo_rows(data_dir):
    out = retrieval.get_relevant_data(
        "Tell me about the LCBI solution to re-bin 9982."
    )
    assert "re-bin 9982" in out
    assert "ADLN081" in out


def test_questions_for_module(data_dir):
    out = retrieval.get_relevant_data("What questions does LCBI have?")
    assert "Product Name" in out
    assert "Questions visible" in out


def test_solution_module_fallback_lists_ids(data_dir):
    out = retrieval.get_relevant_data("Show me the LCBI solutions.")
    assert "ID=1" in out
    assert "re-bin 9982" in out


def test_module_terms_do_not_flood_matches(data_dir):
    out = retrieval.get_relevant_data("What questions does LCBI have?")
    assert "submissions matched" not in out


def test_unrelated_message_returns_empty(data_dir):
    assert retrieval.get_relevant_data("hello there friend") == ""


def test_xrb_missing_file_note(data_dir):
    out = retrieval.get_relevant_data("What is the status of XRB case XRB-123?")
    assert "XRB.csv was not found" in out


def test_xrb_index_build(data_dir):
    path = data_dir / "XRB.csv"
    path.write_text(
        "excursion_id,excursion_title,excursion_status,excursion_type,"
        "module_detected,create_date,problem_owner_name,responsible_func_area,"
        "root_cause_fix_summary,problem_desc\n"
        "XRB-1,Leak issue,Closed,Process,STHI,2026-01-02,Anh,Module,"
        "fix valve,desc\n",
        encoding="utf-8",
    )
    rows = retrieval._build_xrb_index()
    assert len(rows) == 1
    assert rows[0]["excursion_id"] == "XRB-1"
    assert "leak" in rows[0]["_search"]
