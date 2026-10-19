#!/usr/bin/env python3
"""Publish only the two reviewed, adapted skills to a Codex discovery directory."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


def file_hashes(root: Path) -> dict[str, str]:
    return {
        str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(root.rglob("*"))
        if p.is_file() and "__pycache__" not in p.parts and ".git" not in p.parts
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    source_root = Path(__file__).resolve().parent
    names = ("math-skill", "sympy")
    sources = {}
    for name in names:
        source = source_root/name
        target = args.target/name
        assert (source/"SKILL.md").is_file()
        manifest_path = source/"ORIGIN.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["local_changes"] = [
            p for p, sha in file_hashes(source).items()
            if p != "ORIGIN.json" and manifest["upstream_files"].get(p) != sha
        ]
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n")
        sources[name] = file_hashes(source)
        if target.exists() or target.is_symlink():
            if target.is_symlink() or file_hashes(target) != sources[name]:
                raise RuntimeError(f"Refusing to overwrite an existing different skill: {target}")

    installed = []
    for name in names:
        source = source_root/name
        target = args.target/name
        if not target.exists():
            shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__", ".git", ".venv"))
        hashes = file_hashes(target)
        assert hashes == sources[name], f"Installed content mismatch: {target}"
        installed.append({"name": name, "path": str(target.resolve()), "files": hashes})
        print(f"Installed and hash-verified {name}: {target} ({len(hashes)} files)")

    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    args.evidence.write_text(json.dumps({"installed": installed}, ensure_ascii=False, indent=2)+"\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
