"""
parser.py — PDF text extraction and cleaning pipeline.

Steps
-----
1. Extract raw text from every page using pypdf.
2. Remove page headers/footers detected by high frequency across pages.
3. Strip the bibliography / references section (everything after the last
   major "References" heading).
4. Return the cleaned text and page count.
"""

from __future__ import annotations

import io
import re
from collections import Counter
from typing import NamedTuple

from pypdf import PdfReader


# ── Public types ──────────────────────────────────────────────────────────────

class ParsedDocument(NamedTuple):
    pages: int
    text: str


# ── Constants ─────────────────────────────────────────────────────────────────

# A line is considered a header/footer candidate if it appears on more than
# this fraction of pages.
_HEADER_FOOTER_THRESHOLD = 0.4

# Regex patterns that mark the start of a References/Bibliography section.
_REFERENCE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^\s*references\s*$", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\s*bibliography\s*$", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\s*\d+\.\s+references\s*$", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\s*\[references\]\s*$", re.IGNORECASE | re.MULTILINE),
]

# Minimum number of pages before we bother detecting headers/footers.
_MIN_PAGES_FOR_HF_DETECTION = 3


# ── Internal helpers ──────────────────────────────────────────────────────────

def _extract_pages(reader: PdfReader) -> list[str]:
    """Return a list of raw text strings, one per page."""
    pages: list[str] = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        pages.append(text)
    return pages


def _detect_repeated_lines(pages: list[str], threshold: float) -> set[str]:
    """
    Find lines that appear on a large fraction of pages (likely headers/footers).

    We normalise each line (strip + lower) before counting so that minor
    spacing differences do not prevent detection.
    """
    if len(pages) < _MIN_PAGES_FOR_HF_DETECTION:
        return set()

    total_pages = len(pages)
    line_page_count: Counter[str] = Counter()

    for page_text in pages:
        # Use a set so each line is counted at most once per page.
        seen_on_page: set[str] = set()
        for raw_line in page_text.splitlines():
            normalised = raw_line.strip().lower()
            if normalised and normalised not in seen_on_page:
                seen_on_page.add(normalised)
                line_page_count[normalised] += 1

    repeated: set[str] = set()
    for line, count in line_page_count.items():
        if count / total_pages >= threshold:
            repeated.add(line)

    return repeated


def _remove_repeated_lines(pages: list[str], repeated: set[str]) -> list[str]:
    """Strip detected header/footer lines from every page."""
    cleaned: list[str] = []
    for page_text in pages:
        kept_lines: list[str] = []
        for raw_line in page_text.splitlines():
            if raw_line.strip().lower() not in repeated:
                kept_lines.append(raw_line)
        cleaned.append("\n".join(kept_lines))
    return cleaned


def _cut_references(text: str) -> str:
    """
    Remove everything from the last occurrence of a References heading onward.
    We choose the *last* match so we do not accidentally cut mid-paper sections
    that happen to reference related work with a similar heading.
    """
    last_match_end = -1
    for pattern in _REFERENCE_PATTERNS:
        for match in pattern.finditer(text):
            if match.start() > last_match_end:
                last_match_end = match.start()

    if last_match_end == -1:
        return text

    # Only cut if there is meaningful content before the references heading.
    content_before = text[:last_match_end].strip()
    if len(content_before) > 500:
        return content_before

    return text


def _normalise_whitespace(text: str) -> str:
    """Collapse excessive blank lines and strip trailing whitespace."""
    # Replace 3+ consecutive newlines with exactly two.
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Strip trailing spaces on each line.
    lines = [line.rstrip() for line in text.splitlines()]
    return "\n".join(lines).strip()


# ── Public API ────────────────────────────────────────────────────────────────

def parse_pdf(file_bytes: bytes) -> ParsedDocument:
    """
    Parse a PDF from raw bytes and return a cleaned document.

    Parameters
    ----------
    file_bytes:
        Raw bytes of the uploaded PDF file.

    Returns
    -------
    ParsedDocument
        A named tuple with (pages: int, text: str).

    Raises
    ------
    ValueError
        If the PDF cannot be opened or yields no extractable text.
    """
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as exc:
        raise ValueError(f"Could not open PDF: {exc}") from exc

    page_count = len(reader.pages)
    if page_count == 0:
        raise ValueError("The PDF contains no pages.")

    # Step 1: Extract raw text per page.
    pages = _extract_pages(reader)

    # Step 2: Detect and remove repeated header/footer lines.
    repeated = _detect_repeated_lines(pages, _HEADER_FOOTER_THRESHOLD)
    if repeated:
        pages = _remove_repeated_lines(pages, repeated)

    # Step 3: Join all pages and cut the references section.
    full_text = "\n\n".join(pages)
    full_text = _cut_references(full_text)

    # Step 4: Normalise whitespace.
    full_text = _normalise_whitespace(full_text)

    if len(full_text) < 100:
        raise ValueError(
            "Could not extract meaningful text from this PDF. "
            "It may be a scanned image PDF without embedded text."
        )

    return ParsedDocument(pages=page_count, text=full_text)
