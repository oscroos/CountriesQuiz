import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'countries-quiz.highscores.v1';

export type HighscoreEntry = {
  bestAccuracy: number;
  bestScore: number;
  fastestMs: number | null;
  lastPlayedAt: string | null;
  plays: number;
};

export type HighscoreMap = Record<string, HighscoreEntry>;

export type CompletedGameResult = {
  accuracy: number;
  durationMs: number;
  score: number;
  totalQuestions: number;
  variantId: string;
};

function createEmptyEntry(): HighscoreEntry {
  return {
    bestAccuracy: 0,
    bestScore: 0,
    fastestMs: null,
    lastPlayedAt: null,
    plays: 0,
  };
}

function sanitizeEntry(value: unknown): HighscoreEntry {
  if (!value || typeof value !== 'object') {
    return createEmptyEntry();
  }

  const entry = value as Partial<HighscoreEntry>;

  return {
    bestAccuracy: typeof entry.bestAccuracy === 'number' ? entry.bestAccuracy : 0,
    bestScore: typeof entry.bestScore === 'number' ? entry.bestScore : 0,
    fastestMs:
      typeof entry.fastestMs === 'number' && Number.isFinite(entry.fastestMs)
        ? entry.fastestMs
        : null,
    lastPlayedAt: typeof entry.lastPlayedAt === 'string' ? entry.lastPlayedAt : null,
    plays: typeof entry.plays === 'number' ? entry.plays : 0,
  };
}

export async function loadHighscores() {
  try {
    const rawValue = await AsyncStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return {} as HighscoreMap;
    }

    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([variantId, entry]) => [variantId, sanitizeEntry(entry)])
    ) as HighscoreMap;
  } catch {
    return {} as HighscoreMap;
  }
}

export async function saveHighscores(highscores: HighscoreMap) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(highscores));
}

export async function recordHighscore(
  highscores: HighscoreMap,
  result: CompletedGameResult
) {
  const existingEntry = highscores[result.variantId] ?? createEmptyEntry();
  const existingBestScore = Math.min(
    Math.max(0, existingEntry.bestScore),
    Math.max(0, result.totalQuestions)
  );
  const nextEntry: HighscoreEntry = {
    bestAccuracy: Math.max(existingEntry.bestAccuracy, result.accuracy),
    bestScore: Math.max(existingBestScore, result.score),
    fastestMs:
      existingEntry.fastestMs === null
        ? result.durationMs
        : Math.min(existingEntry.fastestMs, result.durationMs),
    lastPlayedAt: new Date().toISOString(),
    plays: existingEntry.plays + 1,
  };

  const nextHighscores = {
    ...highscores,
    [result.variantId]: nextEntry,
  };

  await saveHighscores(nextHighscores);
  return nextHighscores;
}
