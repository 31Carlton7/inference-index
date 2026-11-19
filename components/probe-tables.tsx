import Link from "next/link";
import { formatDate, formatPercent } from "@/lib/format";
import { dataBranchFileUrl, mainFileUrl, runsFileUrl } from "@/lib/links";
import type { FidelityFile, FidelityRow, ProbeSummaryRow } from "@/lib/schema";

// Every measured number links to the provider's raw runs file for the most recent day in the window.
function Measured({ row, value, unit }: { row: ProbeSummaryRow; value: number | null; unit?: string }) {
  if (value === null) return <span className="unchecked">no successful runs</span>;
  return (
    <a
      className="num"
      href={runsFileUrl(row.provider, row.last_run)}
      title={`From ${row.runs} runs between ${row.first_run} and ${row.last_run}`}
    >
      {value.toLocaleString("en-US", { maximumFractionDigits: 1 })}
      {unit}
    </a>
  );
}

export function SpeedTable({ rows, rowLabel, rowHref, firstColumn }: {
  rows: ProbeSummaryRow[];
  rowLabel: (row: ProbeSummaryRow) => string;
  rowHref?: (row: ProbeSummaryRow) => string;
  firstColumn: string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{firstColumn}</th>
            <th scope="col" className="right">TTFT p50</th>
            <th scope="col" className="right">TTFT p95</th>
            <th scope="col" className="right">Tokens per second p50</th>
            <th scope="col" className="right">Uptime</th>
            <th scope="col" className="right">Runs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.provider}-${row.model}`}>
              <th scope="row">{rowHref ? <Link href={rowHref(row)}>{rowLabel(row)}</Link> : rowLabel(row)}</th>
              <td className="right"><Measured row={row} value={row.ttft_ms_p50} unit=" ms" /></td>
              <td className="right"><Measured row={row} value={row.ttft_ms_p95} unit=" ms" /></td>
              <td className="right">
                {row.tps_p50 === null && row.ttft_ms_p50 !== null ? (
                  <span className="unchecked" title="No successful run came back with a token count from the provider. Tokens are never estimated.">
                    no token count reported
                  </span>
                ) : (
                  <Measured row={row} value={row.tps_p50} />
                )}
              </td>
              <td className="right">
                {row.uptime === null ? (
                  <span className="unchecked">no runs</span>
                ) : (
                  <a className="num" href={runsFileUrl(row.provider, row.last_run)} title={`${row.ok} of ${row.runs} runs succeeded`}>
                    {formatPercent(row.uptime)}
                  </a>
                )}
              </td>
              <td className="right num">{row.runs.toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const VS_NOISE_FLOOR_LABEL = {
  within: "within the noise floor",
  diverges: "diverges from the reference",
  "no noise floor": "no noise floor to compare with",
};

export function FidelityTable({ fidelity, rows, rowLabel, rowHref, firstColumn }: {
  fidelity: FidelityFile;
  rows: FidelityRow[];
  rowLabel: (row: FidelityRow) => string;
  rowHref?: (row: FidelityRow) => string;
  firstColumn: string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{firstColumn}</th>
            <th scope="col" className="right">Experimental score</th>
            <th scope="col" className="right">Prompts matched exactly</th>
            <th scope="col">Noise floor</th>
            <th scope="col">Score against the noise floor</th>
            <th scope="col">State</th>
            <th scope="col">Stated quantization</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const reference = fidelity.references.find((entry) => entry.id === row.reference_run);
            const floor = row.noise_floor;
            return (
              <tr key={`${row.provider}-${row.model}`}>
                <th scope="row">{rowHref ? <Link href={rowHref(row)}>{rowLabel(row)}</Link> : rowLabel(row)}</th>
                <td className="right">
                  <a className="num" href={dataBranchFileUrl(row.runs_file)} title={`Scored run: ${row.runs.join(", ")}`}>
                    {row.score.toFixed(3)}
                  </a>
                </td>
                <td className="right num">
                  {row.exact_matches} of {row.prompts_scored}
                </td>
                <td className="wraps">
                  {floor === null ? (
                    <span className="unchecked">fewer than three reference runs</span>
                  ) : (
                    <>
                      <a
                        className="num"
                        href={reference && dataBranchFileUrl(reference.runs_file)}
                        title={`Reference ${row.reference_run}, run on ${row.reference_source}`}
                      >
                        {floor.min.toFixed(3)}
                      </a>{" "}
                      lowest, <span className="num">{floor.mean.toFixed(3)}</span> mean, over {floor.reference_runs} reference runs
                    </>
                  )}
                </td>
                <td className="wraps">{VS_NOISE_FLOOR_LABEL[row.vs_noise_floor]}</td>
                <td className="wraps">
                  {row.state}
                  {row.previous && (
                    <>
                      {" "}
                      <span className="unchecked">
                        (<span className="num">{row.previous.score.toFixed(3)}</span> on{" "}
                        <time dateTime={row.previous.date}>{formatDate(row.previous.date)}</time>)
                      </span>
                    </>
                  )}
                </td>
                <td className="wraps">
                  {row.stated_quantization === null ? (
                    <span className="not-stated">not stated</span>
                  ) : (
                    <a href={mainFileUrl("data/models.json")}>{row.stated_quantization}</a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// What the fidelity columns mean, in the same words wherever a table of scores is shown.
export function FidelityReading() {
  return (
    <p className="aside footnote">
      The score is the share of the provider&rsquo;s output that matched a reference run of the published weights. The
      noise floor is how the reference scored against itself across repeated runs, because the same weights do not
      always produce the same text. A score that &ldquo;diverges from the reference&rdquo; is below the lowest of those
      reference pairs; it records that the outputs differed on that run and says nothing about why.
      &ldquo;Repeated&rdquo; means the run before read the same way, and &ldquo;unconfirmed&rdquo; means there is no
      earlier run or it read differently. Stated quantization is the provider&rsquo;s own published statement, shown
      for context; <span className="not-stated">not stated</span> does not mean full precision.
    </p>
  );
}
