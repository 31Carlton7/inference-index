"""Fetch every provider's policy pages and store their text.

A page gets a new file under data/snapshots/<provider>/<page>/<date>.txt the
first time it is read and again whenever its text differs from the latest
file. Each difference is also written to data/changelog-drafts/<date>.json.
Drafts are not published: review.py moves an entry to data/changelog.json
once someone has read it.

    python3 scripts/registry/snapshot.py [--date YYYY-MM-DD] [--root PATH]
"""

import argparse
import datetime
import difflib
import json
import os
import pathlib
import re
import shutil
import subprocess
import urllib.error
import urllib.request
from html.parser import HTMLParser

POLICY_PAGES = ["privacy", "data_policy", "terms", "trust", "subprocessors", "audit_scope"]

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)

# Shorter than this and the fetch returned a script shell or an error page,
# not the policy.
MIN_POLICY_CHARS = 400

CHROME_PATHS = [
    "google-chrome",
    "chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

CHALLENGE_TITLES = ["Just a moment", "Attention Required", "Access Denied"]

# Lines that differ between two fetches of an unchanged policy.
VOLATILE_LINE_PREFIXES = ("This is the Trace Id:",)
# DeepInfra's site footer rotates a list of model names under these headings.
ROTATING_LIST_HEADINGS = ("Latest Models", "Featured Models")

# Next.js sometimes streams <title> into the body instead of the head.
HIDDEN_TAGS = {"script", "style", "noscript", "svg", "template", "head", "title"}
BLOCK_TAGS = {
    "p", "div", "br", "li", "ul", "ol", "tr", "table", "section", "article",
    "header", "footer", "nav", "main", "aside", "h1", "h2", "h3", "h4", "h5",
    "h6", "blockquote", "pre", "dt", "dd", "hr", "td", "th",
}


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pieces = []
        self.hidden_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in HIDDEN_TAGS:
            self.hidden_depth += 1
        elif tag in BLOCK_TAGS:
            self.pieces.append("\n")

    def handle_endtag(self, tag):
        if tag in HIDDEN_TAGS:
            self.hidden_depth = max(0, self.hidden_depth - 1)
        elif tag in BLOCK_TAGS:
            self.pieces.append("\n")

    def handle_data(self, text):
        if self.hidden_depth == 0:
            self.pieces.append(text)


HIDDEN_CONTROLS_COUNT = re.compile(r"View \d+ more (.+ )?controls?")


def is_volatile(line):
    if line.startswith(VOLATILE_LINE_PREFIXES):
        return True
    # Trust centres: "Updated 29 minutes ago".
    if line.startswith("Updated ") and line.endswith(" ago"):
        return True
    # Google's docs restamp every page daily: "Last updated 2026-11-18 UTC."
    if line.startswith("Last updated ") and line.endswith(" UTC."):
        return True
    # Trust centres count the controls their preview leaves out:
    # "View 4 more Organizational security controls", "View 33 more controls".
    return bool(HIDDEN_CONTROLS_COUNT.fullmatch(line))


def tidy_lines(text):
    lines = [" ".join(line.split()) for line in text.splitlines()]
    lines = [line for line in lines if line]
    kept = []
    follows_rotating_heading = False
    in_controls_preview = False
    for number, line in enumerate(lines):
        # Trust centre overviews show a few controls under "Controls", "View all"
        # and pick different ones on each load. The preview ends at the next
        # section, which is the next heading with "View all" under it.
        if lines[number + 1:number + 2] == ["View all"]:
            in_controls_preview = line == "Controls"
        elif in_controls_preview and line != "View all":
            continue
        if not follows_rotating_heading and not is_volatile(line):
            kept.append(line)
        follows_rotating_heading = line in ROTATING_LIST_HEADINGS
    return "\n".join(kept) + "\n"


def html_to_text(html):
    parser = VisibleText()
    parser.feed(html)
    return tidy_lines("".join(parser.pieces))


def pdf_to_text(pdf_bytes):
    converted = subprocess.run(
        ["pdftotext", "-layout", "-", "-"],
        input=pdf_bytes, capture_output=True, check=True,
    )
    return tidy_lines(converted.stdout.decode("utf-8", "replace"))


def rendered_text(url):
    """Text of a page that only has content after its scripts run, or None."""
    chrome = next((shutil.which(path) for path in CHROME_PATHS if shutil.which(path)), None)
    if chrome is None:
        return None
    try:
        rendered = subprocess.run(
            [chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
             "--window-size=1280,2000", "--virtual-time-budget=20000", "--dump-dom", url],
            capture_output=True, timeout=120,
            # Trust centres print dates in the browser's time zone.
            env={**os.environ, "TZ": "UTC"},
        )
    except subprocess.TimeoutExpired:
        return None
    return html_to_text(rendered.stdout.decode("utf-8", "replace"))


def fetch_policy_text(url):
    """Return (text, None) or (None, reason the page could not be read)."""
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    })
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            body = response.read()
            content_type = response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as error:
        return None, f"http {error.code}"
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return None, f"fetch failed: {error}"

    if body.startswith(b"%PDF") or "application/pdf" in content_type:
        text = pdf_to_text(body)
    else:
        html = body.decode("utf-8", "replace")
        for title in CHALLENGE_TITLES:
            if f"<title>{title}" in html:
                return None, "bot challenge"
        text = html_to_text(html)
        if len(text) < MIN_POLICY_CHARS:
            text = rendered_text(url) or text

    if len(text) < MIN_POLICY_CHARS:
        return None, f"only {len(text)} characters of text"
    return text, None


