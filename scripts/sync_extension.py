#!/usr/bin/env python3
"""
sync_extension.py - rebuild ./extension from lugia19/Claude-Usage-Extension + the UsageOS overlay.

    upstream@tag  (pristine export, incl. the `common` submodule)
  + extension-overlay/files/*        fork-owned files, copied verbatim
  + extension-overlay/hooks.json     a few anchored one-line edits to upstream files
  + extension-overlay/manifest-overlay.json   branding / permissions applied to each manifest
  -> extension/                      load this unpacked in Chrome

Nothing about your fork is a diff against an old upstream, so there is no base to drift from:
every run starts from clean upstream. If upstream renames something a hook depends on, the
run FAILS (and names the hook); it never ships a half-patched extension.

    python3 scripts/sync_extension.py                  # newest upstream release tag
    python3 scripts/sync_extension.py --to v6.1.5
    python3 scripts/sync_extension.py --check-only     # verify ./extension as it stands
    python3 scripts/sync_extension.py --upstream-dir PATH   # use an existing local clone (offline)
Requires: git, python3, node (to regenerate build-time files and syntax-check).
"""
import argparse, json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

UPSTREAM = "https://github.com/lugia19/Claude-Usage-Extension.git"
ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
OVL = ROOT / "extension-overlay"
VERSION_FILE = OVL / "upstream-version.txt"

# upstream repo plumbing / dev tooling that is not part of the shipped extension
DROP = [".git", ".github", ".gitmodules", ".gitattributes", ".gitignore", "node_modules", "web-ext-artifacts",
        "eslint.config.js", "package.json", "package-lock.json", "mirror-debug.bat", "run-android.ps1",
        "build.bat", "build.sh", "debug", "notification-buttons.psd", "ui_screenshot.png", "scripts/codex-react.sh", "scripts/poll-codex.sh", "scripts/mirror-debug.js",
        "common/scripts", "common/README.md", "common/package.json", "common/package-lock.json",
        "common/eslint.base.cjs", "common/eslint.config.cjs", "common/.git", "common/.github", "common/.gitignore"]


def sh(*cmd, cwd=None, check=True):
    r = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if check and r.returncode:
        sys.exit(f"FAILED: {' '.join(cmd)}\n{r.stdout}{r.stderr}")
    return r


def latest_tag():
    out = sh("git", "ls-remote", "--tags", "--refs", UPSTREAM).stdout
    tags = [l.split("refs/tags/")[1] for l in out.splitlines() if re.search(r"refs/tags/v\d+(\.\d+)+$", l)]
    if not tags:
        sys.exit("could not list upstream tags (network?)")
    return max(tags, key=lambda t: tuple(int(x) for x in t[1:].split(".")))


def export_upstream(tag, dest: Path, local: Path | None):
    clone = dest.parent / "_clone"
    sh("git", "clone", "--quiet", "--no-checkout", str(local) if local else UPSTREAM, str(clone))
    sh("git", "checkout", "--quiet", "--force", tag, cwd=clone)
    sh("git", "submodule", "update", "--init", "--recursive", "--quiet", cwd=clone)
    shutil.copytree(clone, dest, ignore=shutil.ignore_patterns(".git"))
    shutil.rmtree(clone, ignore_errors=True)
    for d in DROP:
        p = dest / d
        if p.is_dir(): shutil.rmtree(p)
        elif p.exists(): p.unlink()
    for junk in dest.rglob(".DS_Store"): junk.unlink()


def apply_hooks(tree: Path):
    cfg = json.loads((OVL / "hooks.json").read_text())
    failures = []
    for h in cfg["hooks"]:
        f = tree / h["file"]
        if not f.exists():
            failures.append(f"[{h['id']}] {h['file']} no longer exists upstream"); continue
        src = f.read_text()
        done = False
        for anchor in h["anchors"]:
            n = src.count(anchor)
            if n != 1:
                continue
            line = f"{h['text']}  // USAGEOS-HOOK:{h['id']}\n"
            if h["op"] == "insert_before":   new = line + anchor
            elif h["op"] == "insert_after":  new = anchor + line
            elif h["op"] == "replace":       new = line.rstrip("\n")
            else: sys.exit(f"unknown op {h['op']}")
            f.write_text(src.replace(anchor, new, 1)); done = True
            print(f"  hook {h['id']:<16} ok  ({h['file']}, anchor #{h['anchors'].index(anchor)+1})")
            break
        if not done:
            counts = [src.count(a) for a in h["anchors"]]
            failures.append(f"[{h['id']}] {h['file']}: no anchor matched exactly once (match counts: {counts}). "
                            f"Upstream changed this area - update the anchors in extension-overlay/hooks.json.")
    for target, extra in cfg.get("append_files", {}).items():
        t = tree / target
        t.write_text(t.read_text().rstrip("\n") + "\n" + (OVL / extra).read_text())
        print(f"  appended {extra} -> {target}")
    if failures:
        print("\nHOOK FAILURES:"); [print("  " + x) for x in failures]; sys.exit(3)


