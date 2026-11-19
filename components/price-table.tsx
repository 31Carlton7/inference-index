import Link from "next/link";
import { formatDate, formatUsd } from "@/lib/format";
import type { PriceRow } from "@/lib/schema";

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
