#!/usr/bin/env python3
"""Run the RaccDrop generator test suite.

Extracts the inline <script> from index.html, prepends browser stubs and appends
the test driver, then executes the whole thing in whichever JavaScript engine is
available. No dependencies beyond a JS engine and Python 3.

Usage:
    python3 test/run.py
    python3 test/run.py --engine node
"""
import argparse
import pathlib
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
JSC = ("/System/Library/Frameworks/JavaScriptCore.framework"
       "/Versions/A/Helpers/jsc")


def find_engine(preferred=None):
    """Return the argv prefix for an available JS engine."""
    candidates = [
        ("node", ["node"]),
        ("jsc", [JSC]),
        ("deno", ["deno", "run", "--quiet"]),
        ("bun", ["bun", "run"]),
    ]
    if preferred:
        candidates = [c for c in candidates if c[0] == preferred]
        if not candidates:
            sys.exit(f"unknown engine: {preferred}")
    for name, argv in candidates:
        if name == "jsc":
            if pathlib.Path(JSC).exists():
                return name, argv
        elif shutil.which(argv[0]):
            return name, argv
    sys.exit("no JavaScript engine found (tried node, jsc, deno, bun)")


def build_bundle(out: pathlib.Path) -> None:
    html = (ROOT / "index.html").read_text()
    start = html.index("<script>") + len("<script>")
    end = html.rindex("</script>")
    app = html[start:end]
    # index.html escapes its own closing tag for the browser; undo for the engine
    app = app.replace("<\\/script>", "</script>")
    out.write_text("\n".join([
        (HERE / "stubs.js").read_text(),
        "var document = makeDocument({});",
        app,
        (HERE / "driver.js").read_text(),
    ]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", help="force node, jsc, deno or bun")
    ap.add_argument("--keep", action="store_true",
                    help="keep the generated bundle for debugging")
    args = ap.parse_args()

    name, argv = find_engine(args.engine)
    bundle = HERE / "_bundle.js"
    build_bundle(bundle)

    print(f"engine: {name}")
    proc = subprocess.run(argv + [str(bundle)], capture_output=True, text=True)
    sys.stdout.write(proc.stdout)
    if proc.stderr.strip():
        sys.stderr.write(proc.stderr)
    if not args.keep:
        bundle.unlink(missing_ok=True)

    if proc.returncode != 0:
        return proc.returncode
    # the driver prints a trailing summary line; fail the run if anything failed
    if "0 failed" not in proc.stdout:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
