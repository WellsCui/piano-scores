'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Music, FileText, Loader2 } from 'lucide-react';

interface UploadModalProps {
  onClose: () => void;
  onUploaded: () => void;
}

type Tab = 'musicxml' | 'pdf';

export default function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>('musicxml');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [audiverisReady, setAudiverisReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/scores/convert')
      .then((r) => r.json())
      .then((d) => setAudiverisReady(d.installed))
      .catch(() => setAudiverisReady(false));
  }, []);

  const uploadMusicXml = async (file: File) => {
    if (!file.name.match(/\.(xml|mxl)$/i)) {
      setError('Only .xml and .mxl MusicXML files are supported.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/scores', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      onUploaded();
      onClose();
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const convertPdf = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported here.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/scores/convert', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Conversion failed');
      onUploaded();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Conversion failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (file: File) => {
    tab === 'pdf' ? convertPdf(file) : uploadMusicXml(file);
  };

  const isPdf = tab === 'pdf';
  const accept = isPdf ? '.pdf' : '.xml,.mxl';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Add Score</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => { setTab('musicxml'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              tab === 'musicxml'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Music size={16} />
            MusicXML
          </button>
          <button
            onClick={() => { setTab('pdf'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              tab === 'pdf'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText size={16} />
            Convert PDF
          </button>
        </div>

        <div className="p-6">
          {/* PDF — Audiveris not installed warning */}
          {isPdf && audiverisReady === false && (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <strong>Audiveris not installed.</strong> Run the following in your terminal, then
              restart the server:
              <pre className="mt-1 font-mono bg-amber-100 rounded p-2 select-all">
                npm run setup-audiveris
              </pre>
            </div>
          )}

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
              dragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            } ${isPdf && audiverisReady === false ? 'opacity-50 pointer-events-none' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
              {isPdf ? (
                <FileText size={28} className="text-blue-500" />
              ) : (
                <Music size={28} className="text-blue-500" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">
                {isPdf ? 'Drop your PDF score here' : 'Drop your MusicXML file here'}
              </p>
              <p className="text-xs text-gray-400 mt-1">or click to browse</p>
            </div>
            <p className="text-xs text-gray-400">
              {isPdf ? '.pdf — conversion may take 1–2 minutes' : '.xml and .mxl supported'}
            </p>
          </div>

          {/* PDF quality note */}
          {isPdf && audiverisReady !== false && (
            <p className="mt-3 text-xs text-gray-400 text-center">
              Best results with clean, typeset PDFs. Always review after conversion.
            </p>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-500 text-center">{error}</p>
          )}

          {uploading && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-blue-500">
              <Loader2 size={16} className="animate-spin" />
              {isPdf ? 'Converting… this may take a moment' : 'Uploading…'}
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
