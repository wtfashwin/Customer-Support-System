"""Smoke test: dry-mode eval harness produces a report and meets the
60% threshold against the bundled corpus. The live mode is exercised
manually (see tests/eval/run_eval.py)."""

from __future__ import annotations

import json
from pathlib import Path

from tests.eval.run_eval import load_corpus, load_golden, run_dry, write_report


def test_dry_mode_eval_meets_threshold(tmp_path: Path):
    items = load_golden()
    corpus = load_corpus()
    results = run_dry(items, corpus)
    report = write_report(results, tmp_path / "report.json", threshold=0.6)
    assert report["total"] == 20
    assert report["passed"], (
        f"eval below threshold: {report['accuracy']:.2%}"
    )
    saved = json.loads((tmp_path / "report.json").read_text())
    assert saved["correct"] == report["correct"]
