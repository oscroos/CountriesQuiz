import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { GameFlatMap } from './src/components/GameFlatMap';
import { GameGlobe } from './src/components/GameGlobe';
import {
  buildQuestionSet,
  gameVariants,
  getVariantById,
  getVariantSubtitle,
  type GameMode,
  type GameVariant,
  type PlaceOption,
} from './src/lib/gameCatalog';
import {
  loadGameHistory,
  prependGameHistoryEntry,
  type GameHistoryEntry,
} from './src/lib/gameHistory';
import {
  loadHighscores,
  recordHighscore,
  type CompletedGameResult,
  type HighscoreMap,
} from './src/lib/highscores';
import { US_STATES_REGION_KEY, US_STATES_REGION_LABEL } from './src/lib/usStates';
import { getThemeDefinition, type AppMapColors } from './src/theme/colors';

type MenuRegionKey =
  | 'europe'
  | 'africa'
  | 'asia'
  | 'north-america'
  | 'south-america'
  | 'oceania'
  | typeof US_STATES_REGION_KEY;

type GameSession = {
  bestStreak: number;
  correctCount: number;
  currentIndex: number;
  currentQuestionStartedAt: number;
  feedback: { kind: 'correct' | 'wrong'; label: string } | null;
  locked: boolean;
  misses: number;
  questionSet: readonly PlaceOption[];
  score: number;
  solvedPlaceIds: string[];
  startedAt: number;
  streak: number;
  variant: GameVariant;
  wrongFlashId: string | null;
};

type GameSummary = {
  correctCount: number;
  isNewBest: boolean;
  score: number;
  totalQuestions: number;
  variant: GameVariant;
};

const uiTheme = {
  background: '#f3eee6',
  backgroundStrong: '#102f46',
  backgroundDeep: '#0b2031',
  surface: '#fffaf2',
  surfaceSoft: 'rgba(255, 250, 242, 0.84)',
  surfaceTint: '#f6efe4',
  border: 'rgba(16, 47, 70, 0.12)',
  borderStrong: 'rgba(16, 47, 70, 0.2)',
  text: '#15283a',
  textMuted: '#657a8b',
  accent: '#ff9b57',
  accentStrong: '#e9723d',
  success: '#197d70',
  danger: '#d4634a',
  shadow: 'rgba(16, 47, 70, 0.16)',
};

const quizMapTheme: AppMapColors = {
  ...getThemeDefinition('coast').mapColors,
  user: '#1d78b8',
  friendOne: '#db6f4f',
  friendTwo: '#e2a33c',
  unvisited: '#bcc9cf',
  stroke: '#f4fbfc',
  ocean: '#d7e6ea',
  background: '#eef5f6',
  tooltipBg: 'rgba(17, 35, 52, 0.94)',
  tooltipText: '#fffaf2',
};

const regionVariantIds: readonly string[] = gameVariants
  .filter((variant) => variant.mode === 'region')
  .map((variant) => variant.id);

const regionDashboardRows = [
  ['region-europe', 'region-africa'],
  ['region-asia', 'region-north-america'],
  ['region-south-america', 'region-oceania', `region-${US_STATES_REGION_KEY}`],
] as const;

function resolveVariantId(
  mode: GameMode,
  selectedRegion: MenuRegionKey,
  includeUsStatesOnGlobe: boolean
) {
  if (mode === 'globe') {
    return includeUsStatesOnGlobe ? 'globe-world-us-states' : 'globe-world';
  }

  return `region-${selectedRegion}`;
}

