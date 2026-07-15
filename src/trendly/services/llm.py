"""Generic OpenAI-compatible chat client (LM Studio, Ollama, vLLM): queries and judgments."""

import json

from openai import OpenAI

from trendly.config import service
from trendly.services.topics import Topic


QUERY_PROMPT = ("You write web search queries. Given the topic profile below, produce {n} "
                "short, diverse search queries for finding recent articles. One per line, "
                "no numbering or commentary.\n\nTopic profile:\n{body}")

JUDGE_PROMPT = ("You judge article relevance for a news digest. Topic profile:\n{body}\n\n"
                "Article:\n{article}\n\nReply with JSON only: "
                '{{"relevant": true|false, "summary": "2-3 sentence summary"}}')


def client() -> OpenAI:
    """OpenAI-compatible client pointed at the configured llm endpoint."""
    conf = service("llm")
    return OpenAI(base_url=conf["url"], api_key=conf.get("api_key", "not-needed"))


def complete(prompt: str, model: str = "") -> str:
    """Single-turn chat completion; empty model falls back to the configured default."""
    response = client().chat.completions.create(
        model=model or service("llm")["model"],
        messages=[{"role": "user", "content": prompt}])
    return response.choices[0].message.content or ""


def gen_queries(topic: Topic, model: str = "", n: int = 5) -> list[str]:
    """Generate fresh search queries from a topic profile's prose."""
    text = complete(QUERY_PROMPT.format(n=n, body=topic.body), model)
    return [line.strip("-* ").strip() for line in text.splitlines() if line.strip()][:n]


def judge_article(topic: Topic, article_text: str, model: str = "") -> tuple[bool, str]:
    """Ask the llm whether an article fits the topic profile; return (relevant, summary)."""
    text = complete(JUDGE_PROMPT.format(body=topic.body, article=article_text[:6000]), model)
    try:
        verdict = json.loads(text[text.index("{"):text.rindex("}") + 1])
        return bool(verdict.get("relevant")), str(verdict.get("summary", ""))
    except (ValueError, AttributeError):
        return False, ""
