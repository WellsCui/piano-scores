import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { convertPdfToMusicXml, isAudiverisInstalled } from '@/lib/audiveris';
import { addScore, extractXmlMetadata } from '@/lib/scores';
import { extractMxl, normalizeMusicXmlDivisions, summarizeMusicXml } from '@/lib/musicxml';
import { createLogger } from '@/lib/log';

// PDF conversion can take up to 5 minutes for complex scores
export const maxDuration = 300;

const log = createLogger('convert');

export async function GET() {
  return NextResponse.json({ installed: isAudiverisInstalled() });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  if (!isAudiverisInstalled()) {
    log.warn('rejected: audiveris not installed');
    return NextResponse.json(
      { error: 'Audiveris is not installed. Run: npm run setup-audiveris' },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    log.warn('rejected: non-PDF upload', { filename: file?.name ?? null });
    return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 });
  }

  log.info('conversion requested', { filename: file.name, bytes: file.size });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piano-pdf-'));
  const pdfPath = path.join(tmpDir, 'score.pdf');

  try {
    fs.writeFileSync(pdfPath, Buffer.from(await file.arrayBuffer()));

    const { content, ext } = await convertPdfToMusicXml(pdfPath);

    // Diagnostic snapshot of the converted output: mixed `<divisions>` is the
    // structure that breaks OSMD, so capture it for future investigation.
    try {
      const xml = ext === 'mxl' ? await extractMxl(content) : content.toString('utf-8');
      const summary = summarizeMusicXml(xml);
      log.info('converted MusicXML analysis', {
        ext,
        contentBytes: content.length,
        divisions: summary.divisions,
        mixedDivisions: summary.divisions.length > 1,
        parts: summary.parts,
        measures: summary.measures,
        willNormalizeOnServe: normalizeMusicXmlDivisions(xml).changed,
      });
    } catch (analysisErr: unknown) {
      log.warn('could not analyze converted output', {
        error: analysisErr instanceof Error ? analysisErr.message : String(analysisErr),
      });
    }

    let title = file.name.replace(/\.pdf$/i, '');
    let composer = '';
    if (ext === 'xml') {
      ({ title, composer } = extractXmlMetadata(content.toString('utf-8')));
    }

    const id = randomUUID();
    const filename = `${id}.${ext}`;
    const metadata = { id, title, composer, filename, addedAt: new Date().toISOString() };
    addScore(metadata, content);

    log.info('conversion succeeded', {
      id,
      filename,
      ext,
      title,
      composer,
      totalMs: Date.now() - startedAt,
    });
    return NextResponse.json(metadata, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Conversion failed';
    log.error('conversion failed', {
      filename: file.name,
      totalMs: Date.now() - startedAt,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
