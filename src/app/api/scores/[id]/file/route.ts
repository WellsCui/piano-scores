import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getScoreFilePath, getScore } from '@/lib/scores';
import { extractMxl, repairMusicXmlForOsmd } from '@/lib/musicxml';

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

  // Repair MusicXML that OpenSheetMusicDisplay can't render (common in OMR/
  // PDF-converted scores — e.g. an unbalanced <octave-shift> crashes its render
  // pass). When a repair is applied we serve the uncompressed, corrected XML;
  // otherwise the original file is served as-is.
  try {
    const xml = isMxl ? await extractMxl(content) : content.toString('utf-8');
    const { xml: repaired, changed } = repairMusicXmlForOsmd(xml);
    if (changed) {
      return new NextResponse(repaired, {
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
