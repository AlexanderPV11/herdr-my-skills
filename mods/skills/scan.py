"""Lists Claude Code skills on this computer as JSON: python scan.py <current folder>"""
import json
import os
import sys

SKIP = {"node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv", "venv", "AppData"}
DOWN = 4  # how many folder levels below a root are searched for .claude/skills


def front_matter(path):
    """name and description from the SKILL.md header (plain, quoted or block values)."""
    try:
        with open(path, encoding="utf-8-sig", errors="replace") as f:
            lines = f.read(20000).splitlines()
    except OSError:
        return {}
    if not lines or lines[0].strip() != "---":
        return {}
    data, key = {}, None
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if line[:1] in (" ", "\t") or not line.strip():
            if key:
                data[key] = (data[key] + " " + line.strip()).strip()
            continue
        name, sep, value = line.partition(":")
        if not sep:
            continue
        key = name.strip()
        value = value.strip()
        data[key] = "" if value in (">", "|", ">-", "|-", ">+", "|+") else value
    return {k: v.strip().strip("\"'") for k, v in data.items()}


def skill_files(root):
    """Every SKILL.md under a skills folder."""
    for folder, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for name in files:
            if name.lower() == "skill.md":
                yield os.path.join(folder, name)


def projects_below(root):
    """`.claude/skills` folders in root and up to DOWN levels under it."""
    base = root.rstrip("\\/").count(os.sep)
    for folder, dirs, _ in os.walk(root):
        if ".claude" in dirs:
            skills = os.path.join(folder, ".claude", "skills")
            if os.path.isdir(skills):
                yield skills
        deep = folder.rstrip("\\/").count(os.sep) - base >= DOWN
        dirs[:] = [] if deep else [d for d in dirs if d not in SKIP and not d.startswith(".")]


def main():
    home = os.path.expanduser("~")
    cwd = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else home
    claude = os.path.join(home, ".claude")
    found, seen = [], set()

    def add(root, group):
        if not os.path.isdir(root):
            return
        for file in skill_files(root):
            key = os.path.normcase(os.path.realpath(file))
            if key in seen:
                continue
            seen.add(key)
            meta = front_matter(file)
            folder = os.path.dirname(file)
            found.append({
                "group": group,
                "name": meta.get("name") or os.path.basename(folder),
                "description": meta.get("description", "")[:700],
                "dir": folder.replace("\\", "/"),
                "file": file.replace("\\", "/"),
            })

    # Personal and plugins first, so a scan from the home folder doesn't call them project skills.
    add(os.path.join(claude, "skills"), "personal")
    add(os.path.join(claude, "plugins", "synced"), "plugins")
    add(os.path.join(claude, "plugins", "cache"), "plugins")
    add(os.path.join(claude, "plugins", "marketplaces"), "catalog")

    # Project skills: the current folder and its parents, then folders below it and in Documents.
    folder = cwd
    while True:
        add(os.path.join(folder, ".claude", "skills"), "project")
        parent = os.path.dirname(folder)
        if parent == folder:
            break
        folder = parent
    roots = [os.path.join(home, "Documents")]
    # From the home folder or a drive's top, walking down would take far too long.
    if os.path.normcase(cwd) != os.path.normcase(home) and os.path.dirname(cwd) != cwd:
        roots.insert(0, cwd)
    for root in roots:
        if os.path.isdir(root):
            for skills in projects_below(root):
                add(skills, "project")

    found.sort(key=lambda s: (s["name"].lower(), s["dir"].lower()))
    print(json.dumps({"home": home.replace("\\", "/"), "skills": found}))


main()
