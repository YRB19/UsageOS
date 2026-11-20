#!/usr/bin/env python3
"""
check_extension.py - prove an extension tree is loadable and that the UsageOS fork is wired in.
Used by sync_extension.py before it replaces ./extension, and runnable on its own:
    python3 scripts/check_extension.py            # checks ./extension
Catches the failure modes this project has actually hit: a file the manifest references that does not
exist ("Could not load manifest"), syntax errors, relative imports that resolve to nothing, a fork hook
that did not land, and a message type the popup/options/notes UI sends that no background handler answers.
"""
import json, re, subprocess, sys, tempfile
from pathlib import Path

FORK_UI = ["popup.js", "dashboard.js", "options.js", "content-components/fork_notes.js"]
REQUIRED_GLOBALS = {"sendBackgroundMessage": "content", "getActiveOrgId": "content"}


def is_module(src):
    return bool(re.search(r"^\s*(import\s|import\(|export\s)", src, re.M))


def check_tree(tree: Path, ovl: Path) -> bool:
    tree, errs, warns = Path(tree), [], []
    ok = lambda m: print(f"  ok    {m}")

    # 1. JSON parses
    for p in tree.rglob("*.json"):
        if "node_modules" in p.parts: continue
        try: json.loads(p.read_text())
        except Exception as e: errs.append(f"invalid JSON: {p.relative_to(tree)} ({e})")

    # 2. manifest references
    manifests = sorted(tree.glob("manifest*.json"))
    if not (tree / "manifest.json").exists(): errs.append("manifest.json missing (Chrome needs this exact filename)")
    for mf in manifests:
        m = json.loads(mf.read_text()); refs = []
        for cs in m.get("content_scripts", []): refs += cs.get("js", []) + cs.get("css", [])
        bg = m.get("background", {})
        refs += [bg["service_worker"]] if "service_worker" in bg else bg.get("scripts", [])
        act = m.get("action", {}); refs += [act.get("default_popup")] if act.get("default_popup") else []
        if isinstance(act.get("default_icon"), str): refs.append(act["default_icon"])
        if m.get("options_ui", {}).get("page"): refs.append(m["options_ui"]["page"])
        refs += [v for v in (m.get("icons") or {}).values()]
        war = [r for w in m.get("web_accessible_resources", []) for r in w.get("resources", []) if "*" not in r]
        for r in refs:
            if r and not (tree / r).exists():
                (errs if mf.name in ("manifest.json", "manifest_chrome.json") else warns).append(f"{mf.name}: references missing file {r}")
        for r in war:   # ignored by browsers when absent (upstream lists default-config.json itself): warn only
            if not (tree / r).exists() and mf.name == "manifest_chrome.json":
                warns.append(f"{mf.name}: web_accessible_resources lists missing {r} (harmless)")
    ok(f"manifest references ({len(manifests)} manifests)") if not errs else None

    # 3. html local script/link refs
    for h in tree.glob("*.html"):
        for ref in re.findall(r'<(?:script|link)[^>]+(?:src|href)="([^"#?]+)"', h.read_text()):
            if not ref.startswith(("http", "//", "data:")) and not (tree / ref).exists():
                errs.append(f"{h.name}: references missing file {ref}")

    # 4+5. JS syntax and relative imports
    n = 0
    for js in tree.rglob("*.js"):
        rel = js.relative_to(tree).as_posix()
        if rel.startswith(("lib/", "node_modules/")) or ".min." in js.name: continue
        src = js.read_text(errors="replace"); n += 1
        mod = is_module(src)
        with tempfile.NamedTemporaryFile("w", suffix=".mjs" if mod else ".js", delete=False) as t:
            t.write(src); tp = t.name
        r = subprocess.run(["node", "--check", tp], capture_output=True, text=True); Path(tp).unlink()
        if r.returncode: errs.append(f"syntax error in {rel}: {r.stderr.strip().splitlines()[-1][:160]}")
        if mod:
            for spec in re.findall(r"^\s*(?:import\s+(?:[^;'\"]*?\s+from\s+)?|export\s+[^;'\"]*?\s+from\s+)['\"](\.{1,2}/[^'\"]+)['\"]", src, re.M):
                if not (js.parent / spec).resolve().exists():
                    errs.append(f"{rel}: import {spec} resolves to nothing")
    ok(f"syntax + imports ({n} JS files)")

    # 6. hooks landed
    hooks = json.loads((ovl / "hooks.json").read_text())["hooks"]
    for h in hooks:
        f = tree / h["file"]
        if not f.exists() or f"USAGEOS-HOOK:{h['id']}" not in f.read_text():
            errs.append(f"fork hook '{h['id']}' missing from {h['file']}")
    ok(f"fork hooks present ({len(hooks)})")

    # 7. message-type contract: what the fork UI sends vs what the background answers
    handled = set()
    for p in list(tree.glob("background.js")) + list((tree / "bg-components").glob("*.js")):
        s = p.read_text(errors="replace")
        handled |= set(re.findall(r"register\(\s*['\"]([\w-]+)['\"]", s))
        handled |= set(re.findall(r"register\(\s*(\w+)\s*\)", s))
        handled |= set(re.findall(r"case\s+['\"]([\w-]+)['\"]\s*:", s))
    sent = set()
    for f in FORK_UI:
        p = tree / f
        if p.exists(): sent |= set(re.findall(r"(?:sendMessage|sendBackgroundMessage)\(\s*\{[^}]*?\btype:\s*['\"]([\w-]+)['\"]", p.read_text(), re.S))
    for t in sorted(sent - handled):
        errs.append(f"fork UI sends message type '{t}' but no background handler registers it")
    ok(f"message contract ({len(sent)} types sent, all handled)") if not (sent - handled) else None

    # 8. globals the notes widget depends on
    blob = "\n".join(p.read_text(errors="replace") for p in (tree / "content-components").glob("*.js")) + \
           "\n".join(p.read_text(errors="replace") for p in (tree / "common").rglob("*.js"))
    for g in REQUIRED_GLOBALS:
        if not re.search(rf"function\s+{g}\s*\(", blob):
            errs.append(f"global function {g}() no longer defined in any content script (fork_notes.js needs it)")

    for w in warns: print(f"  warn  {w}")
    for e in errs: print(f"  FAIL  {e}")
    print(f"  => {'PASS' if not errs else 'FAIL'}")
    return not errs


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    sys.exit(0 if check_tree(root / "extension", root / "extension-overlay") else 1)
