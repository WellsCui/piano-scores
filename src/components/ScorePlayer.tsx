'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Square } from 'lucide-react';

interface CursorPosition {
  stepIdx: number;
  timeInBeats: number;
}

interface NoteEvent {
  timeInBeats: number;
  notes: Array<{ midi: number; durationInBeats: number }>;
}

type PlayerState = 'loading' | 'loadingAudio' | 'ready' | 'playing' | 'paused' | 'error';

interface ScorePlayerProps {
  scoreId: string;
}

export default function ScorePlayer({ scoreId }: ScorePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sfRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);

  // Playback data extracted from the score
  const cursorPositionsRef = useRef<CursorPosition[]>([]);
  const noteEventsRef = useRef<NoteEvent[]>([]);

  // Playback runtime state (in refs to avoid stale closures)
  const isPlayingRef = useRef(false);
  const startAudioTimeRef = useRef(0);
  const startBeatRef = useRef(0);
  const cursorStepRef = useRef(0);    // index into cursorPositionsRef
  const scheduleIdxRef = useRef(0);   // index into noteEventsRef
  const currentBeatRef = useRef(0);
  const bpmRef = useRef(90);

  const [state, setState] = useState<PlayerState>('loading');
  const [bpm, setBpm] = useState(90);
  const [displayBeat, setDisplayBeat] = useState(0);
  const [totalBeats, setTotalBeats] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  // ─── Score loading and note extraction ──────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        if (cancelled) return;

        const osmd = new OpenSheetMusicDisplay(containerRef.current!, {
          autoResize: true,
          backend: 'svg',
          drawTitle: true,
          drawSubtitle: true,
          followCursor: true,
          cursorsOptions: [{ type: 0, color: '#3b82f6', alpha: 0.5, follow: true }],
        });
        osmdRef.current = osmd;

        const res = await fetch(`/api/scores/${scoreId}/file`);
        if (!res.ok) throw new Error('Failed to fetch score file');
        const isMxl = res.headers.get('Content-Type') === 'application/vnd.recordare.musicxml';
        const data = isMxl ? await res.blob() : await res.text();

        await osmd.load(data as any);
        if (cancelled) return;

        osmd.render();

        // Walk cursor to extract cursor positions and note events
        const cursorPositions: CursorPosition[] = [];
        const notesByTime = new Map<number, Set<string>>();  // dedup by time+midi key
        const noteEventMap = new Map<number, NoteEvent>();

        // Walk linearly (ignore repeat signs) so timestamps match the visual layout
        (osmd.EngravingRules as any).CursorIgnoreRepetitions = true;

        osmd.cursor.reset();
        let stepIdx = 0;

        while (!(osmd.cursor.iterator as any).endReached) {
          // realValue is whole-note fractions (quarter note = 0.25); multiply by 4 → quarter beats
          const timeInBeats: number = (osmd.cursor.iterator.currentTimeStamp as any).realValue * 4;
          cursorPositions.push({ stepIdx, timeInBeats });

          const notes: any[] = osmd.cursor.NotesUnderCursor();
          for (const note of notes) {
            if (!note?.Pitch || note.isRest()) continue;
            const midi = Math.max(0, Math.min(127, note.Pitch.halfTone + 12));
            const dur = note.Length.RealValue * 4; // whole-note fractions → beats
            const key = `${midi}`;

            if (!notesByTime.has(timeInBeats)) notesByTime.set(timeInBeats, new Set());
            if (!notesByTime.get(timeInBeats)!.has(key)) {
              notesByTime.get(timeInBeats)!.add(key);
              if (!noteEventMap.has(timeInBeats)) {
                noteEventMap.set(timeInBeats, { timeInBeats, notes: [] });
              }
              noteEventMap.get(timeInBeats)!.notes.push({ midi, durationInBeats: dur });
            }
          }

          stepIdx++;
          osmd.cursor.next();
        }

        osmd.cursor.reset();
        osmd.cursor.show();

        const noteEvents = Array.from(noteEventMap.values()).sort(
          (a, b) => a.timeInBeats - b.timeInBeats
        );

        cursorPositionsRef.current = cursorPositions;
        noteEventsRef.current = noteEvents;

        const maxBeat = cursorPositions.at(-1)?.timeInBeats ?? 0;
        setTotalBeats(maxBeat);

        if (cancelled) return;
        setState('loadingAudio');

        // Pre-load soundfont
        const ac = new AudioContext();
        audioCtxRef.current = ac;
        const Soundfont = (await import('soundfont-player')).default;
        sfRef.current = await Soundfont.instrument(ac, 'acoustic_grand_piano', {
          format: 'mp3',
          soundfont: 'MusyngKite',
        });
        // Immediately suspend so we don't consume resources until user plays
        await ac.suspend();

        if (!cancelled) setState('ready');
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? 'Unknown error');
          setState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      audioCtxRef.current?.close();
    };
  }, [scoreId]);

  // ─── Animation / scheduling loop ────────────────────────────────────────────

  const animate = useCallback(() => {
    const ac = audioCtxRef.current;
    const sf = sfRef.current;
    const osmd = osmdRef.current;
    if (!ac || !isPlayingRef.current) return;

    const now = ac.currentTime;
    const elapsed = now - startAudioTimeRef.current;
    const currentBeat = startBeatRef.current + elapsed * (bpmRef.current / 60);
    currentBeatRef.current = currentBeat;
    setDisplayBeat(currentBeat);

    // Schedule notes up to 0.2 s ahead
    const scheduleUntilBeat = currentBeat + (0.2 * bpmRef.current) / 60;
    while (scheduleIdxRef.current < noteEventsRef.current.length) {
      const event = noteEventsRef.current[scheduleIdxRef.current];
      if (event.timeInBeats > scheduleUntilBeat) break;

      const when =
        startAudioTimeRef.current +
        ((event.timeInBeats - startBeatRef.current) * 60) / bpmRef.current;

      if (when >= now - 0.01 && sf) {
        for (const n of event.notes) {
          const dur = (n.durationInBeats * 60) / bpmRef.current * 0.88;
          sf.play(n.midi, Math.max(when, ac.currentTime + 0.001), {
            duration: Math.max(dur, 0.05),
            gain: 1.0,
          });
        }
      }
      scheduleIdxRef.current++;
    }

    // Advance visual cursor
    const positions = cursorPositionsRef.current;
    while (
      cursorStepRef.current < positions.length - 1 &&
      positions[cursorStepRef.current + 1].timeInBeats <= currentBeat + 0.01
    ) {
      osmd?.cursor.next();
      cursorStepRef.current++;
    }

    // Detect end of score
    const lastNoteTime = noteEventsRef.current.at(-1)?.timeInBeats ?? 0;
    const lastAudioTime =
      startAudioTimeRef.current + ((lastNoteTime - startBeatRef.current) * 60) / bpmRef.current;

    if (now > lastAudioTime + 2.5) {
      isPlayingRef.current = false;
      setState('ready');
      osmd?.cursor.reset();
      osmd?.cursor.show();
      cursorStepRef.current = 0;
      scheduleIdxRef.current = 0;
      currentBeatRef.current = 0;
      setDisplayBeat(0);
      return;
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  // ─── Controls ───────────────────────────────────────────────────────────────

  const handlePlay = useCallback(async () => {
    const ac = audioCtxRef.current;
    if (!ac) return;

    if (state === 'paused') {
      // Resume from paused position
      await ac.resume();
      startAudioTimeRef.current = ac.currentTime - (currentBeatRef.current - startBeatRef.current) * (60 / bpmRef.current);
      isPlayingRef.current = true;
      setState('playing');
      animFrameRef.current = requestAnimationFrame(animate);
      return;
    }

    // Start from beginning
    cancelAnimationFrame(animFrameRef.current);
    osmdRef.current?.cursor.reset();
    osmdRef.current?.cursor.show();
    cursorStepRef.current = 0;
    scheduleIdxRef.current = 0;
    currentBeatRef.current = 0;
    startBeatRef.current = 0;
    setDisplayBeat(0);

    await ac.resume();
    startAudioTimeRef.current = ac.currentTime + 0.15;
    isPlayingRef.current = true;
    setState('playing');
    animFrameRef.current = requestAnimationFrame(animate);
  }, [state, animate]);

  const handlePause = useCallback(async () => {
    cancelAnimationFrame(animFrameRef.current);
    isPlayingRef.current = false;
    await audioCtxRef.current?.suspend();
    setState('paused');
  }, []);

  const handleStop = useCallback(async () => {
    cancelAnimationFrame(animFrameRef.current);
    isPlayingRef.current = false;
    await audioCtxRef.current?.suspend();
    osmdRef.current?.cursor.reset();
    osmdRef.current?.cursor.show();
    cursorStepRef.current = 0;
    scheduleIdxRef.current = 0;
    currentBeatRef.current = 0;
    startBeatRef.current = 0;
    setDisplayBeat(0);
    setState('ready');
  }, []);

  const progress = totalBeats > 0 ? Math.min(displayBeat / totalBeats, 1) : 0;
  const isReady = state === 'ready' || state === 'playing' || state === 'paused';

  return (
    <div className="flex flex-col" style={{ minHeight: '100%' }}>
      {/* Score render area */}
      <div className="flex-1 bg-white overflow-auto">
        {state === 'loading' && (
          <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
            <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            <span>Rendering score…</span>
          </div>
        )}
        {state === 'loadingAudio' && (
          <div className="flex items-center justify-center h-10 gap-2 text-sm text-blue-500 bg-blue-50 border-b border-blue-100 px-4">
            <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500" />
            Loading piano sounds…
          </div>
        )}
        {state === 'error' && (
          <div className="flex items-center justify-center h-64 text-red-500 text-sm px-8 text-center">
            {error || 'Failed to load score.'}
          </div>
        )}
        <div
          ref={containerRef}
          className={state === 'error' ? 'hidden' : 'osmd-container'}
        />
      </div>

      {/* Controls bar */}
      {isReady && (
        <div className="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur px-6 py-4 flex items-center gap-4 shadow-md">
          {/* Stop */}
          <button
            onClick={handleStop}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            title="Stop"
          >
            <Square size={18} fill="currentColor" />
          </button>

          {/* Play / Pause */}
          {state === 'playing' ? (
            <button
              onClick={handlePause}
              className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
              title="Pause"
            >
              <Pause size={22} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handlePlay}
              className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shadow"
              title="Play"
            >
              <Play size={18} fill="currentColor" className="translate-x-0.5" />
            </button>
          )}

          {/* Progress bar */}
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-none"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          {/* BPM control */}
          <div className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
            <span className="font-medium">BPM</span>
            <input
              type="range"
              min={30}
              max={240}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              disabled={state === 'playing'}
              className="w-28 accent-blue-500 disabled:opacity-50"
            />
            <span className="w-8 text-right tabular-nums">{bpm}</span>
          </div>
        </div>
      )}
    </div>
  );
}
