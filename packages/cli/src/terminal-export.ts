/**
 * Interactive terminal safety for exported documents.
 *
 * Exports are tenant-controlled data, not formatted reports. When a document is displayed directly
 * on a terminal, control sequences can change the display or the clipboard. File and pipeline
 * output must remain byte-exact for consumers, so sanitization applies only to an interactive
 * terminal stream.
 */

/** Controls that are structural in CSV/TSV documents and safe for a terminal display. */
const STRUCTURAL_CONTROLS = new Set([0x09, 0x0a, 0x0d]);

/** Invisible or bidirectional formatting characters outside the C0/C1 ranges. */
const DIRECTIONAL_OR_INVISIBLE = new Set([
  0x061c, 0xfeff, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069,
]);

/**
 * Sanitize one exported document for direct terminal display.
 *
 * Line breaks, carriage returns and tabs stay intact so CSV rows and quoted values keep their
 * shape. Every other C0/C1 control, DEL, and invisible direction control is replaced with the
 * Unicode replacement character. Noninteractive output is returned unchanged.
 *
 * @param content - Exact text received from the export endpoint.
 * @param interactive - Whether stdout is an interactive terminal.
 * @returns Text safe to display on that terminal.
 */
export function sanitizeInteractiveExport(content: string, interactive: boolean): string {
  if (!interactive) return content;
  return Array.from(content, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return character;
    if (STRUCTURAL_CONTROLS.has(codePoint)) return character;
    const isControl = codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    return isControl || DIRECTIONAL_OR_INVISIBLE.has(codePoint) ? '\ufffd' : character;
  }).join('');
}
