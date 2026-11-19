# policy-diff

One post when the text of a provider's policy page changed. It quotes the old and the new text and says nothing about what the change means.

## Template

```text
{provider_name} changed the {field} text on its {page} page on {date}.
Before: "{before}"
After: "{after}"
{site}/changelog
```

## Slots

| slot | filled from | format |
|---|---|---|
| `provider_name` | `data/providers.json` `providers[].name`, matched on the entry's `provider` | as written |
| `field` | `data/changelog.json` `entries[].field` | the registry key as written, `retention` |
| `page` | the `<page>` part of `entries[].snapshot_after` (`data/snapshots/<provider-id>/<page>/<date>.txt`), a key of `urls` | as written, `privacy` |
| `date` | `entries[].date` | `Nov 18` |
| `before` | `entries[].before` | verbatim, with runs of whitespace and line breaks turned into one space |
| `after` | `entries[].after` | same |

Truncation rule. If the post is over 280 characters, the two quotes share the room left after the other text and the link. A quote shorter than half of that room stays whole and the other gets the rest; otherwise each gets half. A quote that is cut is cut at a word boundary and ends with `...` inside the quotation marks. Both quotes always appear and the link is always kept.

Quotes are the provider's own words, so they keep the provider's punctuation, including any dash.

## Link

`{site}/changelog`, the changelog page with the full before and after text and both snapshots. Route assumed: there is no `app/` folder on main yet.

## Fires when

- `data/changelog.json` has an entry with `kind: "policy"`, and
- it has `field`, `before`, `after`, `snapshot_before` and `snapshot_after`, and
- both snapshot files exist under `data/snapshots/`, and
- `before` and `after` still differ after Unicode normalisation (NFKC) and with every run of whitespace turned into one space.

## Does not fire when

- `before` or `after` is missing or empty.
- Either snapshot path is missing, or the file it names does not exist.
- The difference is whitespace or formatting only.
- The two quotes read the same once cut to fit. The post would show no change, so the renderer refuses and the excerpt has to be picked by hand.
- Both quotes cannot fit in 280 characters with the link.

## Example

Example, made-up values. Example AI is not a real provider.

```text
Example AI changed the retention text on its privacy page on Nov 18.
Before: "We retain inputs for 30 days."
After: "We retain inputs for 14 days."
{site}/changelog
```

## Status

not approved
