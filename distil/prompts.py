"""LLM prompt templates for distil generation."""


def build_system_prompt(domain: str) -> str:
    """Build the system prompt for the summarization LLM.

    Args:
        domain: The user's domain focus (e.g., "drug discovery").

    Returns:
        System prompt string.
    """
    return f"""You are an expert analyst synthesising technical content for a busy
    executive in the {domain} field.

Analyse content and provide concise, high-value summaries that:
- Highlight key insights, breakthroughs, or trends relevant to {domain}
- Identify actionable implications or business opportunities
- Note novel methodologies, unexpected findings, or paradigm shifts
- Filter routine updates unless strategically significant
- Use precise technical language appropriate for domain experts

Focus on: What matters? Why does it matter? What's new or surprising?"""


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
    prompt = f"""Generate a {reading_time}-minute weekly distil markdown report.

**Instructions:**
- Group content by theme (identify themes from the content itself)
- For each item: 2-3 sentences highlighting strategic relevance to {domain}
- Include links as [Title](URL)
- Use bullet points for readability
- End with "Key Takeaways" section (3-5 bullets)

**Content ({len(items)} items):**

"""
    for i, item in enumerate(items, 1):
        prompt += f"\n### Item {i}\n"
        prompt += f"**Title:** {item['title']}\n"
        prompt += f"**Link:** {item['link']}\n"
        prompt += f"**Content:** {item['content']}\n"
    return prompt
