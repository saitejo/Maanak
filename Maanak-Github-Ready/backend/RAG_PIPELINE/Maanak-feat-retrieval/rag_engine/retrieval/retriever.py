import os
import asyncio

async def get_relevant_clauses(standalone_query: str, top_k: int = 3, alpha: float = 0.5) -> list[dict]:
    """
    MOCK RETRIEVER FOR RENDER FREE TIER.
    Bypasses PyTorch, SentenceTransformers, and CrossEncoders to prevent 512MB RAM OOM crashes.
    """
    return [
        {
            "is_number": "IS 1293",
            "clause_no": "General",
            "clause_title": "Overview",
            "chunk_text": "Always look for the ISI Standard Mark on electronics like plugs and laptops. Verify it using the BIS Care App. Check the voltage rating and ensure the plug pins match Indian standard socket layouts.",
            "relevance_score": 0.99
        }
    ]
