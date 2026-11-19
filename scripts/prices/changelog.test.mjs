import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { previousDay, priceChanges, recordPriceChanges, withPriceChanges } from "./changelog.mjs";

const SOURCE = "https://example.com/pricing";

function row(provider, model, input, output) {
  return { provider, model, input, output, source: SOURCE, checked: "2026-11-18" };
}

function daily(date, rows, missing = []) {
  return { date, basket_version: 1, rows, missing };
}

function change(date, provider, model, before, after) {
  return {
    date,
    provider,
    kind: "price",
    model,
    before: { input: before[0], output: before[1] },
    after: { input: after[0], output: after[1] },
    source: SOURCE,
  };
}

const policy = {
  date: "2026-11-18",
  provider: "example",
  kind: "policy",
  field: "retention",
  before: "We retain inputs for 30 days.",
  after: "We don’t retain inputs.",
  source: "https://example.com/privacy",
};
const added = { date: "2026-11-18", provider: "other", kind: "provider added", before: null, after: "Other", source: "https://other.example/" };
const olderPrice = change("2026-11-17", "example", "small", [0.2, 0.6], [0.15, 0.6]);

async function dataDir(days, changelogText) {
  const dir = await mkdtemp(path.join(tmpdir(), "price-changelog-"));
  await mkdir(path.join(dir, "prices/daily"), { recursive: true });
  for (const day of days) await writeDaily(dir, day);
  if (changelogText !== undefined) await writeFile(path.join(dir, "changelog.json"), changelogText);
  return dir;
}

function writeDaily(dir, day) {
  return writeFile(path.join(dir, "prices/daily", `${day.date}.json`), JSON.stringify(day, null, 2) + "\n");
}

function readChangelog(dir) {
  return readFile(path.join(dir, "changelog.json"), "utf8");
}

test("previous day crosses month and year ends in UTC", () => {
  assert.equal(previousDay("2026-11-19"), "2026-11-18");
  assert.equal(previousDay("2026-03-01"), "2026-02-28");
  assert.equal(previousDay("2027-01-01"), "2026-12-31");
});

test("a changed input or output is one entry per provider and model", () => {
  const before = daily("2026-11-17", [row("a", "small", 0.15, 0.6), row("a", "large", 1.4, 4.4), row("b", "small", 0.15, 0.6)]);
  const after = daily("2026-11-18", [row("a", "small", 0.1, 0.6), row("a", "large", 1.4, 4.0), row("b", "small", 0.15, 0.6)]);
  assert.deepEqual(priceChanges(before, after), [
    change("2026-11-18", "a", "small", [0.15, 0.6], [0.1, 0.6]),
    change("2026-11-18", "a", "large", [1.4, 4.4], [1.4, 4.0]),
  ]);
});

test("the source is the later day's", () => {
  const before = daily("2026-11-17", [{ ...row("a", "small", 0.15, 0.6), source: "https://example.com/old-pricing" }]);
  const after = daily("2026-11-18", [row("a", "small", 0.1, 0.6)]);
  assert.equal(priceChanges(before, after)[0].source, SOURCE);
});

test("a row that appears, disappears or is missing on either day is not a change", () => {
  const before = daily(
    "2026-11-17",
    [row("a", "small", 0.15, 0.6), row("gone", "small", 0.15, 0.6), row("unread-after", "small", 0.15, 0.6)],
    [{ provider: "unread-before", model: "small", reason: "returned 403" }],
  );
  const after = daily(
    "2026-11-18",
    [row("a", "small", 0.15, 0.6), row("new", "small", 0.2, 0.6), row("unread-before", "small", 0.2, 0.6)],
    [{ provider: "unread-after", model: "small", reason: "returned 403" }],
  );
  assert.deepEqual(priceChanges(before, after), []);
});

test("numbers are compared exactly", () => {
  const before = daily("2026-11-17", [row("a", "small", 0.15, 0.6), row("b", "small", 0.17, 0.6)]);
  const after = daily("2026-11-18", [row("a", "small", 0.150001, 0.6), row("b", "small", 0.17, 0.6)]);
  assert.deepEqual(priceChanges(before, after), [change("2026-11-18", "a", "small", [0.15, 0.6], [0.150001, 0.6])]);
});

test("no entry across a skipped day", async () => {
  const dir = await dataDir([daily("2026-11-16", [row("a", "small", 0.15, 0.6)]), daily("2026-11-18", [row("a", "small", 0.1, 0.6)])]);
  assert.equal(await recordPriceChanges(dir, "2026-11-18"), null);
  await assert.rejects(readChangelog(dir), { code: "ENOENT" });
});

