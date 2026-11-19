"""Review draft changelog entries written by snapshot.py.

    python3 scripts/registry/review.py list
    python3 scripts/registry/review.py accept 2026-11-19 0 --field retention
    python3 scripts/registry/review.py accept 2026-11-19 0 --no-field
    python3 scripts/registry/review.py reject 2026-11-19 0

accept moves the entry to the top of data/changelog.json. reject drops it.
Entry numbers are the ones `list` prints, and they shift after each accept
or reject.
"""

import argparse
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
DRAFTS_DIR = ROOT / "data/changelog-drafts"
CHANGELOG = ROOT / "data/changelog.json"


def read_entries(path):
    if not path.exists():
        return []
    return json.loads(path.read_text())["entries"]


def write_entries(path, entries):
    path.write_text(json.dumps({"entries": entries}, indent=2, ensure_ascii=False) + "\n")


def list_drafts():
    for drafts_file in sorted(DRAFTS_DIR.glob("*.json")):
        for number, draft in enumerate(read_entries(drafts_file)):
            print(f"--- {drafts_file.stem} #{number}  {draft['provider']}/{draft['page']}  {draft['source']}")
            print("before:")
            print(draft["before"] or "(nothing)")
            print("after:")
            print(draft["after"] or "(nothing)")
            print()


def take_draft(date, number):
    drafts_file = DRAFTS_DIR / f"{date}.json"
    drafts = read_entries(drafts_file)
    draft = drafts.pop(number)
    if drafts:
        write_entries(drafts_file, drafts)
    else:
        drafts_file.unlink()
    return draft


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list")
    accept = commands.add_parser("accept")
    accept.add_argument("date")
    accept.add_argument("number", type=int)
    about = accept.add_mutually_exclusive_group(required=True)
    about.add_argument("--field", help="the registry field the change is about")
    about.add_argument("--no-field", action="store_true", help="the change is about no registry field")
    reject = commands.add_parser("reject")
    reject.add_argument("date")
    reject.add_argument("number", type=int)
    args = parser.parse_args()

    if args.command == "list":
        list_drafts()
    elif args.command == "reject":
        take_draft(args.date, args.number)
    else:
        draft = take_draft(args.date, args.number)
        draft["field"] = args.field
        del draft["page"]
        write_entries(CHANGELOG, [draft] + read_entries(CHANGELOG))


if __name__ == "__main__":
    main()