function formatPlayedAt(value: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function createGameSession(variant: GameVariant): GameSession {
  return {
    bestStreak: 0,
    correctCount: 0,
    currentIndex: 0,
    currentQuestionStartedAt: Date.now(),
    feedback: null,
    locked: false,
    misses: 0,
    questionSet: buildQuestionSet(variant),
    score: 0,
    solvedPlaceIds: [],
    startedAt: Date.now(),
    streak: 0,
    variant,
    wrongFlashId: null,
  };
}

function BoardMetric({
  accent,
  bestScore,
  compact,
  variant,
}: {
  accent: string;
  bestScore: number;
  compact: boolean;
  variant: GameVariant;
}) {
  return (
    <View
      style={[
        styles.metricTile,
        styles.boardMetric,
        compact && styles.boardMetricCompact,
        {
          borderColor: `${accent}55`,
        },
      ]}
    >
      <View style={[styles.boardMetricAccent, { backgroundColor: accent }]} />
      <Text style={[styles.boardMetricTitle, compact && styles.boardMetricTitleCompact]}>
        {variant.shortLabel}
      </Text>
      <View style={[styles.boardMetricScoreWrap, compact && styles.boardMetricScoreWrapCompact]}>
        <Text style={[styles.boardMetricValue, compact && styles.boardMetricValueCompact]}>
          {bestScore}
        </Text>
        <Text style={[styles.boardMetricContext, compact && styles.boardMetricContextCompact]}>
          out of {variant.placeCount}
        </Text>
      </View>
    </View>
  );
}

function HeroSectionHeader({
  icon,
  title,
}: {
  icon: 'globe' | 'map';
  title: string;
}) {
  return (
    <View style={styles.heroSectionHeader}>
      <View style={styles.heroSectionIconWrap}>
        <Feather color={uiTheme.surface} name={icon} size={14} />
      </View>
      <Text style={styles.heroSectionTitle}>{title}</Text>
    </View>
  );
}

function AppContent() {
  const { height: screenHeight } = useWindowDimensions();
  const [mode, setMode] = useState<GameMode>('globe');
  const [selectedRegion, setSelectedRegion] = useState<MenuRegionKey>('europe');
  const [includeUsStatesOnGlobe, setIncludeUsStatesOnGlobe] = useState(false);
  const [highscores, setHighscores] = useState<HighscoreMap>({});
  const [gameHistory, setGameHistory] = useState<GameHistoryEntry[]>([]);
  const [isLoadingHighscores, setIsLoadingHighscores] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [session, setSession] = useState<GameSession | null>(null);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [homeScreenHeight, setHomeScreenHeight] = useState(screenHeight);
  const [homeButtonsHeight, setHomeButtonsHeight] = useState(132);
  const [homeHeroIntroHeight, setHomeHeroIntroHeight] = useState(148);

  const highscoresRef = useRef<HighscoreMap>({});
  const gameHistoryRef = useRef<GameHistoryEntry[]>([]);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const selectedVariantId = resolveVariantId(mode, selectedRegion, includeUsStatesOnGlobe);
  const selectedVariant = useMemo(() => getVariantById(selectedVariantId), [selectedVariantId]);
  const globeVariants = useMemo(
    () => gameVariants.filter((variant) => variant.mode === 'globe'),
    []
  );
  const regionVariants = useMemo(
    () => gameVariants.filter((variant) => regionVariantIds.includes(variant.id)),
    []
  );
  const regionVariantsById = useMemo(
    () => Object.fromEntries(regionVariants.map((variant) => [variant.id, variant])),
    [regionVariants]
  );
  const homeBoardsHeight = useMemo(() => {
    const measuredHeight = homeScreenHeight - homeButtonsHeight - homeHeroIntroHeight - 52;
    const fallbackHeight = screenHeight * 0.47;
    const resolvedHeight = measuredHeight > 0 ? measuredHeight : fallbackHeight;

    return Math.max(146, Math.floor(resolvedHeight));
  }, [homeButtonsHeight, homeHeroIntroHeight, homeScreenHeight, screenHeight]);
  const boardRowHeight = useMemo(() => {
    const reservedHeight = 102;
    return Math.max(15, Math.floor((homeBoardsHeight - reservedHeight) / 4));
  }, [homeBoardsHeight]);
  const isCompactBoardLayout = boardRowHeight < 56;

  useEffect(() => {
    setHomeScreenHeight(screenHeight);
  }, [screenHeight]);

  const regionBoardRows = useMemo(
    () =>
      regionDashboardRows.map((row) =>
        row
          .map((variantId) => regionVariantsById[variantId])
          .filter((variant): variant is GameVariant => Boolean(variant))
      ),
    [regionVariantsById]
  );

  useEffect(() => {
    highscoresRef.current = highscores;
  }, [highscores]);

  useEffect(() => {
    gameHistoryRef.current = gameHistory;
  }, [gameHistory]);

  useEffect(() => {
    let isActive = true;

    Promise.allSettled([loadHighscores(), loadGameHistory()]).then((results) => {
      if (!isActive) {
        return;
      }

      const highscoresResult = results[0];
      if (highscoresResult.status === 'fulfilled') {
        setHighscores(highscoresResult.value);
      }
      setIsLoadingHighscores(false);

      const historyResult = results[1];
      if (historyResult.status === 'fulfilled') {
        setGameHistory(historyResult.value);
      }
      setIsLoadingHistory(false);
    });

    return () => {
      isActive = false;
      clearPendingTimers();
    };
  }, []);

  function clearPendingTimers() {
    timerRefs.current.forEach((timerId) => clearTimeout(timerId));
    timerRefs.current = [];
  }

  function scheduleAction(action: () => void, delayMs: number) {
    const timerId = setTimeout(action, delayMs);
    timerRefs.current.push(timerId);
  }

  function beginGame(variant: GameVariant) {
    clearPendingTimers();
    setSummary(null);
    setIsStartModalOpen(false);
    setSession(createGameSession(variant));
  }

  function handleStartPress() {
    setIsStartModalOpen(true);
  }

  function handleConfirmStart() {
    beginGame(selectedVariant);
  }

  function handleSelection(selection: { id: string; kind: 'country' | 'state'; label: string }) {
    setSession((currentSession) => {
      if (!currentSession || currentSession.locked || summary) {
        return currentSession;
      }

      const currentQuestion = currentSession.questionSet[currentSession.currentIndex];
      if (!currentQuestion) {
        return currentSession;
      }

      if (selection.id === currentQuestion.id) {
        const nextScore = currentSession.score + 1;
        const nextStreak = currentSession.streak + 1;
        const solvedPlaceIds = [...currentSession.solvedPlaceIds, currentQuestion.id];
        const updatedSession: GameSession = {
          ...currentSession,
          bestStreak: Math.max(currentSession.bestStreak, nextStreak),
          correctCount: currentSession.correctCount + 1,
          feedback: { kind: 'correct', label: currentQuestion.displayName },
          locked: true,
          score: nextScore,
          solvedPlaceIds,
          streak: nextStreak,
          wrongFlashId: null,
        };

        const isLastQuestion =
          currentSession.currentIndex >= currentSession.questionSet.length - 1;

        scheduleAction(() => {
          if (isLastQuestion) {
            finalizeGame({
              ...updatedSession,
              feedback: null,
              locked: true,
            });
            return;
          }

          setSession((latestSession) => {
            if (!latestSession) {
              return latestSession;
            }

            return {
              ...latestSession,
              currentIndex: latestSession.currentIndex + 1,
              currentQuestionStartedAt: Date.now(),
              feedback: null,
              locked: false,
              wrongFlashId: null,
            };
          });
        }, 460);

        return updatedSession;
      }

      const updatedSession: GameSession = {
        ...currentSession,
        feedback: { kind: 'wrong', label: selection.label },
        locked: true,
        misses: currentSession.misses + 1,
        score: currentSession.score,
        streak: 0,
        wrongFlashId: selection.id,
      };

      scheduleAction(() => {
        finalizeGame({
          ...updatedSession,
          feedback: null,
          wrongFlashId: null,
        });
      }, 460);

      return updatedSession;
    });
  }

  function finalizeGame(finalSession: GameSession) {
    clearPendingTimers();
    const durationMs = 0;
    const accuracy = finalSession.questionSet.length
      ? (finalSession.correctCount / finalSession.questionSet.length) * 100
      : 0;
    const score = finalSession.correctCount;
    const previousEntry = highscoresRef.current[finalSession.variant.id];
    const previousBestScore = previousEntry
      ? Math.min(previousEntry.bestScore, finalSession.questionSet.length)
      : 0;
    const isNewBest = !previousEntry || score > previousBestScore;

    setSession({
      ...finalSession,
      feedback: null,
      locked: true,
      score,
      wrongFlashId: null,
    });

    setSummary({
      correctCount: finalSession.correctCount,
      isNewBest,
      score,
      totalQuestions: finalSession.questionSet.length,
      variant: finalSession.variant,
    });

    const resultForStorage: CompletedGameResult = {
      accuracy,
      durationMs,
      score,
      totalQuestions: finalSession.questionSet.length,
      variantId: finalSession.variant.id,
    };

    recordHighscore(highscoresRef.current, resultForStorage)
      .then((nextHighscores) => {
        setHighscores(nextHighscores);
      })
      .catch(() => {
        // Ignore persistence errors and keep the in-memory summary.
      });

    const historyEntry: GameHistoryEntry = {
      accuracy,
      correctCount: finalSession.correctCount,
      durationMs,
      misses: finalSession.misses,
      playedAt: new Date().toISOString(),
      score,
      totalQuestions: finalSession.questionSet.length,
      variantId: finalSession.variant.id,
      variantLabel: finalSession.variant.label,
    };

    prependGameHistoryEntry(gameHistoryRef.current, historyEntry)
      .then((nextHistory) => {
        setGameHistory(nextHistory);
      })
      .catch(() => {
        // Ignore persistence errors and keep the in-memory summary.
      });
  }

  function goBackToDashboard() {
    clearPendingTimers();
    setSummary(null);
    setSession(null);
  }

  function handleSummaryReplay() {
    if (!summary) {
      return;
    }

    beginGame(summary.variant);
  }

  function handleSummaryDashboard() {
    goBackToDashboard();
  }

  const currentQuestion = session?.questionSet[session.currentIndex] ?? null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0f334d', '#19516a', '#2a6a75']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.pageGlowOne} />
      <View style={styles.pageGlowTwo} />

      {session ? (
        <View style={styles.gameScreen}>
          <View style={styles.gameTopBar}>
            <Pressable style={styles.iconPill} onPress={goBackToDashboard}>
              <Feather color={uiTheme.surface} name="chevron-left" size={18} />
              <Text style={styles.iconPillText}>Dashboard</Text>
            </Pressable>
            <View style={styles.topBarMetrics}>
              <MetricChip icon="target" label={`${session.currentIndex + 1}/${session.questionSet.length}`} />
              <MetricChip icon="zap" label={`${session.score}`} />
            </View>
          </View>

          <View style={styles.promptCard}>
            <Text style={styles.promptEyebrow}>{session.variant.label}</Text>
            <Text style={styles.promptTitle}>
              {summary ? 'Run Complete' : `Find ${currentQuestion?.displayName ?? ''}`}
            </Text>
            <Text style={styles.promptSubtitle}>
              {summary
                ? `Score ${summary.score}/${summary.totalQuestions}`
                : `First wrong answer ends the run.`}
            </Text>
          </View>

          <View style={styles.mapStage}>
            {session.variant.mode === 'globe' ? (
              <GameGlobe
                disabled={session.locked || Boolean(summary)}
                flashPlaceId={session.wrongFlashId}
                fillAvailableSpace
                mapTheme={quizMapTheme}
                onSelectPlace={handleSelection}
                showUsStates={session.variant.showUsStates}
                solvedPlaceIds={session.solvedPlaceIds}
              />
            ) : (
              <GameFlatMap
                disabled={session.locked || Boolean(summary)}
                fillAvailableSpace
                flashPlaceId={session.wrongFlashId}
                mapTheme={quizMapTheme}
                onSelectPlace={handleSelection}
                region={session.variant.region}
                showUsStates={session.variant.showUsStates}
                solvedPlaceIds={session.solvedPlaceIds}
              />
            )}
          </View>

          <View style={styles.gameBottomRow}>
            <StatCard
              label="Score"
              tone="accent"
              value={String(session.score)}
            />
            <StatCard
              label="Remaining"
              tone="surface"
              value={String(session.questionSet.length - session.correctCount)}
            />
            <StatCard
              label="Total"
              tone="surface"
              value={String(session.questionSet.length)}
            />
          </View>

          {session.feedback && !summary ? (
            <View
              style={[
                styles.feedbackToast,
                session.feedback.kind === 'correct'
                  ? styles.feedbackToastSuccess
                  : styles.feedbackToastDanger,
              ]}
            >
              <Text style={styles.feedbackTitle}>
                {session.feedback.kind === 'correct' ? 'Nice hit' : 'Try again'}
              </Text>
              <Text style={styles.feedbackText}>{session.feedback.label}</Text>
            </View>
          ) : null}

          {summary ? (
            <View style={styles.summaryOverlay}>
              <View style={styles.summaryCard}>
                <View style={styles.summaryBadgeRow}>
                  <View style={styles.summaryBadge}>
                    <MaterialCommunityIcons
                      color={summary.isNewBest ? uiTheme.backgroundStrong : uiTheme.text}
                      name={summary.isNewBest ? 'trophy-outline' : 'map-search-outline'}
                      size={20}
                    />
                    <Text style={styles.summaryBadgeText}>
                      {summary.isNewBest ? 'New Highscore' : 'Run Locked In'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.summaryTitle}>{summary.variant.label}</Text>
                <Text style={styles.summarySubtitle}>{getVariantSubtitle(summary.variant)}</Text>

                <View style={styles.summaryMetricsGrid}>
                  <SummaryMetric label="Correct" value={String(summary.score)} />
                  <SummaryMetric label="Total" value={String(summary.totalQuestions)} />
                </View>

                <Text style={styles.summaryDetail}>
                  {summary.score === summary.totalQuestions
                    ? 'Perfect run.'
                    : `${summary.correctCount} correct before the first miss.`}
                </Text>

                <View style={styles.summaryButtonRow}>
                  <PrimaryButton label="Play Again" onPress={handleSummaryReplay} />
                  <SecondaryButton label="Dashboard" onPress={handleSummaryDashboard} />
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={styles.homeScreen}
          onLayout={(event) => setHomeScreenHeight(event.nativeEvent.layout.height)}
        >
          <View style={styles.homeBackdropCircleOne} />
          <View style={styles.homeBackdropCircleTwo} />

          <View style={styles.homeHero}>
            <View
              style={styles.homeHeroIntro}
              onLayout={(event) => setHomeHeroIntroHeight(event.nativeEvent.layout.height)}
            >
              <View style={styles.homeHeroCopy}>
                <Text style={styles.homeHeroEyebrow}>Countries Quiz</Text>
                <Text style={styles.homeHeroTitle}>Learn the World Map</Text>
                <Text style={styles.homeHeroBody}>
                  Practice every country and region until the full map becomes second nature.
                </Text>
              </View>
            </View>

            <View style={[styles.homeHeroBoards, { height: homeBoardsHeight }]}>
              {isLoadingHighscores ? (
                <View style={styles.heroLoadingCard}>
                  <ActivityIndicator color={uiTheme.surface} size="small" />
                  <Text style={styles.heroLoadingLabel}>Loading scores...</Text>
                </View>
              ) : (
                <>
                  <View style={styles.heroBoardSection}>
                    <HeroSectionHeader icon="globe" title="Global" />
                    <View style={[styles.heroBoardRow, { height: boardRowHeight }]}>
                      {globeVariants.map((variant) => {
                        const entry = highscores[variant.id];
                        const bestScore = Math.min(entry?.bestScore ?? 0, variant.placeCount);

                        return (
                          <BoardMetric
                            key={variant.id}
                            accent={variant.accent}
                            bestScore={bestScore}
                            compact={isCompactBoardLayout}
                            variant={variant}
                          />
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.heroBoardSection}>
                    <HeroSectionHeader icon="map" title="Regions" />
                    <View style={styles.heroBoardRows}>
                      {regionBoardRows.map((row, rowIndex) => (
                        <View key={`region-row-${rowIndex}`} style={[styles.heroBoardRow, { height: boardRowHeight }]}>
                          {row.map((variant) => {
                            const entry = highscores[variant.id];
                            const bestScore = Math.min(entry?.bestScore ?? 0, variant.placeCount);

                            return (
                              <BoardMetric
                                key={variant.id}
                                accent={variant.accent}
                                bestScore={bestScore}
                                compact={isCompactBoardLayout}
                                variant={variant}
                              />
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>

          <View
            style={styles.homeButtons}
            onLayout={(event) => setHomeButtonsHeight(event.nativeEvent.layout.height)}
          >
            <SecondaryButton
              label="Game History"
              onPress={() => setIsHistoryModalOpen(true)}
            />
            <PrimaryButton label="Start Game" onPress={handleStartPress} />
          </View>
        </View>
      )}

      <Modal
        animationType="slide"
        transparent
        visible={isStartModalOpen}
        onRequestClose={() => setIsStartModalOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetEyebrow}>Start Game</Text>
            <Text style={styles.sheetTitle}>Choose your quiz surface</Text>
            <Text style={styles.sheetBody}>
              The landing page stays minimal, so game setup lives here.
            </Text>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.segmentRow}>
                <SegmentButton
                  active={mode === 'globe'}
                  icon="globe"
                  label="Globe"
                  onPress={() => setMode('globe')}
                />
                <SegmentButton
                  active={mode === 'region'}
                  icon="map"
                  label="Region"
                  onPress={() => setMode('region')}
                />
              </View>

              {mode === 'globe' ? (
                <View style={styles.toggleCard}>
                  <View style={styles.toggleCopy}>
                    <Text style={styles.toggleTitle}>Break the U.S. into states</Text>
                    <Text style={styles.toggleBody}>
                      Keep the full globe, but split the USA into all 50 states.
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.toggleSwitch,
                      includeUsStatesOnGlobe && styles.toggleSwitchActive,
                    ]}
                    onPress={() => setIncludeUsStatesOnGlobe((currentValue) => !currentValue)}
                  >
                    <View
                      style={[
                        styles.toggleKnob,
                        includeUsStatesOnGlobe && styles.toggleKnobActive,
                      ]}
                    />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.regionPicker}>
                  {regionVariants.map((variant) => {
                    const isActive = selectedRegion === variant.region;
                    return (
                      <Pressable
                        key={variant.id}
                        style={[
                          styles.regionChip,
                          isActive && {
                            backgroundColor: variant.accent,
                            borderColor: variant.accent,
                          },
                        ]}
                        onPress={() => setSelectedRegion(variant.region as MenuRegionKey)}
                      >
                        <Text
                          style={[
                            styles.regionChipText,
                            isActive && styles.regionChipTextActive,
                          ]}
                        >
                          {variant.region === US_STATES_REGION_KEY ? US_STATES_REGION_LABEL : variant.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={styles.variantPreview}>
                <View style={styles.variantBadgeRow}>
                  <View style={[styles.variantAccentDot, { backgroundColor: selectedVariant.accent }]} />
                  <Text style={styles.variantPreviewTitle}>{selectedVariant.label}</Text>
                </View>
                <Text style={styles.variantPreviewBody}>{selectedVariant.description}</Text>
                <View style={styles.variantMetaRow}>
                  <MetaTile label="Places" value={String(selectedVariant.placeCount)} />
                  <MetaTile label="Goal" value={String(selectedVariant.placeCount)} />
                  <MetaTile
                    label="Surface"
                    value={selectedVariant.mode === 'globe' ? '3D globe' : 'Flat map'}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.sheetButtonRow}>
              <PrimaryButton
                label="Start Run"
                onPress={handleConfirmStart}
              />
              <SecondaryButton
                label="Close"
                onPress={() => setIsStartModalOpen(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={isHistoryModalOpen}
        onRequestClose={() => setIsHistoryModalOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetEyebrow}>Game History</Text>
            <Text style={styles.sheetTitle}>Recent runs</Text>
            <Text style={styles.sheetBody}>
              Your latest completed rounds are stored locally on this device.
            </Text>

            {isLoadingHistory ? (
              <View style={styles.loadingCard}>
                <ActivityIndicator color={uiTheme.backgroundStrong} size="small" />
                <Text style={styles.loadingLabel}>Loading recent runs...</Text>
              </View>
            ) : gameHistory.length === 0 ? (
              <View style={styles.emptyHistoryCard}>
                <Text style={styles.emptyHistoryTitle}>No history yet</Text>
                <Text style={styles.emptyHistoryBody}>
                  Finish a round and it will show up here.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.historyList}
                contentContainerStyle={styles.historyListContent}
                showsVerticalScrollIndicator={false}
              >
                {gameHistory.map((entry, index) => (
                  <View key={`${entry.playedAt}-${entry.variantId}-${index}`} style={styles.historyItem}>
                    <View style={styles.historyItemTop}>
                      <Text style={styles.historyItemTitle}>{entry.variantLabel}</Text>
                      <Text style={styles.historyItemDate}>{formatPlayedAt(entry.playedAt)}</Text>
                    </View>
                    <Text style={styles.historyItemPrimary}>
                      {Math.min(entry.score, entry.totalQuestions)}/{entry.totalQuestions}
                    </Text>
                    <Text style={styles.historyItemMeta}>
                      {Math.min(entry.score, entry.totalQuestions) === entry.totalQuestions
                        ? 'Perfect run'
                        : `${Math.min(entry.correctCount, entry.totalQuestions)} correct before the first miss`}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <SecondaryButton
              label="Close"
              onPress={() => setIsHistoryModalOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SegmentButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: 'globe' | 'map';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
      onPress={onPress}
    >
      <Feather
        color={active ? uiTheme.surface : uiTheme.backgroundStrong}
        name={icon}
        size={18}
      />
      <Text style={[styles.segmentButtonLabel, active && styles.segmentButtonLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaTile}>
      <Text style={styles.metaTileValue}>{value}</Text>
      <Text style={styles.metaTileLabel}>{label}</Text>
    </View>
  );
}

function MetricChip({ icon, label }: { icon: 'target' | 'zap'; label: string }) {
  return (
    <View style={styles.metricChip}>
      <Feather color={uiTheme.surface} name={icon} size={15} />
      <Text style={styles.metricChipLabel}>{label}</Text>
    </View>
  );
}

function StatCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'accent' | 'danger' | 'surface';
  value: string;
}) {
  return (
    <View
      style={[
        styles.statCard,
        tone === 'accent' && styles.statCardAccent,
        tone === 'danger' && styles.statCardDanger,
      ]}
    >
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryMetricValue}>{value}</Text>
      <Text style={styles.summaryMetricLabel}>{label}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.primaryButton} onPress={onPress}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.secondaryButton} onPress={onPress}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: uiTheme.backgroundDeep,
  },
  homeScreen: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 16,
  },
  homeBackdropCircleOne: {
    position: 'absolute',
    top: 26,
    right: -26,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 155, 87, 0.12)',
  },
  homeBackdropCircleTwo: {
    position: 'absolute',
    top: 228,
    left: -52,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(29, 120, 184, 0.1)',
  },
  homeHero: {
    flex: 1,
    paddingHorizontal: 4,
    paddingTop: 6,
    overflow: 'hidden',
  },
  homeHeroIntro: {},
  homeHeroCopy: {
    paddingRight: 0,
  },
  homeHeroEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    fontSize: 11,
    fontWeight: '800',
  },
  homeHeroTitle: {
    color: uiTheme.surface,
    fontSize: 34,
    lineHeight: 36,
    marginTop: 8,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  homeHeroBody: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    maxWidth: 250,
  },
  metricTile: {
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  homeHeroBoards: {
    flexShrink: 1,
    marginTop: 18,
    gap: 10,
    overflow: 'hidden',
  },
  heroLoadingCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroLoadingLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '700',
  },
  heroBoardSection: {
    gap: 6,
    flexShrink: 1,
  },
  heroSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroSectionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroSectionTitle: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroBoardRows: {
    gap: 8,
    flexShrink: 1,
  },
  heroBoardRow: {
    flexDirection: 'row',
    gap: 8,
  },
  boardMetric: {
    flex: 1,
    height: '100%',
    justifyContent: 'space-between',
  },
  boardMetricCompact: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  boardMetricAccent: {
    width: 22,
    height: 4,
    borderRadius: 999,
  },
  boardMetricTitle: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  boardMetricTitleCompact: {
    fontSize: 10,
    lineHeight: 12,
    marginTop: 5,
  },
  boardMetricScoreWrap: {
    marginTop: 8,
  },
  boardMetricScoreWrapCompact: {
    marginTop: 5,
  },
  boardMetricValue: {
    color: uiTheme.surface,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '900',
  },
  boardMetricValueCompact: {
    fontSize: 16,
    lineHeight: 17,
  },
  boardMetricContext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  boardMetricContextCompact: {
    fontSize: 9,
    lineHeight: 10,
    marginTop: 2,
  },
  homeButtons: {
    padding: 10,
    borderRadius: 26,
    backgroundColor: 'rgba(8, 23, 35, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 23, 35, 0.46)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 48,
  },
  sheetCard: {
    borderRadius: 28,
    backgroundColor: uiTheme.surface,
    padding: 20,
    maxHeight: '92%',
    shadowColor: uiTheme.shadow,
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
  },
  sheetEyebrow: {
    color: uiTheme.backgroundStrong,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    fontSize: 11,
    fontWeight: '800',
  },
  sheetTitle: {
    color: uiTheme.text,
    fontSize: 24,
    lineHeight: 28,
    marginTop: 8,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  sheetBody: {
    color: uiTheme.textMuted,
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  sheetScroll: {
    marginTop: 4,
    maxHeight: 520,
  },
  sheetScrollContent: {
    paddingBottom: 4,
  },
  sheetButtonRow: {
    marginTop: 16,
    gap: 10,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: uiTheme.surfaceTint,
    borderWidth: 1,
    borderColor: uiTheme.border,
  },
  segmentButtonActive: {
    backgroundColor: uiTheme.backgroundStrong,
    borderColor: uiTheme.backgroundStrong,
  },
  segmentButtonLabel: {
    color: uiTheme.backgroundStrong,
    fontSize: 14,
    fontWeight: '700',
  },
  segmentButtonLabelActive: {
    color: uiTheme.surface,
  },
  toggleCard: {
    marginTop: 16,
    borderRadius: 20,
    padding: 16,
    backgroundColor: uiTheme.surfaceTint,
    borderWidth: 1,
    borderColor: uiTheme.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleTitle: {
    color: uiTheme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  toggleBody: {
    color: uiTheme.textMuted,
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  toggleSwitch: {
    width: 58,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#d8dfdf',
    padding: 4,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: uiTheme.success,
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  toggleKnobActive: {
    transform: [{ translateX: 24 }],
  },
  regionPicker: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  regionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: uiTheme.border,
    backgroundColor: uiTheme.surfaceTint,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  regionChipText: {
    color: uiTheme.text,
    fontSize: 13,
    fontWeight: '700',
  },
  regionChipTextActive: {
    color: uiTheme.surface,
  },
  variantPreview: {
    marginTop: 18,
    borderRadius: 24,
    backgroundColor: '#f7f1e8',
    padding: 18,
    borderWidth: 1,
    borderColor: uiTheme.border,
    gap: 14,
  },
  variantBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  variantAccentDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  variantPreviewTitle: {
    color: uiTheme.text,
    fontSize: 17,
    fontWeight: '800',
  },
  variantPreviewBody: {
    color: uiTheme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  variantMetaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaTile: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: uiTheme.surface,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: uiTheme.border,
  },
  metaTileValue: {
    color: uiTheme.text,
    fontSize: 16,
    fontWeight: '800',
  },
  metaTileLabel: {
    color: uiTheme.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: 18,
    backgroundColor: uiTheme.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    shadowColor: uiTheme.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonText: {
    color: uiTheme.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 18,
    backgroundColor: 'rgba(255, 250, 242, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: uiTheme.border,
  },
  secondaryButtonText: {
    color: uiTheme.text,
    fontSize: 15,
    fontWeight: '800',
  },
  loadingCard: {
    borderRadius: 22,
    backgroundColor: uiTheme.surfaceTint,
    borderWidth: 1,
    borderColor: uiTheme.border,
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  loadingLabel: {
    color: uiTheme.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyHistoryCard: {
    marginTop: 16,
    borderRadius: 22,
    backgroundColor: uiTheme.surfaceTint,
    borderWidth: 1,
    borderColor: uiTheme.border,
    padding: 18,
  },
  emptyHistoryTitle: {
    color: uiTheme.text,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyHistoryBody: {
    color: uiTheme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  historyList: {
    marginTop: 16,
    maxHeight: 420,
  },
  historyListContent: {
    gap: 10,
    paddingBottom: 12,
  },
  historyItem: {
    borderRadius: 20,
    backgroundColor: uiTheme.surfaceTint,
    borderWidth: 1,
    borderColor: uiTheme.border,
    padding: 14,
  },
  historyItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  historyItemTitle: {
    color: uiTheme.text,
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  historyItemDate: {
    color: uiTheme.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  historyItemPrimary: {
    color: uiTheme.text,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 10,
  },
  historyItemMeta: {
    color: uiTheme.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  gameScreen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 18,
  },
  gameTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  iconPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconPillText: {
    color: uiTheme.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  topBarMetrics: {
    flexDirection: 'row',
    gap: 8,
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  metricChipLabel: {
    color: uiTheme.surface,
    fontSize: 13,
    fontWeight: '800',
  },
  promptCard: {
    marginTop: 14,
    borderRadius: 26,
    padding: 18,
    backgroundColor: 'rgba(255,250,242,0.96)',
    shadowColor: uiTheme.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  promptEyebrow: {
    color: uiTheme.backgroundStrong,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    fontWeight: '800',
  },
  promptTitle: {
    color: uiTheme.text,
    fontSize: 26,
    lineHeight: 30,
    marginTop: 8,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  promptSubtitle: {
    color: uiTheme.textMuted,
    marginTop: 6,
    fontSize: 14,
    lineHeight: 19,
  },
  mapStage: {
    flex: 1,
    marginTop: 14,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: quizMapTheme.background,
    minHeight: 360,
  },
  gameBottomRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  statCardAccent: {
    backgroundColor: 'rgba(255, 155, 87, 0.18)',
  },
  statCardDanger: {
    backgroundColor: 'rgba(212, 99, 74, 0.16)',
  },
  statCardValue: {
    color: uiTheme.surface,
    fontSize: 20,
    fontWeight: '800',
  },
  statCardLabel: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  feedbackToast: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 110,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: uiTheme.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
  },
  feedbackToastSuccess: {
    backgroundColor: 'rgba(25, 125, 112, 0.94)',
  },
  feedbackToastDanger: {
    backgroundColor: 'rgba(212, 99, 74, 0.94)',
  },
  feedbackTitle: {
    color: uiTheme.surface,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '800',
  },
  feedbackText: {
    color: uiTheme.surface,
    fontSize: 18,
    marginTop: 6,
    fontWeight: '700',
  },
  summaryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 23, 35, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  summaryCard: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: uiTheme.surface,
    padding: 22,
    shadowColor: uiTheme.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
  },
  summaryBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3eadf',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summaryBadgeText: {
    color: uiTheme.text,
    fontSize: 12,
    fontWeight: '800',
  },
  summaryTitle: {
    color: uiTheme.text,
    fontSize: 28,
    lineHeight: 32,
    marginTop: 16,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  summarySubtitle: {
    color: uiTheme.textMuted,
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  summaryMetricsGrid: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryMetric: {
    width: '48%',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: uiTheme.surfaceTint,
    borderWidth: 1,
    borderColor: uiTheme.border,
  },
  summaryMetricValue: {
    color: uiTheme.text,
    fontSize: 20,
    fontWeight: '800',
  },
  summaryMetricLabel: {
    color: uiTheme.textMuted,
    marginTop: 5,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryDetail: {
    color: uiTheme.textMuted,
    marginTop: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  summaryButtonRow: {
    gap: 10,
    marginTop: 18,
  },
  pageGlowOne: {
    position: 'absolute',
    top: 120,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 155, 87, 0.16)',
  },
  pageGlowTwo: {
    position: 'absolute',
    bottom: 120,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 999,
    backgroundColor: 'rgba(226, 163, 60, 0.12)',
  },
});
