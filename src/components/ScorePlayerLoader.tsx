'use client';

import dynamic from 'next/dynamic';

const ScorePlayer = dynamic(() => import('@/components/ScorePlayer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
      <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
      <span>Loading player…</span>
    </div>
  ),
});

export default function ScorePlayerLoader({ scoreId }: { scoreId: string }) {
  return <ScorePlayer scoreId={scoreId} />;
}
