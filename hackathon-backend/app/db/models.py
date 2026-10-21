from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Module(Base):
    __tablename__ = "module"

    module_id: Mapped[str] = mapped_column(String, primary_key=True)
    module_key: Mapped[str] = mapped_column(String, nullable=False, default="")
    module_label: Mapped[str] = mapped_column(String, nullable=False, default="")
    enabled_default: Mapped[str] = mapped_column(String, nullable=False, default="")
    allowed_roles: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[str] = mapped_column(String, nullable=False, default="")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Question(Base):
    __tablename__ = "question"

    question_id: Mapped[str] = mapped_column(String, primary_key=True)
    source_prefix: Mapped[str] = mapped_column(String, nullable=False, default="")
    header: Mapped[str] = mapped_column(Text, nullable=False, default="")
    display_label: Mapped[str] = mapped_column(Text, nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    role: Mapped[str] = mapped_column(String, nullable=False, default="")
    field_type: Mapped[str] = mapped_column(String, nullable=False, default="")
    required_default: Mapped[str] = mapped_column(String, nullable=False, default="")
    sort_order: Mapped[str] = mapped_column(String, nullable=False, default="")
    options: Mapped[str] = mapped_column(Text, nullable=False, default="")
    dependency_rule: Mapped[str] = mapped_column(Text, nullable=False, default="")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    option_rows: Mapped[list["QuestionOption"]] = relationship(
        back_populates="question", cascade="all, delete-orphan"
    )


class QuestionOption(Base):
    __tablename__ = "question_option"

    question_id: Mapped[str] = mapped_column(
        ForeignKey("question.question_id", ondelete="CASCADE"), primary_key=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, primary_key=True)
    option_value: Mapped[str] = mapped_column(Text, nullable=False)
    question: Mapped[Question] = relationship(back_populates="option_rows")


class QuestionModule(Base):
    __tablename__ = "question_module"

    source_order: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[str] = mapped_column(String, nullable=False, default="")
    module_id: Mapped[str] = mapped_column(String, nullable=False, default="")
    module_key: Mapped[str] = mapped_column(String, nullable=False, default="")
    required: Mapped[str] = mapped_column(String, nullable=False, default="")
    visible_default: Mapped[str] = mapped_column(String, nullable=False, default="")
    source_rule: Mapped[str] = mapped_column(Text, nullable=False, default="")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")


class Operation(Base):
    __tablename__ = "operation"

    module_key: Mapped[str] = mapped_column(String, primary_key=True)
    operation: Mapped[str] = mapped_column(String, primary_key=True)
    short_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    long_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Product(Base):
    __tablename__ = "product"
    __table_args__ = (
        UniqueConstraint(
            "normalized_prodgroup3", "normalized_product_name", name="uq_product_normalized_key"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prodgroup3: Mapped[str] = mapped_column(String, nullable=False, default="")
    product_name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    normalized_prodgroup3: Mapped[str] = mapped_column(String, nullable=False)
    normalized_product_name: Mapped[str] = mapped_column(Text, nullable=False)


class Submission(Base):
    __tablename__ = "submission"

    submission_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id"), nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(String, nullable=False, default="")
    submitted_by: Mapped[str] = mapped_column(String, nullable=False, default="")
    role: Mapped[str] = mapped_column(String, nullable=False, default="")
    status: Mapped[str] = mapped_column(String, nullable=False, default="")
    operation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    answer_count: Mapped[str] = mapped_column(String, nullable=False, default="")
    selected_modules_raw: Mapped[str] = mapped_column(Text, nullable=False, default="")
    row_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )
    product_name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    prodgroup3: Mapped[str] = mapped_column(String, nullable=False, default="")
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class SubmissionModule(Base):
    __tablename__ = "submission_module"

    submission_id: Mapped[str] = mapped_column(
        ForeignKey("submission.submission_id", ondelete="CASCADE"), primary_key=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, primary_key=True)
    module_key: Mapped[str] = mapped_column(String, nullable=False)


class SubmissionAnswer(Base):
    __tablename__ = "submission_answer"
    __table_args__ = (
        UniqueConstraint(
            "submission_id", "question_id", "module_key", name="uq_submission_answer"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    submission_id: Mapped[str] = mapped_column(
        ForeignKey("submission.submission_id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[str] = mapped_column(String, nullable=False)
    module_key: Mapped[str] = mapped_column(
        String, nullable=False, default="", server_default=text("''")
    )
    role: Mapped[str] = mapped_column(String, nullable=False, default="")
    answer: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(String, nullable=False, default="")
    updated_by: Mapped[str] = mapped_column(String, nullable=False, default="")
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class SubmissionAnswerCollision(Base):
    __tablename__ = "submission_answer_collision"

    source_order: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[str] = mapped_column(
        ForeignKey("submission.submission_id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[str] = mapped_column(String, nullable=False)
    module_key: Mapped[str] = mapped_column(String, nullable=False, default="")
    role: Mapped[str] = mapped_column(String, nullable=False, default="")
    answer: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(String, nullable=False, default="")
    updated_by: Mapped[str] = mapped_column(String, nullable=False, default="")


class ActionItem(Base):
    __tablename__ = "action_item"

    nbr: Mapped[str] = mapped_column(String, primary_key=True)
    event_id: Mapped[str] = mapped_column(String, nullable=False, default="")
    ar_follow_up: Mapped[str] = mapped_column(Text, nullable=False, default="")
    actionable_item: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reference: Mapped[str] = mapped_column(Text, nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    package: Mapped[str] = mapped_column(Text, nullable=False, default="")
    bare_die_lid: Mapped[str] = mapped_column(Text, nullable=False, default="")
    foveros: Mapped[str] = mapped_column(Text, nullable=False, default="")
    segment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    xvi_tool_type: Mapped[str] = mapped_column(Text, nullable=False, default="")
    xvi_tool_comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    lts_ball: Mapped[str] = mapped_column(Text, nullable=False, default="")
    hdmx_ap_pan: Mapped[str] = mapped_column(Text, nullable=False, default="")
    owner: Mapped[str] = mapped_column(String, nullable=False, default="")
    update_by: Mapped[str] = mapped_column(String, nullable=False, default="")
    scenario: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(String, nullable=False, default="")
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ActionItemApplicability(Base):
    __tablename__ = "action_item_applicability"

    nbr: Mapped[str] = mapped_column(
        ForeignKey("action_item.nbr", ondelete="CASCADE"), primary_key=True
    )
    field: Mapped[str] = mapped_column(String, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class ProductActionDecision(Base):
    __tablename__ = "product_action_decision"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_key: Mapped[str] = mapped_column(Text, nullable=False, default="")
    module_group: Mapped[str] = mapped_column(String, nullable=False, default="")
    action_nbr: Mapped[str] = mapped_column(String, nullable=False, default="")
    status: Mapped[str] = mapped_column(String, nullable=False, default="")
    decision_state: Mapped[str] = mapped_column(String, nullable=False, default="")
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_by: Mapped[str] = mapped_column(String, nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(String, nullable=False, default="")
    product_name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    prodgroup3: Mapped[str] = mapped_column(String, nullable=False, default="")
    event_id: Mapped[str] = mapped_column(String, nullable=False, default="")
    actionable_item: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ProductBasisSTHI(Base):
    __tablename__ = "product_basis_sthi"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    product: Mapped[str] = mapped_column(Text, nullable=False, default="")
    prodgroup3: Mapped[str] = mapped_column(String, nullable=False, default="")
    module: Mapped[str] = mapped_column(String, nullable=False, default="")
    nsb: Mapped[str] = mapped_column(String, nullable=False, default="")
    mcp: Mapped[str] = mapped_column(String, nullable=False, default="")
    pkg: Mapped[str] = mapped_column(String, nullable=False, default="")
    pkg_1: Mapped[str] = mapped_column(String, nullable=False, default="")
    prd_seg: Mapped[str] = mapped_column(String, nullable=False, default="")
    xvi_tool_type: Mapped[str] = mapped_column(String, nullable=False, default="")
    fab_tech: Mapped[str] = mapped_column(String, nullable=False, default="")
    thermal_tech: Mapped[str] = mapped_column(String, nullable=False, default="")
    sw_platform: Mapped[str] = mapped_column(String, nullable=False, default="")
    lts_ball: Mapped[str] = mapped_column(String, nullable=False, default="")
    fusion_or_apse: Mapped[str] = mapped_column(String, nullable=False, default="")
    socket_type: Mapped[str] = mapped_column(String, nullable=False, default="")
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class ProductBasisLCBI(Base):
    __tablename__ = "product_basis_lcbi"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    product: Mapped[str] = mapped_column(Text, nullable=False, default="")
    prodgroup3: Mapped[str] = mapped_column(String, nullable=False, default="")
    module: Mapped[str] = mapped_column(String, nullable=False, default="")
    pkg: Mapped[str] = mapped_column(String, nullable=False, default="")
    pkg_1: Mapped[str] = mapped_column(String, nullable=False, default="")
    prd_seg: Mapped[str] = mapped_column(String, nullable=False, default="")
    fab_tech: Mapped[str] = mapped_column(String, nullable=False, default="")
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class ProductSolutionSTHI(Base):
    __tablename__ = "product_solution_sthi"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    module: Mapped[str] = mapped_column(String, nullable=False, default="STHI")
    pdid: Mapped[str] = mapped_column(String, nullable=False, default="")
    solutionid: Mapped[str] = mapped_column(String, nullable=False, default="")
    status: Mapped[str] = mapped_column(String, nullable=False, default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")


class ProductSolutionLCBI(Base):
    __tablename__ = "product_solution_lcbi"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    module: Mapped[str] = mapped_column(String, nullable=False, default="LCBI")
    pdid: Mapped[str] = mapped_column(String, nullable=False, default="")
    solutionid: Mapped[str] = mapped_column(String, nullable=False, default="")
    status: Mapped[str] = mapped_column(String, nullable=False, default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")


class SolutionCatalog(Base):
    __tablename__ = "solution_catalog"

    row_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    id: Mapped[str] = mapped_column(String, nullable=False, default="")
    module: Mapped[str] = mapped_column(String, nullable=False, default="")
    solution: Mapped[str] = mapped_column(Text, nullable=False, default="")
    key_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    excursion_related: Mapped[str] = mapped_column(Text, nullable=False, default="")


class AppUser(Base):
    __tablename__ = "app_user"

    wwid: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, default="")
    email: Mapped[str] = mapped_column(String, nullable=False, default="")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_occurred_at", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    actor_wwid: Mapped[str] = mapped_column(String, nullable=False, default="")
    actor_name: Mapped[str] = mapped_column(String, nullable=False, default="")
    actor_email: Mapped[str] = mapped_column(String, nullable=False, default="")
    actor_label: Mapped[str] = mapped_column(String, nullable=False, default="")
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    field: Mapped[str] = mapped_column(String, nullable=False, default="")
    old_value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    new_value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    request_id: Mapped[str] = mapped_column(String, nullable=False, default="")
    source: Mapped[str] = mapped_column(String, nullable=False)
    legacy_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)