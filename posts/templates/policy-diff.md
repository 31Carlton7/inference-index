# policy-diff

One post when the text of a provider's policy page changed. It quotes the old and the new text, or the text that was added or removed, and says nothing about what the change means.

## Template

```text
{provider_name} changed the {field} text on its {page} page on {date}.
Before: "{before}"
After: "{after}"
{site}/changelog
```

Variant `no-field`, when the entry's `field` is `null` because the change is not about a registry field:

```text no-field
{provider_name} changed text on its {page} page on {date}.
Before: "{before}"
After: "{after}"
{site}/changelog
```

Variant `added`, when `before` is an empty string: text was added, nothing was reworded.

```text added
{provider_name} added text to its {page} page on {date}.
Added: "{after}"
{site}/changelog
```

Variant `removed`, when `after` is an empty string: text was removed, nothing was reworded.

```text removed
{provider_name} removed text from its {page} page on {date}.
Removed: "{before}"
{site}/changelog
```

`added` and `removed` do not name the field, whether or not the entry has one. The quote is the whole post and says what the text is about.

## Slots

| slot | filled from | format |
|---|---|---|
| `provider_name` | `data/providers.json` `providers[].name`, matched on the entry's `provider` | as written |
| `field` | `data/changelog.json` `entries[].field`, a registry key | the words in the field table below, `retention` |
| `page` | the `<page>` part of `entries[].snapshot_after` (`data/snapshots/<provider-id>/<page>/<date>.txt`), a key of `urls` | the words in the page table below, `privacy` |
| `date` | `entries[].date` | `Nov 18` |
| `before` | `entries[].before` | verbatim, with runs of whitespace and line breaks turned into one space |
| `after` | `entries[].after` | same |

A post never prints a raw key. A key that is in neither table is printed with its underscores turned into spaces.

| `page` key | in the post |
|---|---|
| `privacy` | privacy |
| `data_policy` | data handling |
| `terms` | terms |
| `trust` | trust |
| `subprocessors` | subprocessors |

| `field` key | in the post |
|---|---|
| `status` | status |
| `retention` | retention |
| `zdr` | zero data retention |
| `zdr_how` | zero data retention setup |
| `training` | training |
| `soc2` | SOC 2 |
| `attestations` | attestations |
| `subprocessors` | subprocessors |
| `regions` | regions |
| `funding` | funding |

Truncation rule. If the post is over 280 characters, the quoted text gets the room left after the other text and the link. In `added` and `removed` the one quote gets all of it: it keeps its first words, is cut at a word boundary and ends with `...` inside the quotation marks. Every quote the variant has always appears and the link is always kept.

Where there are two quotes they share the room, and a quote shorter than half of it stays whole. A quote that does not fit is cut around the words that changed: the renderer finds the words the two quotes share at the start and at the end, keeps what differs between them, and adds the same shared words on each side of both quotes until the room runs out. Each excerpt is one unbroken run of the provider's words, with `...` at whichever end was cut, the start, the end or both. If the part that differs is itself too long, it keeps its first words and ends with `...`.

Example of a cut around the change, made-up values. The sentence is 259 characters long and only the number of days changed:

```text
Example AI changed the retention text on its privacy page on Nov 18.
Before: "...on servers in the United States for 30 days so that our trust and safety team..."
After: "...on servers in the United States for 14 days so that our trust and safety team..."
{site}/changelog
```

Quotes are the provider's own words, so they keep the provider's punctuation, including any dash.

## Link

`{site}/changelog`, the changelog page with the full before and after text and both snapshots. The route is live, served by `app/changelog/page.tsx`.

## Fires when

- `data/changelog.json` has an entry with `kind: "policy"`, and
- it has `snapshot_before` and `snapshot_after`, and both files exist under `data/snapshots/`, and
- `before` and `after` are both strings, and at least one of them has text, and
- they still differ after Unicode normalisation (NFKC) and with every run of whitespace turned into one space.

Which variant:

| `before` | `after` | `field` | variant |
|---|---|---|---|
| text | text | a key | the template |
| text | text | `null` | `no-field` |
| empty string | text | either | `added` |
| text | empty string | either | `removed` |

A string of only whitespace counts as an empty string.

An entry with `"field": null` is never sendable in any variant. Its draft waits for Carlton even once this template is approved.

## Does not fire when

- The `before` or `after` key is missing or `null`. Only an empty string means text was added or removed.
- `before` and `after` are both empty.
- Either snapshot path is missing, or the file it names does not exist.
- The difference is whitespace or formatting only.
- The two quotes read the same once cut around the change. The post would show no change, so the renderer refuses and the excerpt has to be picked by hand.
- The quoted text cannot fit in 280 characters with the link, even cut to the first word that changed.

## Example

Example, made-up values. Example AI is not a real provider.

```text
Example AI changed the retention text on its privacy page on Nov 18.
Before: "We retain inputs for 30 days."
After: "We retain inputs for 14 days."
{site}/changelog
```

Variant `no-field`, made-up values:

```text no-field
Example AI changed text on its terms page on Nov 18.
Before: "Disputes are resolved in the courts of Delaware."
After: "Disputes are resolved by binding arbitration."
{site}/changelog
```

Variant `added`, made-up values:

```text added
Example AI added text to its privacy page on Nov 18.
Added: "We do not use API inputs or outputs to train our models."
{site}/changelog
```

Variant `removed`, made-up values:

```text removed
Example AI removed text from its privacy page on Nov 18.
Removed: "Zero data retention is available on request."
{site}/changelog
```

## Status

not approved
