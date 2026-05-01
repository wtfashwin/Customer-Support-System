"""RAG eval harness.

Runs the golden Q/A set against the FAQ corpus and writes a report. Two
scoring modes:

  --mode live   : ingest corpus into pgvector, run /v1/rag/query for each
                  question, score answers via expected_keywords (substring
                  match; case-insensitive). Requires OpenAI + Postgres+pgvector.

  --mode dry    : skip ingestion + LLM; instead, build per-question evidence
                  by retrieving keyword-overlap snippets from the corpus and
                  score using the same keyword rubric. Deterministic, offline.
                  This is what CI runs to prove the harness wires up; a real
                  eval is run on demand with --mode live.

Exit code:
  0 if accuracy >= --threshold (default 0.6), 1 otherwise.

Output: tests/eval/report.json with per-item results and aggregate.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = Path(__file__).resolve().parent
CORPUS_DIR = EVAL_DIR / "corpus"
GOLDEN = EVAL_DIR / "golden_set.json"
DEFAULT_REPORT = EVAL_DIR / "report.json"


def load_corpus() -> dict[str, str]:
    return {p.name: p.read_text() for p in sorted(CORPUS_DIR.glob("*.txt"))}


def load_golden() -> list[dict[str, Any]]:
    return json.loads(GOLDEN.read_text())["items"]


def score_keywords(answer: str, keywords: list[str]) -> bool:
    a = answer.lower()
    return all(k.lower() in a for k in keywords)


def dry_answer(question: str, corpus: dict[str, str], source_hint: str) -> tuple[str, list[str]]:
    """Deterministic 'answer': return the source paragraph that has the most
    overlap with the question. Used for offline harness verification."""

    candidates: list[tuple[int, str, str]] = []
    q_terms = {w.lower().strip(".,!?:;") for w in question.split() if len(w) > 3}
    for fname, text in corpus.items():
        for para in text.split("\n\n"):
            score = sum(1 for w in para.lower().split() if w in q_terms)
            if source_hint and fname == source_hint:
                score += 2
            candidates.append((score, fname, para))
    candidates.sort(key=lambda x: x[0], reverse=True)
    best = candidates[0]
    return best[2], [best[1]]


async def run_live(items: list[dict[str, Any]], corpus: dict[str, str]) -> list[dict[str, Any]]:
    """Call /v1/rag/query for each question. Requires the service running
    locally with OpenAI + pgvector configured. The caller is expected to
    have ingested the corpus first."""

    import httpx

    base_url = "http://localhost:8000"
    results = []
    async with httpx.AsyncClient(timeout=60) as client:
        # Best-effort ingestion — if it fails, individual queries will still
        # report whatever the service can muster.
        try:
            await client.post(
                f"{base_url}/v1/rag/ingest",
                json={
                    "documents": [
                        {"id": fname, "text": text, "metadata": {"source": fname}}
                        for fname, text in corpus.items()
                    ]
                },
            )
        except Exception as exc:
            print(f"warn: ingestion failed: {exc}", file=sys.stderr)

        for item in items:
            try:
                resp = await client.post(
                    f"{base_url}/v1/rag/query",
                    json={"query": item["question"], "top_k": 3},
                )
                # Concatenate token events into the answer.
                answer_parts: list[str] = []
                sources: list[str] = []
                for line in resp.text.splitlines():
                    if line.startswith("event: token"):
                        # Next data: line carries the token JSON
                        pass
                    elif line.startswith("data:"):
                        try:
                            payload = json.loads(line[5:].strip())
                            if "delta" in payload:
                                answer_parts.append(payload["delta"])
                            elif "id" in payload:
                                sources.append(str(payload["id"]))
                        except json.JSONDecodeError:
                            pass
                answer = "".join(answer_parts)
            except Exception as exc:
                answer = ""
                sources = []
                print(f"warn: query failed for {item['id']}: {exc}", file=sys.stderr)
            ok = score_keywords(answer, item["expected_keywords"])
            results.append(
                {"id": item["id"], "question": item["question"], "answer": answer, "sources": sources, "ok": ok}
            )
    return results


def run_dry(items: list[dict[str, Any]], corpus: dict[str, str]) -> list[dict[str, Any]]:
    results = []
    for item in items:
        answer, sources = dry_answer(item["question"], corpus, item.get("source", ""))
        ok = score_keywords(answer, item["expected_keywords"])
        results.append(
            {"id": item["id"], "question": item["question"], "answer": answer, "sources": sources, "ok": ok}
        )
    return results


def write_report(results: list[dict[str, Any]], path: Path, threshold: float) -> dict[str, Any]:
    correct = sum(1 for r in results if r["ok"])
    accuracy = correct / len(results) if results else 0.0
    report = {
        "total": len(results),
        "correct": correct,
        "accuracy": round(accuracy, 4),
        "threshold": threshold,
        "passed": accuracy >= threshold,
        "items": results,
    }
    path.write_text(json.dumps(report, indent=2))
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["live", "dry"], default="dry")
    parser.add_argument("--threshold", type=float, default=0.6)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()

    items = load_golden()
    corpus = load_corpus()

    if args.mode == "live":
        results = asyncio.run(run_live(items, corpus))
    else:
        results = run_dry(items, corpus)

    report = write_report(results, args.report, args.threshold)
    print(
        f"eval: mode={args.mode} accuracy={report['accuracy']:.2%} "
        f"({report['correct']}/{report['total']}) threshold={args.threshold:.0%} "
        f"{'PASS' if report['passed'] else 'FAIL'}",
        file=sys.stderr,
    )
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
