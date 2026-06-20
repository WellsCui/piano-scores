import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Piano } from 'lucide-react';
import { getScore } from '@/lib/scores';
import ScorePlayerLoader from '@/components/ScorePlayerLoader';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ScoreViewerPage({ params }: Props) {
  const { id } = await params;
  const score = getScore(id);
  if (!score) notFound();

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="Back to library"
          >
            <ChevronLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <Piano size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate leading-tight">{score.title}</p>
              {score.composer && (
                <p className="text-xs text-gray-500 truncate">{score.composer}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Player — fills remaining height */}
      <div className="flex-1 flex flex-col">
        <ScorePlayerLoader scoreId={id} />
      </div>
    </div>
  );
}
