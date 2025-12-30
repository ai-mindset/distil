"""LLM interface using LiteLLM for unified API access."""

from litellm import completion

from distil.config import TIMEOUT


def generate_distil(
    system_prompt: str,
    user_prompt: str,
    model: str = "ollama/mistral:latest",
) -> str:
    """Generate distil using LiteLLM.

    Args:
        system_prompt: System prompt defining the assistant's role.
        user_prompt: User prompt with content to summarize.
        model: LiteLLM model string (e.g., "ollama/mistral",
               "anthropic/claude-sonnet-4-20250514").

    Returns:
        Generated distil markdown string.
    """
    try:
        print(f"Calling LLM with model: {model}")
        print(f"System prompt length: {len(system_prompt)} chars")
        print(f"User prompt length: {len(user_prompt)} chars")

        response = completion(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            timeout=TIMEOUT,
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"LLM call failed: {type(e).__name__}: {e}")
        raise


def generate_distil_batched(
    system_prompt: str,
    items: list[dict],
    model: str = "ollama/mistral:latest",
    batch_size: int = 3,
    reading_time: int = 5,
    domain: str = "technology",
) -> str:
    """Generate distil using batch processing to avoid context limits.

    Args:
        system_prompt: System prompt defining the assistant's role.
        items: List of content items to summarize.
        model: LiteLLM model string.
        batch_size: Number of items to process per batch.
        reading_time: Target reading time in minutes.
        domain: Domain focus for content summarisation.

    Returns:
        Generated distil markdown string.
    """
    if not items:
        return "No items to process."

    # If items are few enough, process normally
    if len(items) <= batch_size:
        from distil.prompts import build_distil_prompt

        user_prompt = build_distil_prompt(items, reading_time, domain)

        print(f"Processing {len(items)} items normally (no batching needed)")
        return generate_distil(system_prompt, user_prompt, model)

    # Process in batches
    batch_summaries = []

    for i in range(0, len(items), batch_size):
        batch_items = items[i : i + batch_size]
        batch_number = (i // batch_size) + 1
        total_batches = (len(items) + batch_size - 1) // batch_size

        print(
            f"Processing batch {batch_number}/{total_batches} ({len(batch_items)} items)"
        )

        # Create batch prompt
        batch_prompt = _build_batch_prompt(batch_items, batch_number)

        # Generate summary for this batch
        batch_summary = generate_distil(system_prompt, batch_prompt, model)
        batch_summaries.append(batch_summary)

    # Consolidate all batch summaries into final distil
    print("Consolidating batch summaries into final distil")
    consolidation_prompt = _build_consolidation_prompt(batch_summaries, reading_time)

    return generate_distil(system_prompt, consolidation_prompt, model)


def _build_batch_prompt(items: list[dict], batch_number: int) -> str:
    """Build prompt for processing a single batch of items."""
    # Create a brief description of what this batch contains
    title_hints = []
    for item in items[:2]:  # Use first 2 titles for context
        title_words = item['title'].split()[:3]  # First 3 words
        title_hints.append(' '.join(title_words))

    if len(items) > 2:
        batch_desc = f"topics including {title_hints[0]}, {title_hints[1]}, etc."
    else:
        batch_desc = f"topics: {', '.join(title_hints)}"

    prompt = f"""Summarise this set of content items about {batch_desc}

**Instructions:**
- Create concise summaries highlighting key insights and strategic relevance
- Group by theme where possible
- Include titles and links: [Title](URL)
- Use bullet points for readability
- Focus on what's new, important, or actionable
- Do NOT mention "batch" in your response

**Content ({len(items)} items):**

"""
    for i, item in enumerate(items, 1):
        prompt += f"\n### Item {i}\n"
        prompt += f"**Title:** {item['title']}\n"
        prompt += f"**Link:** {item['link']}\n"
        prompt += f"**Content:** {item['content']}\n"

    return prompt


def _build_consolidation_prompt(batch_summaries: list[str], reading_time: int) -> str:
    """Build prompt for consolidating batch summaries into final distil."""
    prompt = (
        f"Consolidate these batch summaries into a final {reading_time}-minute "
        "weekly distil report."
    )
    prompt += """

**Instructions:**
- Merge related themes across batches
- Maintain all links and specific details
- Create coherent narrative flow
- End with "Key Takeaways" section (3-5 bullets)
- Target {reading_time} minutes reading time
- Use markdown formatting with clear sections

**Batch Summaries to Consolidate:**

"""
    for i, summary in enumerate(batch_summaries, 1):
        prompt += f"\n## Batch {i} Summary\n{summary}\n"

    return prompt


def generate_distil_streaming(
    system_prompt: str,
    user_prompt: str,
    model: str = "ollama/mistral:latest",
    show_progress: bool = True,
):
    """Generate distil using LiteLLM with streaming support.

    Args:
        system_prompt: System prompt defining the assistant's role.
        user_prompt: User prompt with content to summarize.
        model: LiteLLM model string.
        show_progress: Whether to yield progress updates.

    Yields:
        String chunks as they are generated, with optional progress updates.
    """
    try:
        print(f"Calling LLM with streaming for model: {model}")
        print(f"System prompt length: {len(system_prompt)} chars")
        print(f"User prompt length: {len(user_prompt)} chars")

        response = completion(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            stream=True,
            timeout=TIMEOUT,
        )

        chunk_count = 0

        for chunk in response:
            if hasattr(chunk, "choices") and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                if hasattr(delta, "content") and delta.content:
                    chunk_count += 1
                    # Just yield the actual content - no progress indicators
                    yield delta.content

        print(f"Streaming completed. Total chunks: {chunk_count}")

    except Exception as e:
        print(f"Streaming LLM call failed: {type(e).__name__}: {e}")
        yield f"\n\n❌ Error: {str(e)}"


def generate_distil_batched_streaming(
    system_prompt: str,
    items: list[dict],
    model: str = "ollama/mistral:latest",
    batch_size: int = 3,
    reading_time: int = 5,
):
    """Generate distil using batch processing with streaming support."""
    if not items:
        yield "❌ No items to process."
        return

    # If items are few enough, process normally
    if len(items) <= batch_size:
        from distil.prompts import build_distil_prompt

        user_prompt = build_distil_prompt(items, reading_time)

        for chunk in generate_distil_streaming(
            system_prompt, user_prompt, model, show_progress=False
        ):
            yield chunk
        return

    # Process in batches
    batch_summaries = []
    total_batches = (len(items) + batch_size - 1) // batch_size

    for i in range(0, len(items), batch_size):
        batch_items = items[i : i + batch_size]
        batch_number = (i // batch_size) + 1

        # Create batch prompt
        batch_prompt = _build_batch_prompt(batch_items, batch_number)

        # Stream the batch summary
        batch_summary = ""
        for chunk in generate_distil_streaming(
            system_prompt, batch_prompt, model, show_progress=False
        ):
            batch_summary += chunk
            yield chunk

        batch_summaries.append(batch_summary)

        # Add separator between batches for clarity
        if batch_number < total_batches:
            yield "\n\n---\n\n"

    # Consolidate all batch summaries
    yield "\n\n"

    consolidation_prompt = _build_consolidation_prompt(batch_summaries, reading_time)

    for chunk in generate_distil_streaming(
        system_prompt, consolidation_prompt, model, show_progress=False
    ):
        yield chunk


def test_connection(model: str = "anthropic/claude-sonnet-4-20250514") -> bool:
    """Test LLM connection with a simple prompt.

    Args:
        model: LiteLLM model string to test.

    Returns:
        True if connection successful, False otherwise.
    """
    try:
        response = completion(
            model=model,
            messages=[{"role": "user", "content": "Reply with 'ok'"}],
            max_tokens=10,
        )
        return bool(response.choices[0].message.content)
    except Exception as e:
        print(f"Connection test failed: {e}")
        return False
