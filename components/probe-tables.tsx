import Link from "next/link";
import { formatDate, formatPercent } from "@/lib/format";
import { dataBranchFileUrl, runsFileUrl } from "@/lib/links";
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
              <td className="right"><Measured row={row} value={row.tps_p50} /></td>
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
            <th scope="col" className="right">Runs compared</th>
            <th scope="col">Reference run</th>
            <th scope="col">Prompts</th>
            <th scope="col">Run on</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.provider}-${row.model}`}>
              <th scope="row">{rowHref ? <Link href={rowHref(row)}>{rowLabel(row)}</Link> : rowLabel(row)}</th>
              <td className="right">
                <a className="num" href={dataBranchFileUrl(row.runs_file)} title={`Compared runs: ${row.runs.join(", ")}`}>
                  {row.score.toFixed(3)}
                </a>
              </td>
              <td className="right num">{row.runs.length}</td>
              <td className="mono">{row.reference_run}</td>
              <td>version {fidelity.prompts_version}</td>
              <td><time dateTime={fidelity.date}>{formatDate(fidelity.date)}</time></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
