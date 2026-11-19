import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function previousDay(date) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function priceChanges(dayBefore, dayAfter) {
  const changes = [];
  for (const after of dayAfter.rows) {
    const before = dayBefore.rows.find((row) => row.provider === after.provider && row.model === after.model);
    if (!before) continue;
    if (before.input === after.input && before.output === after.output) continue;
    changes.push({
      date: dayAfter.date,
      provider: after.provider,
      kind: "price",
      model: after.model,
      before: { input: before.input, output: before.output },
      after: { input: after.input, output: after.output },
      source: after.source,
    });
  }
  return changes;
}

// Other jobs write to the same list. Only this date's price entries are replaced, and they keep
// their place if they had one; otherwise they go above everything dated the same day or earlier.
export function withPriceChanges(entries, date, changes) {
  const isPriceForDate = (entry) => entry.kind === "price" && entry.date === date;
  const others = entries.filter((entry) => !isPriceForDate(entry));
  let position = entries.findIndex(isPriceForDate);
  if (position === -1) position = others.findIndex((entry) => entry.date <= date);
  if (position === -1) position = others.length;
  return others.toSpliced(position, 0, ...changes);
}

async function readIfExists(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function recordPriceChanges(dataDir, date) {
  const [textBefore, textAfter] = await Promise.all(
    [previousDay(date), date].map((day) => readIfExists(path.join(dataDir, "prices/daily", `${day}.json`))),
  );
  if (textBefore === null) return null;
  const changes = priceChanges(JSON.parse(textBefore), JSON.parse(textAfter));

  const changelogPath = path.join(dataDir, "changelog.json");
  const changelogText = await readIfExists(changelogPath);
  const changelog = changelogText === null ? { entries: [] } : JSON.parse(changelogText);
  const entries = withPriceChanges(changelog.entries, date, changes);
  if (JSON.stringify(entries) === JSON.stringify(changelog.entries)) return changes;

  const indent = changelogText?.match(/^\{\r?\n([ \t]+)/)?.[1] ?? 2;
  const lastNewline = changelogText === null || changelogText.endsWith("\n") ? "\n" : "";
  await writeFile(changelogPath, JSON.stringify({ ...changelog, entries }, null, indent) + lastNewline);
  return changes;
}
