import type { GameVariant } from './gameCatalog';

export function trackAppOpen() {
  // Expo Go build: analytics is intentionally disabled.
}

export function trackScreenView(_screenName: string) {
  // Expo Go build: analytics is intentionally disabled.
}

export function trackGameStarted(_variant: GameVariant, _sessionGameIndex: number) {
  // Expo Go build: analytics is intentionally disabled.
}

export function trackGameFinished(_result: {
  accuracy: number;
  bestStreak: number;
  correctCount: number;
  durationMs: number;
  misses: number;
  score: number;
  sessionGameIndex: number;
  totalQuestions: number;
  variant: GameVariant;
}) {
  // Expo Go build: analytics is intentionally disabled.
}

export function trackGameAbandoned(_result: {
  answeredCount: number;
  durationMs: number;
  misses: number;
  score: number;
  sessionGameIndex: number;
  totalQuestions: number;
  variant: GameVariant;
}) {
  // Expo Go build: analytics is intentionally disabled.
}

export function trackHighscoreEarned(_result: {
  score: number;
  totalQuestions: number;
  variant: GameVariant;
}) {
  // Expo Go build: analytics is intentionally disabled.
}

export function trackSummaryAction(
  _action: 'leave' | 'play_again',
  _variant: GameVariant,
  _score: number,
  _totalQuestions: number
) {
  // Expo Go build: analytics is intentionally disabled.
}
