import Link from "next/link";
import { formatDate, formatUsd, shortUrl } from "@/lib/format";
import { mainFileUrl } from "@/lib/links";
import { REGISTRY_FIELDS, type ChangelogEntry } from "@/lib/schema";

function fieldLabel(key: string): string {
  return REGISTRY_FIELDS.find((entry) => entry.key === key)?.label ?? key;
}

function Side({ side, text, snapshot }: { side: "before" | "after"; text: ChangelogEntry["before"]; snapshot?: string | null }) {
  if (typeof text === "object" && text !== null) text = `${formatUsd(text.input)} input, ${formatUsd(text.output)} output`;
  return (
    <div className={side}>
      <span className="side">{side === "before" ? "Before" : "After"}</span>
      <p>{text ?? "—"}</p>
      {snapshot && (
        <a className="snapshot" href={mainFileUrl(snapshot)}>
          Snapshot of the page
        </a>
      )}
    </div>
  );
}

export function ChangeList({ entries, providerNames }: { entries: ChangelogEntry[]; providerNames?: Map<string, string> }) {
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
              {entry.model && <> · {entry.model}</>}
            </span>
            <a className="aside" href={entry.source}>
              {shortUrl(entry.source)}
            </a>
          </div>
          <div className="diff">
            <Side side="before" text={entry.before} snapshot={entry.snapshot_before} />
            <Side side="after" text={entry.after} snapshot={entry.snapshot_after} />
          </div>
        </article>
      ))}
    </div>
  );
}
