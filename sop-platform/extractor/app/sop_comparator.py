"""Compare two SOPs step-by-step using Gemini semantic analysis."""
import json
import logging
import os

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

_PROMPT = """You are comparing two versions of a Standard Operating Procedure (SOP).

Base SOP steps (original recording):
{base_steps_json}

Updated SOP steps (newer recording):
{updated_steps_json}

Match each step semantically. Return ONLY valid JSON with no markdown, no code fences.
The JSON must have one key "matches" containing an array.

Each item must have:
- "status": one of "unchanged" | "changed" | "added" | "removed"
- "base_step_id": string (null for "added" steps)
- "updated_step_id": string (null for "removed" steps)
- "change_summary": string (1 sentence, only for "changed" — omit for others)

Rules:
- "unchanged": title and description are functionally identical
- "changed": same action, different details (e.g. button label changed, new field added)
- "added": appears only in updated SOP (base_step_id is null)
- "removed": appears only in base SOP (updated_step_id is null)
- Each step ID appears in at most one match
- Preserve the logical order of the process
"""


def compare_sop_steps(base_steps: list[dict], updated_steps: list[dict]) -> dict:
    """
    Call Gemini to semantically compare two lists of SOP steps.
    Returns {"matches": [...]} structured diff.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in environment")

    client = genai.Client(api_key=api_key)

    prompt = _PROMPT.format(
        base_steps_json=json.dumps(base_steps, indent=2),
        updated_steps_json=json.dumps(updated_steps, indent=2),
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        raw = response.text.strip()
        result = json.loads(raw)
        if "matches" not in result:
            raise ValueError("Gemini response missing 'matches' key")
        logger.info(
            "SOP compare: base=%d steps, updated=%d steps, matches=%d",
            len(base_steps), len(updated_steps), len(result["matches"]),
        )
        return result
    except json.JSONDecodeError as exc:
        logger.error("Gemini returned invalid JSON: %s", exc)
        raise RuntimeError(f"Gemini returned invalid JSON: {exc}") from exc
