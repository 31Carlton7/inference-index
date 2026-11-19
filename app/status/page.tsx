import type { Metadata } from "next";
import Link from "next/link";
import { Empty, Unreadable } from "@/components/empty";
import { IncidentList, type ListedIncident } from "@/components/incident-list";
import { RunStrip, RunStripLegend } from "@/components/run-strip";
import { getModelNames, getProviderNames } from "@/lib/data";
import { formatPercent, formatTimestamp } from "@/lib/format";
import { RUNS_DIR_URL, runsFileUrl } from "@/lib/links";
import { getProbeStatus, getProbeSummary } from "@/lib/probes";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Status",
  description: "Recent probe runs for each inference provider and model, with uptime and confirmed incidents. Gaps in the runs are drawn as gaps.",
  alternates: { canonical: "/status" },
};

export default async function StatusPage() {
  const [status, summary] = await Promise.all([getProbeStatus(), getProbeSummary()]);
  const providerNames = getProviderNames();
  const modelNames = getModelNames();
  const drawnAt = Date.now();

  const head = (
    <header className="page-head">
      <h1>Probe status</h1>
      <p className="lede">
        One short streamed request per provider and model on a fixed schedule. Each mark below is a single request
        and links to its raw record. A provider is only listed under incidents when a failure was confirmed by a
        second run from a second region. <Link href="/method#probes">How probes run</Link>.
      </p>
      {status.state === "ok" && (
        <p className="dateline">
          Data generated {formatTimestamp(status.file.generated)} · page drawn {formatTimestamp(new Date(drawnAt).toISOString())}
        </p>
      )}
    </header>
  );

  if (status.state === "unreadable") return <>{head}<Unreadable file="data/probes/status.json" /></>;
  if (status.state === "missing" || status.file.rows.length === 0) {
    return (
      <>
        {head}
        <Empty title="No probe runs yet">
          Strips, uptime and incidents appear here once the first probe results are published.
        </Empty>
      </>
    );
  }

  const summaryRows = summary.state === "ok" ? summary.file.rows : [];
  const windowDays = summary.state === "ok" ? summary.file.window_days : null;
  const models = [...new Set(status.file.rows.map((row) => row.model))];
  const incidents: ListedIncident[] = status.file.rows
    .flatMap((row) =>
      row.incidents.map((incident) => ({
        ...incident,
        provider: row.provider,
        providerName: providerNames.get(row.provider) ?? row.provider,
        modelName: modelNames.get(row.model) ?? row.model,
      })),
    )
    .sort((a, b) => b.start.localeCompare(a.start));

  return (
    <>
      {head}
      {models.map((model) => (
        <section key={model}>
          <div className="section-head">
            <h2>{modelNames.get(model) ?? model}</h2>
            <span className="aside">
              One mark per {status.file.interval_minutes} minutes
              {windowDays && <> · uptime over {windowDays} days</>}
            </span>
          </div>
          <div className="strips">
            {status.file.rows
              .filter((row) => row.model === model)
              .map((row) => {
                const measured = summaryRows.find((entry) => entry.provider === row.provider && entry.model === model);
                return (
                  <div className="strip-row" key={row.provider}>
                    <Link className="name" href={`/providers/${row.provider}`}>
                      {providerNames.get(row.provider) ?? row.provider}
                    </Link>
                    <RunStrip row={row} intervalMinutes={status.file.interval_minutes} drawnAt={drawnAt} />
                    <span className="figures">
                      {measured && measured.uptime !== null ? (
                        <a href={runsFileUrl(row.provider, measured.last_run)} className="num">
                          {formatPercent(measured.uptime)} · {measured.ok} of {measured.runs} runs ok
                        </a>
                      ) : (
                        "no summary yet"
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
      <RunStripLegend />
      <p className="aside footnote">
        A single failed request is shown as it happened and is not an incident. Raw runs for every day are in the{" "}
        <a href={RUNS_DIR_URL}>runs directory</a>; uptime links open the most recent day&rsquo;s file.
      </p>
      <section className="section">
        <div className="section-head">
          <h2>Confirmed incidents</h2>
        </div>
        {incidents.length === 0 ? (
          <Empty title="No confirmed incidents">
            No failure in the published runs has been confirmed from a second region.
          </Empty>
        ) : (
          <IncidentList incidents={incidents} />
        )}
      </section>
    </>
  );
}
