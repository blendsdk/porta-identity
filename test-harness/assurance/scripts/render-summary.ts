import { redactEvidence } from './redact-evidence.js';

/** Recursively sorts record keys while retaining array order and primitive values. */
function sortForRendering(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForRendering);
  if (value === null || typeof value !== 'object') return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortForRendering(Object.getOwnPropertyDescriptor(value, key)?.value);
  }
  return sorted;
}

/** Escapes stable JSON before embedding it in a Markdown-compatible HTML block. */
function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Renders stable redacted JSON for an assurance result. */
export function renderJson(value: unknown): string {
  return `${JSON.stringify(sortForRendering(redactEvidence(value)), null, 2)}\n`;
}

/** Renders a stable redacted Markdown assurance summary. */
export function renderSummary(value: unknown): string {
  return `# Assurance summary\n\n<pre>${escapeHtml(renderJson(value))}</pre>\n`;
}