def changed_passages(before_text, after_text):
    """Pairs of (before, after) for each run of lines that differs."""
    before_lines = before_text.splitlines()
    after_lines = after_text.splitlines()
    matcher = difflib.SequenceMatcher(None, before_lines, after_lines, autojunk=False)
    passages = []
    for op, b1, b2, a1, a2 in matcher.get_opcodes():
        if op != "equal":
            passages.append(("\n".join(before_lines[b1:b2]), "\n".join(after_lines[a1:a2])))
    return passages


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"))
    parser.add_argument("--root", default=pathlib.Path(__file__).resolve().parents[2], type=pathlib.Path)
    args = parser.parse_args()

    providers = json.loads((args.root / "data/providers.json").read_text())["providers"]
    snapshots_dir = args.root / "data/snapshots"
    page_results = []
    drafts = []

    for provider in providers:
        for page in POLICY_PAGES:
            url = provider["urls"].get(page)
            if not url:
                continue
            page_dir = snapshots_dir / provider["id"] / page
            todays_file = page_dir / f"{args.date}.txt"
            outcome = {"provider": provider["id"], "page": page, "url": url}
            page_results.append(outcome)

            if todays_file.exists():
                outcome["result"] = "already taken today"
                continue

            text, unreadable_reason = fetch_policy_text(url)
            if text is None:
                outcome["result"] = "unreadable"
                outcome["reason"] = unreadable_reason
                continue

            earlier_files = sorted(page_dir.glob("*.txt"))
            if not earlier_files:
                page_dir.mkdir(parents=True, exist_ok=True)
                todays_file.write_text(text)
                outcome["result"] = "baseline"
                continue

            latest_file = earlier_files[-1]
            latest_text = latest_file.read_text()
            # Some script-rendered pages come back in one of two layouts. A page
            # counts as changed only when two more reads also differ.
            for _ in range(2):
                if text == latest_text:
                    break
                text = fetch_policy_text(url)[0] or text
            if text == latest_text:
                outcome["result"] = "unchanged"
                outcome["latest"] = latest_file.stem
                continue

            todays_file.write_text(text)
            outcome["result"] = "changed"
            for before, after in changed_passages(latest_text, text):
                drafts.append({
                    "date": args.date,
                    "provider": provider["id"],
                    "kind": "policy",
                    "field": None,
                    "page": page,
                    "before": before,
                    "after": after,
                    "source": url,
                    "snapshot_before": str(latest_file.relative_to(args.root)),
                    "snapshot_after": str(todays_file.relative_to(args.root)),
                })

    snapshots_dir.mkdir(parents=True, exist_ok=True)
    (snapshots_dir / "last-run.json").write_text(
        json.dumps({"date": args.date, "pages": page_results}, indent=2) + "\n"
    )
    if drafts:
        drafts_dir = args.root / "data/changelog-drafts"
        drafts_dir.mkdir(parents=True, exist_ok=True)
        (drafts_dir / f"{args.date}.json").write_text(
            json.dumps({"entries": drafts}, indent=2, ensure_ascii=False) + "\n"
        )

    tally = {}
    for outcome in page_results:
        tally[outcome["result"]] = tally.get(outcome["result"], 0) + 1
    print(f"{args.date}: " + ", ".join(f"{count} {result}" for result, count in sorted(tally.items())))
    for outcome in page_results:
        if outcome["result"] in ("changed", "unreadable"):
            print(f"  {outcome['result']}: {outcome['provider']}/{outcome['page']} {outcome.get('reason', '')}")
    print(f"{len(drafts)} draft changelog entries")


if __name__ == "__main__":
    main()
