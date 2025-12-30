"""LLM prompt templates for distil generation."""


def build_system_prompt(domain: str) -> str:
    """Build the system prompt for the summarization LLM.

    Args:
        domain: The user's domain focus (e.g., "drug discovery").

    Returns:
        System prompt string.
    """
    return f"""You are an expert analyst creating quick-scan summaries for a busy
    executive in the {domain} field.

Create ultra-concise summaries optimised for rapid triage:
- Highlight only the most significant insights or breakthroughs relevant to {domain}
- One sentence per item focussing on what's new, important, or actionable
- Filter out routine content - only include items worth deeper attention
- Use precise but concise technical language
- Prioritise novelty, strategic importance, and unexpected findings

Goal: Help readers quickly decide what deserves their limited time and attention."""


def build_distil_prompt(
    items: list[dict], reading_time: int = 5, domain: str = "technology"
) -> str:
    """Build prompt for generating a distil from content items.

    Args:
        items: List of content items to include.
        reading_time: Target reading time in minutes.
        domain: Domain focus for the distil.

    Returns:
        Formatted prompt string.
    """
    prompt = f"""Generate a {reading_time}-minute weekly distil for quick scanning and prioritisation.

**Instructions:**
- Group content by theme when clear patterns emerge
- For each item: ONE concise sentence highlighting what's new/important for {domain}
- Include links as [Title](URL)
- Use bullet points for rapid scanning
- Keep summaries brief - goal is to quickly decide what deserves deeper attention
- End with "Key Takeaways" section (3-5 bullets)

**Content ({len(items)} items):**

"""
    for i, item in enumerate(items, 1):
        prompt += f"\n### Item {i}\n"
        prompt += f"**Title:** {item['title']}\n"
        prompt += f"**Link:** {item['link']}\n"
        prompt += f"**Content:** {item['content']}\n"
    return prompt
