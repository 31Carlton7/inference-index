import Link from "next/link";
import { formatDate, formatUsd, shortUrl } from "@/lib/format";
import { mainFileUrl } from "@/lib/links";
import { REGISTRY_FIELDS, type ChangelogEntry } from "@/lib/schema";

function fieldLabel(key: string): string {
  return REGISTRY_FIELDS.find((entry) => entry.key === key)?.label ?? key;
}

function sideText(value: ChangelogEntry["before"]): string | number {
  if (value === null) return "—";
  if (typeof value === "object") return `${formatUsd(value.input)} input, ${formatUsd(value.output)} output, per 1M tokens`;
  return value;
}

function Side({ side, value, snapshot }: { side: "before" | "after"; value: ChangelogEntry["before"]; snapshot?: string | null }) {
  return (
    <div className={side}>
      <span className="side">{side === "before" ? "Before" : "After"}</span>
      <p>{sideText(value)}</p>
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
            <Side side="before" value={entry.before} snapshot={entry.snapshot_before} />
            <Side side="after" value={entry.after} snapshot={entry.snapshot_after} />
          </div>
        </article>
      ))}
    </div>
  );
}
