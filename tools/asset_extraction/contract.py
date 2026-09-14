"""Shared structural contract; family-specific evidence stays in the manifests."""

from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, JsonValue

Family = Literal[
    "mandatory", "prohibitory", "warning", "informatory", "markings", "assemblies"
]
FAMILIES: tuple[Family, ...] = (
    "mandatory",
    "prohibitory",
    "warning",
    "informatory",
    "markings",
    "assemblies",
)


class Record(BaseModel):
    model_config = ConfigDict(strict=True, extra="allow", allow_inf_nan=False)


class Source(Record):
    id: str = Field(min_length=1)
    url: str = Field(pattern=r"^https://")
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    publisher: str = Field(min_length=1)
    collection_revision: str | None
    retrieved_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    page_count: int | None = Field(
        default=None, gt=0, validation_alias=AliasChoices("page_count", "pages")
    )
    snapshot_file: str | None = None
    snapshot_complete: bool | None = None


class Locator(Record):
    source_id: str
    pdf_page: int = Field(gt=0)
    printed_page: str | None
    drawing: str | None
    drawing_revision: str | None
    bbox_pdf_points: list[float] = Field(min_length=4, max_length=4)
    bbox_display_pdf_points: list[float] | None = Field(
        default=None, min_length=4, max_length=4
    )

    def display_box(self) -> list[float]:
        return self.bbox_display_pdf_points or self.bbox_pdf_points


class Extraction(Record):
    method: str = Field(min_length=1)
    tool: str = Field(min_length=1)
    tool_version: str = Field(min_length=1)
    recipe: str = Field(min_length=1)
    recipe_sha256: str | None = None
    script: str | None = None
    pixel_size: list[int] | None = None


class Review(Record):
    status: Literal[
        "extracted_reference",
        "cleaned_unverified",
        "verified_geometry",
        "blocked",
        "approved",
    ]
    warnings: list[str]
    content_approved: bool = False
    reuse_approved: bool = False
    approval_evidence: list[str] = []


class Asset(Record):
    id: str = Field(pattern=r"^sg\.[a-z]+\.[a-z0-9][a-z0-9.-]*$")
    name: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    representation: Literal["source_reference", "cleaned_vector", "parametric_geometry"]
    files: dict[str, str | None]
    file_sha256: dict[str, str | None]
    source: Locator
    extraction: Extraction
    dimensions_mm: dict[str, JsonValue]
    review: Review
    license_status: str
    release_ready: bool
    related_assets: list[str] = []


class Coverage(Record):
    source_id: str
    pdf_page: int | None = Field(ge=1)
    drawing: str | None
    asset_ids: list[str]
    status: Literal[
        "extracted", "reference_only", "not_applicable", "deferred", "failed"
    ]
    reason: str = Field(min_length=1)
    extraction_failures: list[str] = []


class Manifest(Record):
    schema_version: Literal[1]
    family: Family
    sources: list[Source] = Field(min_length=1)
    assets: list[Asset] = Field(min_length=1)
    coverage: list[Coverage] = Field(min_length=1)
