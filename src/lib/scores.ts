import fs from 'fs';
import path from 'path';
import type { ScoreMetadata } from './types';

const DATA_DIR = path.join(process.cwd(), 'data', 'scores');
const INDEX_FILE = path.join(process.cwd(), 'data', 'index.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, '[]');
}

export function getScores(): ScoreMetadata[] {
  ensureDataDir();
  return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
}

export function getScore(id: string): ScoreMetadata | undefined {
  return getScores().find((s) => s.id === id);
}

export function addScore(metadata: ScoreMetadata, content: Buffer): void {
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, metadata.filename), content);
  const scores = getScores();
  scores.unshift(metadata);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(scores, null, 2));
}

export function removeScore(id: string): boolean {
  const scores = getScores();
  const idx = scores.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  const [removed] = scores.splice(idx, 1);
  const filePath = path.join(DATA_DIR, removed.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(scores, null, 2));
  return true;
}

export function getScoreFilePath(id: string): string | undefined {
  const score = getScore(id);
  if (!score) return undefined;
  const p = path.join(DATA_DIR, score.filename);
  return fs.existsSync(p) ? p : undefined;
}

export function extractXmlMetadata(xml: string): { title: string; composer: string } {
  const movTitle = xml.match(/<movement-title[^>]*>([\s\S]*?)<\/movement-title>/)?.[1]?.trim();
  const workTitle = xml.match(/<work-title[^>]*>([\s\S]*?)<\/work-title>/)?.[1]?.trim();
  const creditWords = xml
    .match(/<credit-words[^>]*>([\s\S]*?)<\/credit-words>/g)
    ?.map((m) => m.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  const composer =
    xml.match(/<creator[^>]*type="composer"[^>]*>([\s\S]*?)<\/creator>/)?.[1]?.trim() ||
    xml.match(/<creator[^>]*>([\s\S]*?)<\/creator>/)?.[1]?.trim() ||
    '';
  return {
    title: movTitle || workTitle || creditWords?.[0] || 'Untitled',
    composer,
  };
}
