import { getAnalytics, logEvent as logFirebaseEvent } from '@react-native-firebase/analytics';

import type { GameVariant } from './gameCatalog';

type AnalyticsPrimitive = number | string;
type AnalyticsParams = Record<string, AnalyticsPrimitive>;

const ANALYTICS_SCREEN_CLASS = 'CountriesQuiz';

function runAnalytics(action: () => Promise<unknown>) {
  try {
    void action().catch(() => undefined);
  } catch {
    // Analytics should never interrupt gameplay.
  }
}

function getVariantParams(variant: GameVariant) {
  return {
    game_mode: variant.mode,
    includes_us_states: variant.showUsStates ? 1 : 0,
    question_count: variant.placeCount,
    region_id: variant.region,
    variant_id: variant.id,
  };
}

function logAnalyticsEvent(name: string, params?: AnalyticsParams) {
  runAnalytics(() => logFirebaseEvent(getAnalytics(), name, params));
}

export function trackAppOpen() {
  logAnalyticsEvent('app_open');
}

export function trackScreenView(screenName: string) {
  logAnalyticsEvent('screen_view', {
    screen_class: ANALYTICS_SCREEN_CLASS,
    screen_name: screenName,
  });
}

export function trackGameStarted(variant: GameVariant, sessionGameIndex: number) {
  logAnalyticsEvent('game_start', {
    ...getVariantParams(variant),
    session_game_index: sessionGameIndex,
  });
}

export function trackGameFinished({
  accuracy,
  bestStreak,
  correctCount,
  durationMs,
  misses,
  score,
  sessionGameIndex,
  totalQuestions,
  variant,
}: {
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
  logAnalyticsEvent('game_end', {
    ...getVariantParams(variant),
    accuracy_percent: Math.round(accuracy),
    best_streak: bestStreak,
    completed_round: score >= totalQuestions ? 1 : 0,
    correct_count: correctCount,
    duration_ms: durationMs,
    duration_sec: Math.round(durationMs / 1000),
    misses,
    score,
    session_game_index: sessionGameIndex,
    total_questions: totalQuestions,
  });
}

export function trackGameAbandoned({
  answeredCount,
  durationMs,
  misses,
  score,
  sessionGameIndex,
  totalQuestions,
  variant,
}: {
  answeredCount: number;
  durationMs: number;
  misses: number;
  score: number;
  sessionGameIndex: number;
  totalQuestions: number;
  variant: GameVariant;
}) {
  logAnalyticsEvent('game_abandon', {
    ...getVariantParams(variant),
    answered_count: answeredCount,
    duration_ms: durationMs,
    duration_sec: Math.round(durationMs / 1000),
    misses,
    score,
    session_game_index: sessionGameIndex,
    total_questions: totalQuestions,
  });
}

export function trackHighscoreEarned({
  score,
  totalQuestions,
  variant,
}: {
  score: number;
  totalQuestions: number;
  variant: GameVariant;
}) {
  logAnalyticsEvent('highscore_earned', {
    ...getVariantParams(variant),
    score,
    total_questions: totalQuestions,
  });
}

export function trackSummaryAction(
  action: 'leave' | 'play_again',
  variant: GameVariant,
  score: number,
  totalQuestions: number
) {
  logAnalyticsEvent('summary_action', {
    action,
    ...getVariantParams(variant),
    score,
    total_questions: totalQuestions,
  });
}
