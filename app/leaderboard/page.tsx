import type { Metadata } from "next";
import Link from "next/link";
import { Empty, Unreadable } from "@/components/empty";
import { SpeedTable } from "@/components/probe-tables";
import { getModelNames, getProviderNames } from "@/lib/data";
import { formatTimestamp } from "@/lib/format";
import { RUNS_DIR_URL } from "@/lib/links";
import { getProbeSummary } from "@/lib/probes";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Time to first token and tokens per second for the same open models across inference providers, each number linked to the probe runs behind it.",
  alternates: { canonical: "/leaderboard" },
};

export default async function LeaderboardPage() {
  const summary = await getProbeSummary();
  const providerNames = getProviderNames();
  const modelNames = getModelNames();

  const head = (
    <header className="page-head">
      <h1>Speed on the same open models</h1>
      <p className="lede">
        Time to first token (TTFT) and output speed, measured with the same request against every provider that
        serves the model. Each number links to the raw runs it was computed from.{" "}
        <Link href="/method#probes">How probes run</Link>.
      </p>
      {summary.state === "ok" && (
        <p className="dateline">
          {summary.file.window_days}-day window · generated {formatTimestamp(summary.file.generated)}
        </p>
      )}
    </header>
  );

  if (summary.state === "unreadable") return <>{head}<Unreadable file="data/probes/summary.json" /></>;
  if (summary.state === "missing" || summary.file.rows.length === 0) {
    return (
      <>
        {head}
        <Empty title="No probe runs yet">The tables appear here once the first probe results are published.</Empty>
      </>
    );
  }

  const models = [...new Set(summary.file.rows.map((row) => row.model))];

  return (
    <>
      {head}
      {models.map((model) => {
        const rows = summary.file.rows
          .filter((row) => row.model === model)
          .sort((a, b) => (a.ttft_ms_p50 ?? Infinity) - (b.ttft_ms_p50 ?? Infinity));
        return (
          <section key={model}>
            <div className="section-head">
              <h2>{modelNames.get(model) ?? model}</h2>
              <span className="aside">Ordered by median time to first token</span>
            </div>
            <SpeedTable
              rows={rows}
              firstColumn="Provider"
              rowLabel={(row) => providerNames.get(row.provider) ?? row.provider}
              rowHref={(row) => `/providers/${row.provider}`}
            />
          </section>
        );
      })}
      <p className="aside footnote">
        p50 is the median and p95 the 95th percentile over the window. A provider with few runs has a less settled
        figure, so the run count is shown beside it. Links open the most recent day&rsquo;s runs; earlier days are in
        the <a href={RUNS_DIR_URL}>runs directory</a>. The experimental fidelity score is on{" "}
        <Link href="/fidelity">its own page</Link>.
      </p>
    </>
  );
}
