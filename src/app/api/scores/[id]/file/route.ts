import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getScoreFilePath, getScore } from '@/lib/scores';

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
  const contentType = score.filename.endsWith('.mxl')
    ? 'application/vnd.recordare.musicxml'
    : 'application/xml';
  return new NextResponse(content, {
    headers: { 'Content-Type': contentType },
  });
}