def _walk(m, path):
    cur = m
    for k in path:
        cur = cur[int(k)] if isinstance(cur, list) else cur[k]
    return cur


def apply_manifest_overlay(tree: Path):
    ov = json.loads((OVL / "manifest-overlay.json").read_text())
    for mf in sorted(tree.glob("manifest_*.json")):
        variant = mf.stem.split("_", 1)[1]
        m = json.loads(mf.read_text())
        for scope in ("all", variant):
            o = ov.get(scope, {})
            for path, val in o.get("set", {}).items():
                parts = path.split(".")
                try:
                    parent = _walk(m, parts[:-1])
                except (KeyError, IndexError):
                    continue          # this manifest variant has no such section (e.g. electron has no 'action')
                parent[parts[-1]] = val
            for key in o.get("delete", []):
                m.pop(key, None)
            for path, items in o.get("list_append", {}).items():
                lst = _walk(m, path.split("."))
                lst.extend(i for i in items if i not in lst)
            for ins in o.get("list_insert", []):
                # path may contain '*' (e.g. content_scripts.*.js): use whichever list holds the 'before' item
                parts = ins["path"].split(".")
                if "*" in parts:
                    i = parts.index("*")
                    cands = [_walk(m, parts[:i] + [str(k)] + parts[i + 1:]) for k in range(len(_walk(m, parts[:i])))]
                else:
                    cands = [_walk(m, parts)]
                lst = next((c for c in cands if ins["before"] in c), None)
                if lst is None:
                    sys.exit(f"manifest overlay: {ins['before']!r} not found in any {ins['path']} of {mf.name} - upstream reorganised its content scripts")
                i = lst.index(ins["before"])
                lst[i:i] = [x for x in ins["items"] if x not in lst]
        mf.write_text(json.dumps(m, indent="\t") + "\n")
        if variant == "chrome":
            (tree / "manifest.json").write_text(mf.read_text())   # Chrome requires this exact filename
        print(f"  manifest_{variant}.json  v{m.get('version')}  ->  {m['name']!r}")


def build(tag, local):
    work = Path(tempfile.mkdtemp(prefix="usageos-sync-"))
    try:
        tree = work / "ext"
        print(f"exporting upstream {tag} ...")
        export_upstream(tag, tree, local)
        print("applying overlay:")
        for p in (OVL / "files").rglob("*"):
            if p.is_file() and p.name != ".DS_Store":
                dst = tree / p.relative_to(OVL / "files")
                dst.parent.mkdir(parents=True, exist_ok=True)
                if dst.exists(): print(f"  override  {dst.relative_to(tree)}")
                shutil.copy2(p, dst)
        apply_hooks(tree)
        apply_manifest_overlay(tree)
        gen = tree / "scripts" / "build-dataclasses.js"
        if gen.exists():
            r = sh("node", "scripts/build-dataclasses.js", cwd=tree, check=False)
            print("  build-dataclasses:", (r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr).strip() else "ok")
            if r.returncode: sys.exit("build-dataclasses.js failed")
        sys.path.insert(0, str(Path(__file__).parent))
        from check_extension import check_tree
        print("verifying:")
        if not check_tree(tree, OVL):
            sys.exit("verification failed - ./extension left untouched")
        prev = ROOT / "extension.prev"
        if prev.exists(): shutil.rmtree(prev)
        if EXT.exists(): EXT.rename(prev)
        shutil.copytree(tree, EXT)
        VERSION_FILE.write_text(tag + "\n")
        print(f"\nextension/ rebuilt from upstream {tag} + UsageOS overlay (previous copy: extension.prev/)")
        print("Chrome: chrome://extensions -> reload the UsageOS Tracker card, then reload your claude.ai tabs.")
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--to"); ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--upstream-dir", type=Path)
    a = ap.parse_args()
    if a.check_only:
        sys.path.insert(0, str(Path(__file__).parent))
        from check_extension import check_tree
        sys.exit(0 if check_tree(EXT, OVL) else 1)
    tag = a.to or latest_tag()
    cur = VERSION_FILE.read_text().strip() if VERSION_FILE.exists() else None
    if cur == tag:
        print(f"already built from {tag}; use --to to force another tag"); return
    print(f"current: {cur or 'unknown'}   target: {tag}")
    build(tag, a.upstream_dir)


if __name__ == "__main__":
    main()
