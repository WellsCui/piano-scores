import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getScores, addScore, extractXmlMetadata } from '@/lib/scores';

export async function GET() {
  const scores = getScores();
  return NextResponse.json(scores);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const ext = file.name.toLowerCase().endsWith('.mxl') ? 'mxl' : 'xml';
  const bytes = await file.arrayBuffer();
  const content = Buffer.from(bytes);

  let title = 'Untitled';
  let composer = '';

  if (ext === 'xml') {
    const xml = content.toString('utf-8');
    ({ title, composer } = extractXmlMetadata(xml));
  } else {
    title = file.name.replace(/\.(mxl|xml)$/i, '');
  }

  const id = randomUUID();
  const filename = `${id}.${ext}`;
  const metadata = { id, title, composer, filename, addedAt: new Date().toISOString() };
  addScore(metadata, content);

  return NextResponse.json(metadata, { status: 201 });
}
