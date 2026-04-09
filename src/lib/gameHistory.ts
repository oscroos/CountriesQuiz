import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'countries-quiz.history.v1';
const MAX_HISTORY_ENTRIES = 40;

export type GameHistoryEntry = {
  accuracy: number;
  correctCount: number;
  durationMs: number;
  misses: number;
  playedAt: string;
  score: number;
  totalQuestions: number;
  variantId: string;
  variantLabel: string;
};

function sanitizeEntry(value: unknown): GameHistoryEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const entry = value as Partial<GameHistoryEntry>;
  if (
    typeof entry.variantId !== 'string' ||
    typeof entry.variantLabel !== 'string' ||
    typeof entry.score !== 'number' ||
    typeof entry.accuracy !== 'number' ||
    typeof entry.durationMs !== 'number' ||
    typeof entry.correctCount !== 'number' ||
    typeof entry.totalQuestions !== 'number' ||
    typeof entry.misses !== 'number' ||
    typeof entry.playedAt !== 'string'
  ) {
    return null;
  }

  return {
    accuracy: entry.accuracy,
    correctCount: entry.correctCount,
    durationMs: entry.durationMs,
    misses: entry.misses,
    playedAt: entry.playedAt,
    score: entry.score,
    totalQuestions: entry.totalQuestions,
    variantId: entry.variantId,
    variantLabel: entry.variantLabel,
  };
}

export async function loadGameHistory() {
  try {
    const rawValue = await AsyncStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return [] as GameHistoryEntry[];
    }

    const parsed = JSON.parse(rawValue) as unknown[];
    if (!Array.isArray(parsed)) {
      return [] as GameHistoryEntry[];
    }

    return parsed
      .map(sanitizeEntry)
      .filter((entry): entry is GameHistoryEntry => Boolean(entry));
  } catch {
    return [] as GameHistoryEntry[];
  }
}

export async function saveGameHistory(entries: readonly GameHistoryEntry[]) {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES))
  );
}

export async function prependGameHistoryEntry(
  existingEntries: readonly GameHistoryEntry[],
  entry: GameHistoryEntry
) {
  const nextEntries = [entry, ...existingEntries].slice(0, MAX_HISTORY_ENTRIES);
  await saveGameHistory(nextEntries);
  return nextEntries;
}
