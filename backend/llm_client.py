"""
llm_client.py — LLM inference layer using the Groq API (OpenAI-compatible).

A valid GROQ_API_KEY must be set.  The server will refuse to start without it.
"""

from __future__ import annotations

import json
import logging
import re
import textwrap

import httpx

from backend.config import settings
from backend.schemas import SummarySections

logger = logging.getLogger(__name__)

# ── Prompt ────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = textwrap.dedent(
    """
    You are an expert academic research assistant specialising in summarising
    computer science and engineering research papers.

    You will be given the body text of a research paper (references removed).
    Your task is to produce a structured summary with EXACTLY four sections.

    Respond ONLY with a valid JSON object with these four keys and no other text:
    {
      "core_problem":  "<2-4 sentences describing the central problem or research gap>",
      "methodology":   "<2-4 sentences describing datasets, models, algorithms, or experimental setup>",
      "key_findings":  "<2-4 sentences on the main results, contributions, or conclusions>",
      "limitations":   "<1-3 sentences on drawbacks, constraints, or future work>"
    }

    Rules:
    - Do NOT include markdown fences or any text outside the JSON object.
    - If a section is genuinely not addressed, write "Not explicitly stated in the paper."
    - Keep each value under 120 words.
    """
).strip()

_USER_TEMPLATE = (
    "Summarise the following research paper text:\n\n"
    "---BEGIN PAPER---\n{text}\n---END PAPER---"
)

# Truncate input text to avoid exceeding context window (~6 000 tokens ≈ 24 000 chars)
_MAX_INPUT_CHARS = 24_000


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_llm_json(raw: str) -> SummarySections:
    """
    Extract and validate the JSON object from the LLM's raw response string.
    Handles minor formatting issues such as markdown code fences.
    """
    # Strip markdown fences if the model wraps output in ```json ... ```
    raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()

    # Find the outermost JSON object.
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in LLM response.")

    data = json.loads(raw[start:end])
    return SummarySections(**data)


# ── Public API ────────────────────────────────────────────────────────────────

async def summarise(text: str) -> SummarySections:
    """
    Summarise the given paper text using the Groq API.

    Raises
    ------
    RuntimeError
        If the API call fails for any reason.
    """
    truncated_text = text[:_MAX_INPUT_CHARS]
    if len(text) > _MAX_INPUT_CHARS:
        logger.info(
            "Input text truncated from %d to %d characters for LLM context.",
            len(text),
            _MAX_INPUT_CHARS,
        )

    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _USER_TEMPLATE.format(text=truncated_text)},
        ],
        "temperature": 0.2,
        "max_tokens": 600,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_s) as client:
            response = await client.post(
                f"{settings.llm_base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()

        data = response.json()
        raw_content: str = data["choices"][0]["message"]["content"]
        result = _parse_llm_json(raw_content)
        logger.info("LLM summarisation successful.")
        return result

    except httpx.HTTPStatusError as exc:
        logger.error(
            "Groq API returned HTTP %d. Detail: %s",
            exc.response.status_code,
            exc.response.text[:500],
        )
        raise RuntimeError(
            f"Groq API error {exc.response.status_code}: {exc.response.text[:300]}"
        ) from exc

    except httpx.TimeoutException as exc:
        logger.error("Groq API request timed out.")
        raise RuntimeError("Request to Groq API timed out. Please try again.") from exc

    except Exception as exc:
        logger.error("Unexpected error during LLM call: %s: %s", type(exc).__name__, exc)
        raise RuntimeError(f"LLM call failed: {exc}") from exc
