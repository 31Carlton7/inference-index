import Link from "next/link";
import { formatDate, formatFieldValue } from "@/lib/format";
import type { Field } from "@/lib/schema";

// A registry value as it appears in tables: stated values link to their source,
// "not stated" links to the record row that lists the pages searched. A field
// with a note carries a mark beside the value that reveals the note.
export function FieldValue({ field, providerId, fieldKey }: { field: Field | undefined; providerId: string; fieldKey: string }) {
  if (!field) {
    return (
      <span className="unchecked" title="This field has not been researched yet">
        —<span className="sr-only">not checked yet</span>
      </span>
    );
  }
  const noteId = `${providerId}-${fieldKey}-note`;
  return (
    <>
      {field.value === null ? (
        <Link
          href={`/providers/${providerId}#${fieldKey}`}
          className="not-stated"
          title={`The provider's pages do not say. Checked ${formatDate(field.checked)}.`}
        >
          not stated
        </Link>
      ) : (
        <a href={field.source} title={`“${field.quote}” Checked ${formatDate(field.checked)}.`}>
          {formatFieldValue(field.value)}
        </a>
      )}
      {field.note && (
        <span className="field-note">
          <button type="button" className="field-note-mark" aria-label="Note" aria-describedby={noteId}>
            †
          </button>
          <span className="field-note-text" role="tooltip" id={noteId}>
            {field.note}
          </span>
        </span>
      )}
    </>
  );
}
