import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class Refusal extends Error {}

export const LIMIT = 280;
const URL_LENGTH = 23;
const URL_PATTERN = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;
const SINGLE_WEIGHT_RANGES = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
const SLOT = /\{(\w+)\}/g;

export function readTemplate(dir, name) {
  const markdown = readFileSync(join(dir, `${name}.md`), 'utf8');
  const sections = Object.fromEntries(
    markdown.split(/^## /m).slice(1).map((part) => {
      const [heading, ...body] = part.split('\n');
      return [heading.trim(), body.join('\n').trim()];
    }),
  );
  return {
    name,
    sections,
    variants: fencedBlocks(sections.Template),
    examples: fencedBlocks(sections.Example),
    approved: sections.Status.split('\n')[0] === 'approved',
  };
}

function fencedBlocks(section) {
  return Object.fromEntries(
    [...section.matchAll(/^```text ?(\S*)\n([\s\S]*?)\n```$/gm)].map(([, variant, text]) => [variant || 'default', text]),
  );
}

export function fill(text, values, optional = []) {
  return text
    .split('\n')
    .flatMap((line) => {
      const empty = [...line.matchAll(SLOT)].map((match) => match[1]).filter((slot) => slot !== 'site' && values[slot] == null);
      const required = empty.filter((slot) => !optional.includes(slot));
      if (required.length) throw new Refusal(`no value for {${required[0]}}`);
      if (empty.length) return [];
      return [line.replace(SLOT, (whole, slot) => values[slot] ?? whole)];
    })
    .join('\n');
}

export function textLength(text) {
  const normal = text.normalize('NFC');
  let length = (normal.match(URL_PATTERN)?.length ?? 0) * URL_LENGTH;
  for (const char of normal.replace(URL_PATTERN, '')) {
    const code = char.codePointAt(0);
    length += SINGLE_WEIGHT_RANGES.some(([low, high]) => code >= low && code <= high) ? 1 : 2;
  }
  return length;
}

export function postLength(text, link) {
  return textLength(text.slice(0, text.length - link.length)) + URL_LENGTH;
}

export function truncate(text, max) {
  if (textLength(text) <= max) return text;
  const words = text.split(' ');
  let kept = 0;
  while (kept < words.length && textLength(`${words.slice(0, kept + 1).join(' ')}...`) <= max) kept += 1;
  return kept ? `${words.slice(0, kept).join(' ')}...` : null;
}
