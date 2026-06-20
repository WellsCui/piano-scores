import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getScoreFilePath, getScore } from '@/lib/scores';
import { extractMxl, normalizeMusicXmlDivisions } from '@/lib/musicxml';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const filePath = getScoreFilePath(id);
  if (!filePath) {
    return NextResponse.json({ error: 'Score not found' }, { status: 404 });
  }
  const score = getScore(id)!;
  const content = fs.readFileSync(filePath);
  const isMxl = score.filename.endsWith('.mxl');

  // Normalize mixed-resolution MusicXML (common in OMR/PDF-converted scores) so
  // OpenSheetMusicDisplay can render it. When normalization is needed we serve
  // the uncompressed, corrected XML; otherwise the original file is served as-is.
  try {
    const xml = isMxl ? await extractMxl(content) : content.toString('utf-8');
    const { xml: normalized, changed } = normalizeMusicXmlDivisions(xml);
    if (changed) {
      return new NextResponse(normalized, {
        headers: { 'Content-Type': 'application/xml' },
      });
    }
  } catch {
    /* fall back to serving the original file untouched */
  }

  const contentType = isMxl ? 'application/vnd.recordare.musicxml' : 'application/xml';
  return new NextResponse(content, {
    headers: { 'Content-Type': contentType },
  });
}
