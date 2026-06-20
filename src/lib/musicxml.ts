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
 */
export function summarizeMusicXml(xml: string): {
  divisions: number[];
  parts: number;
  measures: number;
  octaveShifts: { up: number; down: number; stop: number; continue: number };
} {
  const divisions = [
    ...new Set(
      [...xml.matchAll(/<divisions>\s*(\d+)\s*<\/divisions>/g)].map((m) => parseInt(m[1], 10))
    ),
  ];
  const parts = (xml.match(/<part\s+id=/g) || []).length;
  const measures = (xml.match(/<measure\b/g) || []).length;
  const types = [...xml.matchAll(/<octave-shift\b[^>]*\btype="([^"]+)"/g)].map((m) => m[1]);
  const octaveShifts = {
    up: types.filter((t) => t === 'up').length,
    down: types.filter((t) => t === 'down').length,
    stop: types.filter((t) => t === 'stop').length,
    continue: types.filter((t) => t === 'continue').length,
  };
  return { divisions, parts, measures, octaveShifts };
}

/**
 * Repair MusicXML so OpenSheetMusicDisplay 2.0.0 can render it.
 *
 * OMR/PDF-converted scores (e.g. from Audiveris) sometimes emit an
 * `<octave-shift>` bracket that never balances — a `up`/`down` start with no
 * matching `stop`, or a `stop`/`continue` with no open start. OSMD's render
 * pass (`calculateOctaveShifts` → `calculateSingleOctaveShift`) then compares
 * against an unresolved end timestamp via `Fraction.lte`, reads `.realValue`
 * off `undefined`, and throws "Cannot read properties of undefined (reading
 * 'realValue')", failing the entire render.
 *
 * Fix: pair octave-shift directions per part and per `number` channel, then drop
 * the `<direction>` blocks of any that don't balance. Well-formed pairs survive
 * (so valid 8va/8vb brackets are preserved); clean scores return unchanged.
 *
 * (Mixed `<divisions>` resolutions across measures are also common in this
 * output but render fine — they are NOT the cause and are left untouched.)
 */
export function repairMusicXmlForOsmd(xml: string): {
  xml: string;
  changed: boolean;
  removedOctaveShifts: number;
} {
  const blocks: { start: number; end: number; type: string; number: string }[] = [];
  for (const m of xml.matchAll(/<direction\b[^>]*>[\s\S]*?<\/direction>/g)) {
    const os = m[0].match(/<octave-shift\b[^>]*>/);
    if (!os) continue;
    const type = os[0].match(/\btype="([^"]+)"/)?.[1] ?? '';
    const number = os[0].match(/\bnumber="([^"]+)"/)?.[1] ?? '1';
    const start = m.index ?? 0;
    blocks.push({ start, end: start + m[0].length, type, number });
  }
  if (blocks.length === 0) return { xml, changed: false, removedOctaveShifts: 0 };

  // Octave-shift start/stop matching is scoped to a part and a `number` channel.
  const partStarts = [...xml.matchAll(/<part\s+id=/g)].map((m) => m.index ?? 0);
  const partOf = (off: number) => {
    let p = 0;
    for (const s of partStarts) {
      if (s <= off) p = s;
      else break;
    }
    return p;
  };

  const openStacks = new Map<string, number[]>(); // `${part}|${number}` -> open start indices
  const unbalanced = new Set<number>();
  blocks.forEach((b, i) => {
    const key = `${partOf(b.start)}|${b.number}`;
    let stack = openStacks.get(key);
    if (!stack) {
      stack = [];
      openStacks.set(key, stack);
    }
    if (b.type === 'up' || b.type === 'down') {
      stack.push(i);
    } else if (b.type === 'stop') {
      if (stack.length) stack.pop();
      else unbalanced.add(i); // stop with no open start
    } else if (stack.length === 0) {
      unbalanced.add(i); // continue with no open start
    }
  });
  for (const stack of openStacks.values()) for (const i of stack) unbalanced.add(i); // never stopped

  if (unbalanced.size === 0) return { xml, changed: false, removedOctaveShifts: 0 };

  // Remove the offending <direction> blocks back-to-front so offsets stay valid.
  const removals = [...unbalanced].map((i) => blocks[i]).sort((a, b) => b.start - a.start);
  let out = xml;
  for (const b of removals) out = out.slice(0, b.start) + out.slice(b.end);
  return { xml: out, changed: true, removedOctaveShifts: unbalanced.size };
}
