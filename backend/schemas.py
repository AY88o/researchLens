"""
schemas.py — Pydantic models that define the exact JSON contract of the API.
"""

from pydantic import BaseModel, Field


class SummarySections(BaseModel):
    """The four structured summary sections returned for every paper."""

    core_problem: str = Field(
        ...,
        description="The central research question or problem the paper addresses.",
    )
    methodology: str = Field(
        ...,
        description="The research approach, datasets, models, or techniques used.",
    )
    key_findings: str = Field(
        ...,
        description="The main results, contributions, and conclusions of the paper.",
    )
    limitations: str = Field(
        ...,
        description="Drawbacks, constraints, or future work noted by the authors.",
    )


class SummaryResponse(BaseModel):
    """Top-level API response returned by POST /api/summarize."""

    filename: str = Field(..., description="Original uploaded PDF filename.")
    pages: int = Field(..., description="Number of pages in the PDF.")
    summary: SummarySections
    processing_time_s: float = Field(
        ..., description="Wall-clock seconds taken to process the request."
    )
