import { diffWords } from "diff";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate, formatUsd, shortUrl } from "@/lib/format";
import { mainFileUrl } from "@/lib/links";
import { REGISTRY_FIELDS, type ChangelogEntry } from "@/lib/schema";

function fieldLabel(key: string): string {
  return REGISTRY_FIELDS.find((entry) => entry.key === key)?.label ?? key;
}

function sideText(value: ChangelogEntry["before"]): string | number {
  if (value === null || value === "") return "—";
  if (typeof value === "object") return `${formatUsd(value.input)} input, ${formatUsd(value.output)} output, per 1M tokens`;
  return value;
}

function markedText(side: "before" | "after", before: string, after: string): ReactNode[] {
  return diffWords(before, after).flatMap((part, index): ReactNode[] => {
    if (part.added) return side === "after" ? [<ins key={index}>{part.value}</ins>] : [];
    if (part.removed) return side === "before" ? [<del key={index}>{part.value}</del>] : [];
    return [part.value];
  });
}

function Side({ side, entry }: { side: "before" | "after"; entry: ChangelogEntry }) {
  const value = entry[side];
  const snapshot = side === "before" ? entry.snapshot_before : entry.snapshot_after;
  const bothText = typeof entry.before === "string" && typeof entry.after === "string" && value !== "";
  return (
    <div className={side}>
      <span className="side">{side === "before" ? "Before" : "After"}</span>
      <p>{bothText ? markedText(side, entry.before as string, entry.after as string) : sideText(value)}</p>
      {snapshot && (
        <a className="snapshot" href={mainFileUrl(snapshot)}>
          Snapshot of the page
        </a>
      )}
    </div>
  );
}

export function ChangeList({ entries, providerNames, modelNames }: {
  entries: ChangelogEntry[];
  providerNames?: Map<string, string>;
  modelNames: Map<string, string>;
}) {
  return (
    <div>
      {entries.map((entry, index) => (
        <article className="change" key={index}>
          <div className="change-head">
            <time dateTime={entry.date}>{formatDate(entry.date)}</time>
            {providerNames && (
              <Link href={`/providers/${entry.provider}`}>
                <strong>{providerNames.get(entry.provider) ?? entry.provider}</strong>
              </Link>
            )}
            <span className="kind">
              {entry.kind}
              {entry.field && <> · {fieldLabel(entry.field)}</>}
              {entry.model && <> · {modelNames.get(entry.model) ?? entry.model}</>}
            </span>
            <a className="aside" href={entry.source}>
              {shortUrl(entry.source)}
            </a>
          </div>
          <div className="diff">
            <Side side="before" entry={entry} />
            <Side side="after" entry={entry} />
          </div>
          {entry.note && <p className="aside change-note">{entry.note}</p>}
        </article>
      ))}
    </div>
  );
}
