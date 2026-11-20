"""Review draft changelog entries written by snapshot.py.

    python3 scripts/registry/review.py list
    python3 scripts/registry/review.py accept 2026-11-19 0 --field retention
    python3 scripts/registry/review.py accept 2026-11-19 0 --no-field
    python3 scripts/registry/review.py accept 2026-11-19 0 --no-field \
        --before "we keep inputs for 30 days" --after "we keep inputs for 14 days"
    python3 scripts/registry/review.py reject 2026-11-19 0

accept moves the entry into data/changelog.json, above everything dated the
same day or earlier. reject drops it.

--before and --after cut a side down to the clause around the change when
the change is a few words inside a long sentence. Each has to be words the
draft's own side already has, in one unbroken run. Anything else is refused
and the draft stays where it is. A side the draft has as empty stays empty.

The price job writes to the same file. Pull main before accepting, and if the
push is rejected, reset to the new main and accept again rather than rebasing
one edit of the file over another.
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


def one_spaced(text):
    return " ".join(text.split())


def trimmed_side(draft, side, quote):
    if quote is None:
        return draft[side]
    quote = one_spaced(quote)
    if not quote:
        raise SystemExit(f"--{side} is empty. Leave the option out to keep the draft's text.")
    if not draft[side]:
        raise SystemExit(f"--{side} was given, but the draft's {side} is empty and stays empty.")
    if quote not in one_spaced(draft[side]):
        raise SystemExit(f"--{side} is not an unbroken run of words from the draft's {side}. Nothing was accepted.")
    return quote


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
    accept.add_argument("--before", help="a shorter quote, cut from the draft's before text")
    accept.add_argument("--after", help="a shorter quote, cut from the draft's after text")
    reject = commands.add_parser("reject")
    reject.add_argument("date")
    reject.add_argument("number", type=int)
    args = parser.parse_args()

    if args.command == "list":
        list_drafts()
    elif args.command == "reject":
        take_draft(args.date, args.number)
    else:
        waiting = read_entries(DRAFTS_DIR / f"{args.date}.json")[args.number]
        before = trimmed_side(waiting, "before", args.before)
        after = trimmed_side(waiting, "after", args.after)
        draft = take_draft(args.date, args.number)
        draft["before"] = before
        draft["after"] = after
        draft["field"] = args.field
        del draft["page"]
        published = read_entries(CHANGELOG)
        position = 0
        while position < len(published) and published[position]["date"] > draft["date"]:
            position += 1
        published.insert(position, draft)
        write_entries(CHANGELOG, published)


if __name__ == "__main__":
    main()
