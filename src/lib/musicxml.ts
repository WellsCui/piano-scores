import JSZip from 'jszip';

/**
 * Extract the inner MusicXML document from a compressed `.mxl` (a ZIP archive).
 * Follows META-INF/container.xml to the declared rootfile, falling back to the
 * first non-META-INF `.xml` entry.
 */
export async function extractMxl(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);

  let rootPath: string | undefined;
  const container = zip.file('META-INF/container.xml');
  if (container) {
    const containerXml = await container.async('string');
    rootPath = containerXml.match(/full-path="([^"]+)"/)?.[1];
  }

  let entry = rootPath ? zip.file(rootPath) : null;
  if (!entry) {
    const name = Object.keys(zip.files).find(
      (n) => n.toLowerCase().endsWith('.xml') && !n.startsWith('META-INF')
    );
    entry = name ? zip.file(name) : null;
  }
  if (!entry) throw new Error('No MusicXML entry found in .mxl archive');
  return entry.async('string');
}

/**
 * Cheap structural summary of a MusicXML document, for diagnostics/logging.
 * `divisions` is the set of distinct resolutions found — more than one is the
 * pattern that trips OpenSheetMusicDisplay (see `normalizeMusicXmlDivisions`).
 */
export function summarizeMusicXml(xml: string): {
  divisions: number[];
  parts: number;
  measures: number;
} {
  const divisions = [
    ...new Set(
      [...xml.matchAll(/<divisions>\s*(\d+)\s*<\/divisions>/g)].map((m) => parseInt(m[1], 10))
    ),
  ];
  const parts = (xml.match(/<part\s+id=/g) || []).length;
  const measures = (xml.match(/<measure\b/g) || []).length;
  return { divisions, parts, measures };
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/**
 * Normalize a MusicXML document to a single `<divisions>` value per the whole
 * score.
 *
 * Audiveris (and other OMR/import tools) sometimes emit different `<divisions>`
 * resolutions in different measures of the same part. That's legal MusicXML, but
 * OpenSheetMusicDisplay 2.0.0 mishandles it — its unguarded `Fraction`
 * comparisons throw "Cannot read properties of undefined (reading 'realValue')"
 * while building the sheet, which fails the whole player.
 *
 * The fix is pure arithmetic and lossless: pick the least common multiple of all
 * `<divisions>` values as the target, then rescale every duration-valued element
 * (`<duration>` in notes/backup/forward, and `<offset>`) by `target / divisions`
 * for the resolution in effect at that point in the document. Because the target
 * is a multiple of every source resolution, all values stay integers.
 *
 * Returns the original string untouched (`changed: false`) when the score already
 * uses a single resolution, so well-formed files pay nothing.
 */
export function normalizeMusicXmlDivisions(xml: string): { xml: string; changed: boolean } {
  const divisions = [...xml.matchAll(/<divisions>\s*(\d+)\s*<\/divisions>/g)].map((m) =>
    parseInt(m[1], 10)
  );
  const distinct = [...new Set(divisions)].filter((d) => d > 0);
  if (distinct.length <= 1) return { xml, changed: false };

  const target = distinct.reduce((a, b) => lcm(a, b));

  // Single forward pass. `current` is the divisions resolution in effect at the
  // current point in the document; it resets at each new part and updates on
  // every `<divisions>` element (MusicXML guarantees divisions are declared
  // before any duration that depends on them).
  let current = 0;
  const tokenRe =
    /<part\s+[^>]*>|<divisions>\s*(\d+)\s*<\/divisions>|<duration>\s*(\d+)\s*<\/duration>|<offset>\s*(-?\d+)\s*<\/offset>/g;

  const out = xml.replace(tokenRe, (full, div?: string, dur?: string, off?: string) => {
    if (div !== undefined) {
      current = parseInt(div, 10);
      return `<divisions>${target}</divisions>`;
    }
    if (!current) return full; // before any divisions (or unknown part) — leave as-is
    if (dur !== undefined) {
      return `<duration>${(parseInt(dur, 10) * target) / current}</duration>`;
    }
    if (off !== undefined) {
      return `<offset>${(parseInt(off, 10) * target) / current}</offset>`;
    }
    // body <part ...> open tag — reset resolution for the new part
    current = 0;
    return full;
  });

  return { xml: out, changed: true };
}
