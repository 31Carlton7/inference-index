"use client";

import Link from "next/link";
import { useState } from "react";
import { FieldValue } from "@/components/field-value";
import { formatDate, formatFieldValue } from "@/lib/format";
import { REGISTRY_FIELDS, type Field } from "@/lib/schema";

export type RegistryRow = {
  id: string;
  name: string;
  updated: string | null;
  fields: Record<string, Field | undefined>;
};

const COLUMNS = [
  { key: "status", label: "Status" },
  { key: "retention", label: "Retention" },
  { key: "zdr", label: "ZDR" },
  { key: "training", label: "Trains on customer data" },
  { key: "soc2", label: "SOC 2" },
] as const;

const FILTERED_COLUMNS = ["zdr", "training", "soc2"] as const;
const NOT_STATED = "not stated";

type SortKey = "name" | "updated" | (typeof COLUMNS)[number]["key"];
type Sort = { key: SortKey; descending: boolean };

function allowedValues(fieldKey: string): readonly string[] {
  const known = REGISTRY_FIELDS.find((entry) => entry.key === fieldKey);
  return known && "values" in known ? known.values : [];
}

function filterValue(field: Field | undefined): string | null {
  if (!field) return null;
  return field.value === null ? NOT_STATED : formatFieldValue(field.value);
}

// The schema's vocabulary first, then any other wording found in the records.
function filterOptions(rows: RegistryRow[], fieldKey: string): string[] {
  const found = rows.map((row) => filterValue(row.fields[fieldKey])).filter((value) => value !== null);
  return [...new Set([...allowedValues(fieldKey), ...found.sort(), NOT_STATED])];
}

// Stated values first in the schema's order, then "not stated", then unchecked.
function fieldRank(fieldKey: string, field: Field | undefined): [number, string] {
  if (!field) return [2, ""];
  if (field.value === null) return [1, ""];
  const text = formatFieldValue(field.value);
  const position = allowedValues(fieldKey).indexOf(text);
  return [0, position === -1 ? text : String(position).padStart(3, "0")];
}

function compareRows(a: RegistryRow, b: RegistryRow, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name);
  if (key === "updated") return (a.updated ?? "").localeCompare(b.updated ?? "");
  const [groupA, textA] = fieldRank(key, a.fields[key]);
  const [groupB, textB] = fieldRank(key, b.fields[key]);
  return groupA - groupB || textA.localeCompare(textB, undefined, { numeric: true });
}

export function RegistryTable({ rows }: { rows: RegistryRow[] }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<Sort>({ key: "name", descending: false });

  const isFiltering = query !== "" || Object.values(chosen).some(Boolean);
  const visible = rows
    .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((row) => FILTERED_COLUMNS.every((key) => !chosen[key] || filterValue(row.fields[key]) === chosen[key]))
    .sort((a, b) => {
      const order = compareRows(a, b, sort.key) || a.name.localeCompare(b.name);
      return sort.descending ? -order : order;
    });

  function sortBy(key: SortKey) {
    setSort({ key, descending: sort.key === key && !sort.descending });
  }

  function header(key: SortKey, label: string) {
    const isActive = sort.key === key;
    return (
      <th key={key} scope="col" aria-sort={isActive ? (sort.descending ? "descending" : "ascending") : "none"}>
        <button type="button" className="sort" onClick={() => sortBy(key)}>
          {label}
          <span className="sort-mark" aria-hidden>
            {sort.descending ? "↓" : "↑"}
          </span>
        </button>
      </th>
    );
  }

  return (
    <>
      <div className="filters">
        <label>
          Provider
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by name" />
        </label>
        {FILTERED_COLUMNS.map((key) => (
          <label key={key}>
            {COLUMNS.find((column) => column.key === key)?.label}
            <select value={chosen[key] ?? ""} onChange={(event) => setChosen({ ...chosen, [key]: event.target.value })}>
              <option value="">Any</option>
              {filterOptions(rows, key).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        ))}
        {isFiltering && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setQuery("");
              setChosen({});
            }}
          >
            Clear filters
          </button>
        )}
        <span className="count num" aria-live="polite">
          {visible.length} of {rows.length} providers
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {header("name", "Provider")}
              {COLUMNS.map((column) => header(column.key, column.label))}
              {header("updated", "Record updated")}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <Link href={`/providers/${row.id}`}>{row.name}</Link>
                </th>
                {COLUMNS.map((column) => (
                  <td key={column.key} className="wraps">
                    <FieldValue field={row.fields[column.key]} providerId={row.id} fieldKey={column.key} />
                  </td>
                ))}
                <td>{row.updated ? <time dateTime={row.updated}>{formatDate(row.updated)}</time> : <span className="unchecked">not checked yet</span>}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2}>No provider matches these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
