import Link from "next/link";
import { formatDate, formatUsd } from "@/lib/format";
import type { MissingPrice, PriceRow } from "@/lib/schema";

export function PriceTable({ rows, rowLabel, rowHref, firstColumn }: {
  rows: PriceRow[];
  rowLabel: (row: PriceRow) => string;
  rowHref?: (row: PriceRow) => string;
  firstColumn: string;
}) {
  return (
    <div className="table-wrap">
      <table className="aligned">
        <thead>
          <tr>
            <th scope="col">{firstColumn}</th>
            <th scope="col" className="right">Input, per 1M tokens</th>
            <th scope="col" className="right">Output, per 1M tokens</th>
            <th scope="col" className="right">Read on</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.provider}-${row.model}`}>
              <th scope="row">{rowHref ? <Link href={rowHref(row)}>{rowLabel(row)}</Link> : rowLabel(row)}</th>
              <td className="right">
                <a className="num" href={row.source}>{formatUsd(row.input)}</a>
              </td>
              <td className="right">
                <a className="num" href={row.source}>{formatUsd(row.output)}</a>
              </td>
              <td className="right">
                <time dateTime={row.checked}>{formatDate(row.checked)}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A price that could not be read is a gap with its reason, never yesterday's number.
export function MissingPrices({ date, missing, label, href }: {
  date: string;
  missing: MissingPrice[];
  label: (gap: MissingPrice) => string;
  href?: (gap: MissingPrice) => string;
}) {
  return (
    <div className="missing footnote">
      <p>Could not be read on {formatDate(date)}, so there is no row and no price is carried forward:</p>
      <ul>
        {missing.map((gap) => (
          <li key={`${gap.provider}-${gap.model}`}>
            {href ? <Link href={href(gap)}>{label(gap)}</Link> : label(gap)}: {gap.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
