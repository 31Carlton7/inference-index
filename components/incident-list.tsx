import { formatTimestamp } from "@/lib/format";
import { runUrl } from "@/lib/links";
import type { Incident } from "@/lib/schema";

export type ListedIncident = Incident & { provider: string; providerName: string; modelName: string };

const KIND_LABEL = { error: "Requests returned errors", timeout: "Requests timed out" };

// An incident is only ever listed with the two runs that establish it.
export function IncidentList({ incidents }: { incidents: ListedIncident[] }) {
  return (
    <ul className="incidents">
      {incidents.map((incident) => (
        <li key={incident.run}>
          <strong>{incident.providerName}</strong> · {incident.modelName} · {KIND_LABEL[incident.kind]} from{" "}
          <time dateTime={incident.start}>{formatTimestamp(incident.start)}</time>{" "}
          {incident.end ? (
            <>
              to <time dateTime={incident.end}>{formatTimestamp(incident.end)}</time>
            </>
          ) : (
            "and had not recovered at the last run"
          )}
          <p className="runs">
            First failed run <a href={runUrl(incident.provider, incident.run)}>{incident.run}</a>, confirmed from a
            second region by <a href={runUrl(incident.provider, incident.confirmed_by)}>{incident.confirmed_by}</a>
          </p>
        </li>
      ))}
    </ul>
  );
}
