import type { Field } from "./schema";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-11-18" → "18 Nov 2026". Built by hand so it never shifts with a time zone.
export function formatDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

export function formatTimestamp(timestamp: string): string {
  return `${formatDate(timestamp)}, ${timestamp.slice(11, 16)} UTC`;
}

export function formatFieldValue(value: Field["value"]): string {
  if (value === null) return "not stated";
  if (value === true) return "yes";
  if (value === false) return "no";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "none";
  return value;
}

export function formatUsd(price: number): string {
  return `$${price.toFixed(price < 1 ? 3 : 2).replace(/(\.\d\d)0$/, "$1")}`;
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction === 1 ? 0 : 2)}%`;
}

// "https://example.com/legal/privacy#retention" → "example.com/legal/privacy"
export function shortUrl(url: string): string {
  const { hostname, pathname } = new URL(url);
  return hostname.replace(/^www\./, "") + pathname.replace(/\/$/, "");
}
