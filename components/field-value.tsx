import Link from "next/link";
import { formatDate, formatFieldValue } from "@/lib/format";
import type { Field } from "@/lib/schema";

// A registry value as it appears in tables: stated values link to their source,
// "not stated" links to the record row that lists the pages searched.
export function FieldValue({ field, providerId, fieldKey }: { field: Field | undefined; providerId: string; fieldKey: string }) {
  if (!field) {
    return (
      <span className="unchecked" title="This field has not been researched yet">
        —<span className="sr-only">not checked yet</span>
      </span>
    );
  }
  if (field.value === null) {
    return (
      <Link
        href={`/providers/${providerId}#${fieldKey}`}
        className="not-stated"
        title={`The provider's pages do not say. Checked ${formatDate(field.checked)}.`}
      >
        not stated
      </Link>
    );
  }
  return (
    <a href={field.source} title={`“${field.quote}” Checked ${formatDate(field.checked)}.`}>
      {formatFieldValue(field.value)}
    </a>
  );
}
