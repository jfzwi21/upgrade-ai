#!/usr/bin/env python3
"""Create conservative, human-reviewable recovery suggestions from CI logs."""

from __future__ import annotations

import re
import sys
from pathlib import Path

SUGGESTIONS = {
    "Jest": "Run the failing test alone with `yarn jest <path> --runInBand`; inspect the first assertion/setup error before changing behavior.",
    "TypeScript": "Fix the first reported type error and rerun `yarn typecheck`; avoid broad `any` casts as a recovery shortcut.",
    "ESLint": "Apply the repository ESLint rule to the reported file, then rerun `yarn lint`.",
    "Android debug build": "Inspect the first Gradle `What went wrong` block, JDK/SDK/NDK versions, and native package registration; rerun `:app:assembleDebug` after a narrow fix.",
}


def analyze(log: str) -> str:
    sections = re.split(r"(?m)^===== (.+?) =====\s*$", log)
    failures: list[tuple[str, list[str]]] = []
    for index in range(1, len(sections), 2):
        name = sections[index].strip()
        body = sections[index + 1] if index + 1 < len(sections) else ""
        result = re.search(r"\[exit=(\d+)\]", body)
        if not result or int(result.group(1)) == 0:
            continue
        relevant = [
            line.strip()
            for line in body.splitlines()
            if re.search(r"(error TS\d+|\bError:|FAIL |FAILED|What went wrong:|Could not resolve|Could not find|Execution failed)", line, re.I)
        ][:12]
        failures.append((name, relevant))

    report = [
        "# Self-heal CI: failure diagnosis",
        "",
        "This report suggests narrow next steps. It does not edit source files, create commits, or push generated fixes.",
        "",
    ]
    if not failures:
        report += ["No structured failing section was found. Inspect the complete verification log.", ""]
    for name, lines in failures:
        report += [f"## {name}", "", SUGGESTIONS.get(name, "Inspect the command output and make a small, tested change."), ""]
        if lines:
            report += ["Relevant log lines:", "```text", *lines, "```", ""]
    return "\n".join(report) + "\n"


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("verification.log")
    destination = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("self-heal-diagnosis.md")
    log = source.read_text(errors="replace") if source.exists() else "Verification log is unavailable."
    destination.write_text(analyze(log))
    print(destination.read_text())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
