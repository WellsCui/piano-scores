import { NextRequest, NextResponse } from 'next/server';
import { removeScore } from '@/lib/scores';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const removed = removeScore(id);
  if (!removed) {
    return NextResponse.json({ error: 'Score not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
