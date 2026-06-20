import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { convertPdfToMusicXml, isAudiverisInstalled } from '@/lib/audiveris';
import { addScore, extractXmlMetadata } from '@/lib/scores';

// PDF conversion can take up to 5 minutes for complex scores
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ installed: isAudiverisInstalled() });
}

export async function POST(request: NextRequest) {
  if (!isAudiverisInstalled()) {
    return NextResponse.json(
      { error: 'Audiveris is not installed. Run: npm run setup-audiveris' },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piano-pdf-'));
  const pdfPath = path.join(tmpDir, 'score.pdf');

  try {
    fs.writeFileSync(pdfPath, Buffer.from(await file.arrayBuffer()));

    const { content, ext } = await convertPdfToMusicXml(pdfPath);

    let title = file.name.replace(/\.pdf$/i, '');
    let composer = '';
    if (ext === 'xml') {
      ({ title, composer } = extractXmlMetadata(content.toString('utf-8')));
    }

    const id = randomUUID();
    const filename = `${id}.${ext}`;
    const metadata = { id, title, composer, filename, addedAt: new Date().toISOString() };
    addScore(metadata, content);

    return NextResponse.json(metadata, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Conversion failed';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
