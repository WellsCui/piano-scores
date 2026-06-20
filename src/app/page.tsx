'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Music, Trash2, Upload, Piano } from 'lucide-react';
import UploadModal from '@/components/UploadModal';
import type { ScoreMetadata } from '@/lib/types';

export default function LibraryPage() {
  const [scores, setScores] = useState<ScoreMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadScores = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scores');
      const data = await res.json();
      setScores(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadScores(); }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm('Delete this score?')) return;
    setDeleting(id);
    await fetch(`/api/scores/${id}`, { method: 'DELETE' });
    setScores((prev) => prev.filter((s) => s.id !== id));
    setDeleting(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Piano size={20} className="text-white" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Piano Scores</h1>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Upload size={15} />
            Upload Score
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
            Loading library…
          </div>
        ) : scores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Music size={36} className="text-blue-400" />
            </div>
            <div>
              <p className="text-gray-700 font-medium">No scores yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Upload a MusicXML file to get started
              </p>
            </div>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Upload your first score
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {scores.map((score) => (
              <Link
                key={score.id}
                href={`/scores/${score.id}`}
                className="group relative bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all p-5 flex flex-col gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                  <Music size={20} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 line-clamp-2 leading-snug">
                    {score.title}
                  </p>
                  {score.composer && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-1">{score.composer}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(score.addedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(score.id, e)}
                  disabled={deleting === score.id}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete"
                >
                  {deleting === score.id ? (
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400 block" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                </button>
              </Link>
            ))}
          </div>
        )}
      </main>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={loadScores}
        />
      )}
    </div>
  );
}