test("a missing changelog is created with the entries", async () => {
  const dir = await dataDir([daily("2026-11-17", [row("a", "small", 0.15, 0.6)]), daily("2026-11-18", [row("a", "small", 0.1, 0.6)])]);
  await recordPriceChanges(dir, "2026-11-18");
  const expected = { entries: [change("2026-11-18", "a", "small", [0.15, 0.6], [0.1, 0.6])] };
  assert.equal(await readChangelog(dir), JSON.stringify(expected, null, 2) + "\n");
});

test("no changelog is created when nothing changed", async () => {
  const dir = await dataDir([daily("2026-11-17", [row("a", "small", 0.15, 0.6)]), daily("2026-11-18", [row("a", "small", 0.15, 0.6)])]);
  assert.deepEqual(await recordPriceChanges(dir, "2026-11-18"), []);
  await assert.rejects(readChangelog(dir), { code: "ENOENT" });
});

test("a second run on the same day adds nothing", async () => {
  const dir = await dataDir([daily("2026-11-17", [row("a", "small", 0.15, 0.6)]), daily("2026-11-18", [row("a", "small", 0.1, 0.6)])]);
  await recordPriceChanges(dir, "2026-11-18");
  const afterFirstRun = await readChangelog(dir);
  await recordPriceChanges(dir, "2026-11-18");
  assert.equal(await readChangelog(dir), afterFirstRun);
  assert.equal(JSON.parse(afterFirstRun).entries.length, 1);
});

test("a rerun that reads a different price replaces the day's entry", async () => {
  const dir = await dataDir([daily("2026-11-17", [row("a", "small", 0.15, 0.6)]), daily("2026-11-18", [row("a", "small", 0.1, 0.6)])]);
  await recordPriceChanges(dir, "2026-11-18");
  await writeDaily(dir, daily("2026-11-18", [row("a", "small", 0.12, 0.6)]));
  await recordPriceChanges(dir, "2026-11-18");
  assert.deepEqual(JSON.parse(await readChangelog(dir)).entries, [change("2026-11-18", "a", "small", [0.15, 0.6], [0.12, 0.6])]);
});

test("a rerun that reads the previous day's price again removes the entry", async () => {
  const dir = await dataDir(
    [daily("2026-11-17", [row("a", "small", 0.15, 0.6)]), daily("2026-11-18", [row("a", "small", 0.1, 0.6)])],
    JSON.stringify({ entries: [policy] }, null, 2) + "\n",
  );
  await recordPriceChanges(dir, "2026-11-18");
  await writeDaily(dir, daily("2026-11-18", [row("a", "small", 0.15, 0.6)]));
  await recordPriceChanges(dir, "2026-11-18");
  assert.deepEqual(JSON.parse(await readChangelog(dir)).entries, [policy]);
});

test("only the date's price entries are touched and the rest keep their order", () => {
  const newer = { ...added, date: "2026-11-19" };
  const stale = change("2026-11-18", "a", "small", [0.15, 0.6], [0.1, 0.6]);
  const current = change("2026-11-18", "a", "small", [0.15, 0.6], [0.12, 0.6]);
  assert.deepEqual(withPriceChanges([newer, policy, stale, added, olderPrice], "2026-11-18", [current]), [newer, policy, current, added, olderPrice]);
  assert.deepEqual(withPriceChanges([newer, policy, added, olderPrice], "2026-11-18", [current]), [newer, current, policy, added, olderPrice]);
  assert.deepEqual(withPriceChanges([newer], "2026-11-18", [current]), [newer, current]);
});

test("the changelog keeps its indentation, its missing final newline and other writers' text", async () => {
  const changelogText = JSON.stringify({ entries: [policy, added, olderPrice] }, null, 4);
  const dir = await dataDir([daily("2026-11-17", [row("a", "small", 0.15, 0.6)]), daily("2026-11-18", [row("a", "small", 0.1, 0.6)])], changelogText);
  await recordPriceChanges(dir, "2026-11-18");
  const expected = [change("2026-11-18", "a", "small", [0.15, 0.6], [0.1, 0.6]), policy, added, olderPrice];
  assert.equal(await readChangelog(dir), JSON.stringify({ entries: expected }, null, 4));
});

test("a day with no changes leaves the changelog file as it was", async () => {
  const changelogText = `{"entries":[${JSON.stringify(policy)}]}`;
  const dir = await dataDir([daily("2026-11-17", [row("a", "small", 0.15, 0.6)]), daily("2026-11-18", [row("a", "small", 0.15, 0.6)])], changelogText);
  await recordPriceChanges(dir, "2026-11-18");
  assert.equal(await readChangelog(dir), changelogText);
});
