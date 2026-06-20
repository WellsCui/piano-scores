import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execFileAsync = promisify(execFile);

// Candidate locations in preference order
function findBin(): string | undefined {
  const candidates: string[] = [];

  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Audiveris.app/Contents/MacOS/Audiveris',
      path.join(process.cwd(), 'bin', 'audiveris', 'bin', 'Audiveris'),
    );
  } else if (process.platform === 'win32') {
    candidates.push(
      path.join(process.cwd(), 'bin', 'audiveris', 'bin', 'Audiveris.bat'),
    );
  } else {
    candidates.push(
      '/usr/bin/audiveris',
      '/usr/local/bin/audiveris',
      path.join(process.cwd(), 'bin', 'audiveris', 'bin', 'Audiveris'),
    );
  }

  return candidates.find((p) => fs.existsSync(p));
}

export function isAudiverisInstalled(): boolean {
  return findBin() !== undefined;
}

function findMusicXml(dir: string): string | undefined {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMusicXml(full);
      if (found) return found;
    } else if (entry.name.endsWith('.mxl') || entry.name.endsWith('.xml')) {
      return full;
    }
  }
}

function extractAudiverisError(stdout: string): string {
  const lines = stdout.split('\n').filter(Boolean);
  const errorLines = lines.filter((l) => /WARN|ERROR|Exception/.test(l));
  return errorLines.slice(-5).join('\n') || stdout.slice(-500);
}

export async function convertPdfToMusicXml(
  pdfPath: string
): Promise<{ content: Buffer; ext: 'mxl' | 'xml' }> {
  const bin = findBin();
  if (!bin) throw new Error('Audiveris is not installed.');

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audiveris-out-'));
  try {
    try {
      await execFileAsync(bin, ['-batch', '-transcribe', '-export', '-output', outDir, pdfPath], {
        timeout: 300_000,
        env: { ...process.env, JDK_JAVA_OPTIONS: '-Djava.awt.headless=true' },
      });
    } catch (execErr: unknown) {
      const killed = execErr instanceof Error && (execErr as NodeJS.ErrnoException & { killed?: boolean }).killed;
      if (killed) {
        throw new Error('Audiveris timed out (> 5 minutes). Try a shorter or simpler PDF.');
      }
      const stdout = execErr instanceof Error && 'stdout' in execErr
        ? String((execErr as Record<string, unknown>).stdout)
        : '';
      throw new Error(stdout ? extractAudiverisError(stdout) : 'Audiveris failed to process the PDF.');
    }

    const xmlPath = findMusicXml(outDir);
    if (!xmlPath) {
      const logFile = fs.readdirSync(outDir).find((f) => f.endsWith('.log'));
      const logContent = logFile ? fs.readFileSync(path.join(outDir, logFile), 'utf-8') : '';
      const hint = logContent ? extractAudiverisError(logContent) : '';
      throw new Error(
        hint
          ? `Audiveris could not export MusicXML: ${hint}`
          : 'Audiveris produced no output. The PDF may not contain readable music notation.'
      );
    }

    const ext = xmlPath.endsWith('.mxl') ? ('mxl' as const) : ('xml' as const);
    return { content: fs.readFileSync(xmlPath), ext };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}
