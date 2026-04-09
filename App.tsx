import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type DimensionValue,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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

const previewCompletedVariantIds = ['globe-world', 'region-asia', `region-${US_STATES_REGION_KEY}`] as const;

const dashboardArtworkByRegion = {
  africa: require('./src/icons/africa.png'),
  asia: require('./src/icons/asia.png'),
  europe: require('./src/icons/europe.png'),
  'north-america': require('./src/icons/north-america.png'),
  oceania: require('./src/icons/oceania.png'),
  'south-america': require('./src/icons/south-america.png'),
  'us-states': require('./src/icons/usa.png'),
  world: require('./src/icons/world.png'),
  'world-us-states': require('./src/icons/world+usa.png'),
} as const;

type BoardArtworkLayer = {
  centerY?: DimensionValue;
  centeredSlot?: boolean;
  height?: number;
  left?: number;
  offsetY?: number;
  right?: number;
  resizeMode?: 'contain' | 'cover';
  shadowOpacity: number;
  size?: number;
  source: number;
  visualOpacity: number;
  width?: DimensionValue;
};

type HistoryArtwork = {
  height: number;
  resizeMode?: 'contain' | 'cover';
  right: number;
  source: number;
  width: DimensionValue;
};

function mixHexColor(baseColor: string, targetColor: string, targetWeight: number) {
  const normalize = (value: string) => value.replace('#', '').trim();
  const base = normalize(baseColor);
  const target = normalize(targetColor);

  if (base.length !== 6 || target.length !== 6) {
    return null;
  }

  const channel = (value: string, index: number) => Number.parseInt(value.slice(index, index + 2), 16);
  const toHex = (value: number) => Math.round(value).toString(16).padStart(2, '0');

  const red = channel(base, 0) * (1 - targetWeight) + channel(target, 0) * targetWeight;
  const green = channel(base, 2) * (1 - targetWeight) + channel(target, 2) * targetWeight;
  const blue = channel(base, 4) * (1 - targetWeight) + channel(target, 4) * targetWeight;

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function getHistoryArtwork(variant: GameVariant): HistoryArtwork | null {
  if (variant.mode === 'globe' && variant.showUsStates) {
    return {
      height: 68,
      resizeMode: 'cover',
      right: 8,
      source: dashboardArtworkByRegion['world-us-states'],
      width: '46%',
    };
  }

  if (variant.mode === 'globe') {
    return {
      height: 68,
      resizeMode: 'cover',
      right: 8,
      source: dashboardArtworkByRegion.world,
      width: '46%',
    };
  }

  const artworkKey = variant.region;
  const source = dashboardArtworkByRegion[artworkKey as keyof typeof dashboardArtworkByRegion];
  if (!source) {
    return null;
  }

  switch (artworkKey) {
    case 'asia':
      return { height: 86, right: 4, source, width: 96 };
    case 'europe':
      return { height: 82, right: 10, source, width: 82 };
    case 'africa':
      return { height: 86, right: 8, source, width: 86 };
    case 'north-america':
      return { height: 82, right: 6, source, width: 92 };
    case 'south-america':
      return { height: 76, right: 18, source, width: 60 };
    case 'oceania':
      return { height: 78, right: 12, source, width: 84 };
    case 'us-states':
      return { height: 74, right: 10, source, width: 90 };
    default:
      return null;
  }
}

function getBoardArtworks(variant: GameVariant, compact: boolean): readonly BoardArtworkLayer[] | null {
  if (variant.mode === 'globe' && !variant.showUsStates) {
    return [
      {
        centeredSlot: true,
        height: compact ? 48 : 60,
        right: compact ? 2 : 4,
        resizeMode: 'cover',
        shadowOpacity: compact ? 0.1 : 0.12,
        source: dashboardArtworkByRegion.world,
        visualOpacity: compact ? 0.18 : 0.21,
        width: '67%',
      },
    ];
  }

  if (variant.mode === 'globe' && variant.showUsStates) {
    return [
      {
        centeredSlot: true,
        height: compact ? 48 : 60,
        right: compact ? 2 : 4,
        resizeMode: 'cover',
        shadowOpacity: compact ? 0.1 : 0.12,
        source: dashboardArtworkByRegion['world-us-states'],
        visualOpacity: compact ? 0.18 : 0.21,
        width: '67%',
      },
    ];
  }

  const artworkKey = variant.region;

  const source = dashboardArtworkByRegion[artworkKey as keyof typeof dashboardArtworkByRegion];
  if (!source) {
    return null;
  }

  switch (artworkKey) {
    case 'world':
      return null;
    case 'asia':
      return [
        {
          centerY: compact ? 34 : 42,
          right: compact ? -2 : 2,
          shadowOpacity: compact ? 0.09 : 0.11,
          size: compact ? 62 : 82,
          source,
          visualOpacity: compact ? 0.16 : 0.19,
        },
      ];
    case 'europe':
      return [
        {
          centerY: compact ? 33 : 40,
          right: compact ? 1 : 4,
          shadowOpacity: compact ? 0.08 : 0.1,
          size: compact ? 58 : 72,
          source,
          visualOpacity: compact ? 0.15 : 0.18,
        },
      ];
    case 'africa':
      return [
        {
          centerY: compact ? 34 : 42,
          right: compact ? 0 : 4,
          shadowOpacity: compact ? 0.08 : 0.1,
          size: compact ? 58 : 74,
          source,
          visualOpacity: compact ? 0.15 : 0.18,
        },
      ];
    case 'north-america':
      return [
        {
          centerY: compact ? 33 : 41,
          right: compact ? -1 : 3,
          shadowOpacity: compact ? 0.08 : 0.1,
          size: compact ? 60 : 76,
          source,
          visualOpacity: compact ? 0.14 : 0.17,
        },
      ];
    case 'south-america':
      return [
        {
          centerY: compact ? 35 : 43,
          right: compact ? 3 : 7,
          shadowOpacity: compact ? 0.08 : 0.1,
          size: compact ? 50 : 64,
          source,
          visualOpacity: compact ? 0.15 : 0.18,
        },
      ];
    case 'oceania':
      return [
        {
          centerY: compact ? 34 : 42,
          right: compact ? 1 : 5,
          shadowOpacity: compact ? 0.08 : 0.1,
          size: compact ? 56 : 70,
          source,
          visualOpacity: compact ? 0.15 : 0.18,
        },
      ];
    case 'us-states':
      return [
        {
          centerY: compact ? 34 : 42,
          right: compact ? -1 : 3,
          shadowOpacity: compact ? 0.08 : 0.1,
          size: compact ? 58 : 74,
          source,
          visualOpacity: compact ? 0.14 : 0.17,
        },
      ];
    default:
      return null;
  }
}

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
    const date = new Date(value);
    const dayLabel = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
    const timeLabel = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);

    return `${dayLabel}, ${timeLabel}`;
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
  isCompleted,
  onPress,
  variant,
}: {
  accent: string;
  bestScore: number;
  compact: boolean;
  isCompleted: boolean;
  onPress: () => void;
  variant: GameVariant;
}) {
  const artworks = getBoardArtworks(variant, compact);
  const artworkTint = isCompleted ? '#d6ffed' : mixHexColor(accent, '#ffffff', 0.5) || '#dbe6ef';
  const boardTitle =
    !compact && variant.id === 'globe-world-us-states'
      ? 'World &\nU.S. states'
      : !compact && variant.id === 'region-us-states'
        ? 'U.S.\nstates'
        : variant.shortLabel;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.metricTile,
        styles.boardMetric,
        compact && styles.boardMetricCompact,
        isCompleted && styles.boardMetricCompleted,
        pressed && styles.boardMetricPressed,
        {
          borderColor: isCompleted ? 'rgba(108, 201, 164, 0.72)' : `${accent}55`,
        },
      ]}
    >
      <View style={[styles.boardMetricAccent, { backgroundColor: accent }]} />
      {artworks ? (
        <View pointerEvents="none" style={styles.boardMetricArtworkLayer}>
          {artworks.map((artwork, index) => {
            const artworkShadowOpacity = isCompleted
              ? artwork.shadowOpacity
              : Math.min(artwork.shadowOpacity + 0.04, 0.18);
            const artworkVisualOpacity = isCompleted
              ? artwork.visualOpacity
              : Math.min(artwork.visualOpacity + 0.1, 0.34);
            const artworkWidth = artwork.width ?? artwork.size;
            const artworkHeight = artwork.height ?? artwork.size;
            const imageWidth = typeof artworkWidth === 'string' ? '100%' : artworkWidth;

            if (artwork.centeredSlot) {
              return (
                <View
                  key={`artwork-${variant.id}-${index}`}
                  style={[
                    styles.boardMetricArtworkSlot,
                    ...(artwork.left != null ? [{ left: artwork.left, alignItems: 'flex-start' as const }] : []),
                    ...(artwork.right != null ? [{ right: artwork.right, alignItems: 'flex-end' as const }] : []),
                    { width: artworkWidth },
                  ]}
                >
                  <View
                    style={[
                      styles.boardMetricArtworkStack,
                      {
                        height: artworkHeight,
                        width: imageWidth,
                      },
                    ]}
                  >
                    <Image
                      blurRadius={compact ? 12 : 14}
                      resizeMode={artwork.resizeMode ?? 'contain'}
                      source={artwork.source}
                      style={[
                        styles.boardMetricArtworkShadow,
                        {
                          height: artworkHeight,
                          opacity: artworkShadowOpacity,
                          tintColor: artworkTint,
                          width: imageWidth,
                        },
                      ]}
                    />
                    <Image
                      resizeMode={artwork.resizeMode ?? 'contain'}
                      source={artwork.source}
                      style={[
                        styles.boardMetricArtwork,
                        {
                          height: artworkHeight,
                          opacity: artworkVisualOpacity,
                          tintColor: artworkTint,
                          width: imageWidth,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            }

            return (
              <View key={`artwork-${variant.id}-${index}`}>
                <Image
                  blurRadius={compact ? 12 : 14}
                  resizeMode={artwork.resizeMode ?? 'contain'}
                  source={artwork.source}
                  style={[
                    styles.boardMetricArtworkShadow,
                    {
                      height: artworkHeight,
                      ...(artwork.left != null ? { left: artwork.left } : {}),
                      opacity: artworkShadowOpacity,
                      ...(artwork.right != null ? { right: artwork.right } : {}),
                      top: artwork.centerY,
                      tintColor: artworkTint,
                      transform: [
                        { translateY: -(artworkHeight ?? 0) / 2 + (artwork.offsetY ?? 0) },
                      ],
                      width: artworkWidth,
                    },
                  ]}
                />
                <Image
                  resizeMode={artwork.resizeMode ?? 'contain'}
                  source={artwork.source}
                  style={[
                    styles.boardMetricArtwork,
                    {
                      height: artworkHeight,
                      ...(artwork.left != null ? { left: artwork.left } : {}),
                      opacity: artworkVisualOpacity,
                      ...(artwork.right != null ? { right: artwork.right } : {}),
                      top: artwork.centerY,
                      tintColor: artworkTint,
                      transform: [
                        { translateY: -(artworkHeight ?? 0) / 2 + (artwork.offsetY ?? 0) },
                      ],
                      width: artworkWidth,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      ) : null}
      {isCompleted ? (
        <View style={[styles.boardMetricBadge, compact && styles.boardMetricBadgeCompact]}>
          <Feather color={uiTheme.surface} name="check" size={10} />
        </View>
      ) : null}
      <View style={[styles.boardMetricTitleSlot, compact && styles.boardMetricTitleSlotCompact]}>
        <Text
          numberOfLines={2}
          style={[
            styles.boardMetricTitle,
            compact && styles.boardMetricTitleCompact,
            isCompleted && styles.boardMetricTitleWithBadge,
            isCompleted && compact && styles.boardMetricTitleWithBadgeCompact,
          ]}
        >
          {boardTitle}
        </Text>
      </View>
      <View style={[styles.boardMetricScoreWrap, compact && styles.boardMetricScoreWrapCompact]}>
        <Text
          style={[
            styles.boardMetricValue,
            compact && styles.boardMetricValueCompact,
            isCompleted && styles.boardMetricValueCompleted,
          ]}
        >
          {bestScore}
        </Text>
        <Text
          style={[
            styles.boardMetricContext,
            compact && styles.boardMetricContextCompact,
            isCompleted && styles.boardMetricContextCompleted,
          ]}
        >
          out of {variant.placeCount}
        </Text>
      </View>
    </Pressable>
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

function getRegionPickerLabel(variant: GameVariant) {
  if (variant.region === 'north-america') {
    return 'N. America';
  }

  if (variant.region === 'south-america') {
    return 'S. America';
  }

  if (variant.region === US_STATES_REGION_KEY) {
    return US_STATES_REGION_LABEL;
  }

  return variant.label;
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
  const [startModeOptionsHeight, setStartModeOptionsHeight] = useState(94);
  const [homeBoardsAreaHeight, setHomeBoardsAreaHeight] = useState(0);

  const highscoresRef = useRef<HighscoreMap>({});
  const gameHistoryRef = useRef<GameHistoryEntry[]>([]);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const selectedVariantId = resolveVariantId(mode, selectedRegion, includeUsStatesOnGlobe);
  const selectedVariant = useMemo(() => getVariantById(selectedVariantId), [selectedVariantId]);
  const globeVariants = useMemo(
    () => gameVariants.filter((variant) => variant.mode === 'globe'),
    []
  );
  const fullGlobePlaceCount = globeVariants[0]?.placeCount ?? 0;
  const regionVariants = useMemo(
    () => gameVariants.filter((variant) => regionVariantIds.includes(variant.id)),
    []
  );
  const regionPickerVariants = useMemo(
    () =>
      [...regionVariants].sort((left, right) => {
        const leftLabel = getRegionPickerLabel(left);
        const rightLabel = getRegionPickerLabel(right);
        if (leftLabel.length !== rightLabel.length) {
          return leftLabel.length - rightLabel.length;
        }

        return leftLabel.localeCompare(rightLabel);
      }),
    [regionVariants]
  );
  const regionPickerRows = useMemo(() => {
    if (regionPickerVariants.length <= 4) {
      return [regionPickerVariants];
    }

    return [regionPickerVariants.slice(0, 4), regionPickerVariants.slice(4)];
  }, [regionPickerVariants]);
  const regionVariantsById = useMemo(
    () => Object.fromEntries(regionVariants.map((variant) => [variant.id, variant])),
    [regionVariants]
  );
  const displayHighscores = useMemo(() => {
    if (!__DEV__) {
      return highscores;
    }

    const nextHighscores: HighscoreMap = { ...highscores };

    previewCompletedVariantIds.forEach((variantId) => {
      const variant = getVariantById(variantId);
      const existingEntry = nextHighscores[variantId];

      nextHighscores[variantId] = {
        bestAccuracy: 100,
        bestScore: variant.placeCount,
        fastestMs: existingEntry?.fastestMs ?? null,
        lastPlayedAt: existingEntry?.lastPlayedAt ?? null,
        plays: Math.max(existingEntry?.plays ?? 0, 1),
      };
    });

    return nextHighscores;
  }, [highscores]);
  const selectedVariantBestScore = Math.min(
    displayHighscores[selectedVariant.id]?.bestScore ?? 0,
    selectedVariant.placeCount
  );
  const isSelectedVariantCompleted =
    selectedVariant.placeCount > 0 && selectedVariantBestScore >= selectedVariant.placeCount;
  const isCompactBoardLayout = homeBoardsAreaHeight > 0 ? homeBoardsAreaHeight < 320 : screenHeight < 760;
  const decoratedHistory = useMemo(() => {
    const chronologicalEntries = [...gameHistory]
      .map((entry, index) => ({ entry, index }))
      .reverse();
    const bestByVariant = new Map<string, number>();
    const highscoreIndexes = new Set<number>();

    chronologicalEntries.forEach(({ entry, index }) => {
      const score = Math.min(Math.max(0, entry.score), Math.max(0, entry.totalQuestions));
      const previousBest = bestByVariant.get(entry.variantId) ?? 0;

      if (score > 0 && score >= previousBest) {
        highscoreIndexes.add(index);
      }

      bestByVariant.set(entry.variantId, Math.max(previousBest, score));
    });

    return gameHistory.map((entry, index) => {
      const variant = getVariantById(entry.variantId);
      const score = Math.min(Math.max(0, entry.score), Math.max(0, entry.totalQuestions));
      const isCompletedRound = entry.totalQuestions > 0 && score >= entry.totalQuestions;

      return {
        accent: variant.accent,
        artwork: getHistoryArtwork(variant),
        entry,
        isCompletedRound,
        isHighscoreRound: highscoreIndexes.has(index),
        score,
        variant,
      };
    });
  }, [gameHistory]);

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

  function handleBoardMetricPress(variant: GameVariant) {
    if (variant.mode === 'globe') {
      setMode('globe');
      setIncludeUsStatesOnGlobe(variant.showUsStates);
    } else {
      setMode('region');
      setSelectedRegion(variant.region as MenuRegionKey);
    }

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
      {session ? (
        <>
          <View style={styles.pageGlowOne} />
          <View style={styles.pageGlowTwo} />
        </>
      ) : null}

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
                  <PrimaryButton label="Play again" onPress={handleSummaryReplay} />
                  <SecondaryButton label="Dashboard" onPress={handleSummaryDashboard} />
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.homeScreen}>
          <View style={styles.homeBackdropCircleOne} />
          <View style={styles.homeBackdropCircleTwo} />

          <View style={styles.homeHero}>
            <View style={styles.homeHeroIntro}>
              <View style={styles.homeHeroCopy}>
                <Text style={styles.homeHeroEyebrow}>Countries Quiz</Text>
                <Text style={styles.homeHeroTitle}>Learn the World Map</Text>
                <Text style={styles.homeHeroBody}>
                  Practice every country and region until the full map becomes second nature.
                </Text>
              </View>
            </View>

            <View
              style={styles.homeHeroBoards}
              onLayout={(event) => setHomeBoardsAreaHeight(event.nativeEvent.layout.height)}
            >
              {isLoadingHighscores ? (
                <View style={styles.heroLoadingCard}>
                  <ActivityIndicator color={uiTheme.surface} size="small" />
                  <Text style={styles.heroLoadingLabel}>Loading scores...</Text>
                </View>
              ) : (
                <>
                  <View style={styles.heroBoardSection}>
                    <HeroSectionHeader icon="globe" title="Global" />
                  </View>
                  <View style={[styles.heroBoardRow, styles.heroBoardRowGlobal]}>
                    {globeVariants.map((variant) => {
                      const entry = displayHighscores[variant.id];
                      const bestScore = Math.min(entry?.bestScore ?? 0, variant.placeCount);
                      const isCompleted = bestScore >= variant.placeCount && variant.placeCount > 0;

                      return (
                        <BoardMetric
                          key={variant.id}
                          accent={variant.accent}
                          bestScore={bestScore}
                          compact={isCompactBoardLayout}
                          isCompleted={isCompleted}
                          onPress={() => handleBoardMetricPress(variant)}
                          variant={variant}
                        />
                      );
                    })}
                  </View>

                  <View style={styles.heroBoardSection}>
                    <HeroSectionHeader icon="map" title="Regions" />
                  </View>
                  <View style={[styles.heroBoardRows, styles.heroBoardRowsRegions]}>
                    {regionBoardRows.map((row, rowIndex) => (
                      <View key={`region-row-${rowIndex}`} style={styles.heroBoardRow}>
                        {row.map((variant) => {
                          const entry = displayHighscores[variant.id];
                          const bestScore = Math.min(entry?.bestScore ?? 0, variant.placeCount);
                          const isCompleted = bestScore >= variant.placeCount && variant.placeCount > 0;

                          return (
                            <BoardMetric
                              key={variant.id}
                              accent={variant.accent}
                              bestScore={bestScore}
                              compact={isCompactBoardLayout}
                              isCompleted={isCompleted}
                              onPress={() => handleBoardMetricPress(variant)}
                              variant={variant}
                            />
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.homeButtons}>
            <SecondaryButton
              label="Game history"
              onPress={() => setIsHistoryModalOpen(true)}
            />
            <PrimaryButton label="Start game" onPress={handleStartPress} />
          </View>
        </View>
      )}

      <BottomSheetModal visible={isStartModalOpen} onClose={() => setIsStartModalOpen(false)}>
            <Text style={styles.sheetEyebrow}>Start game</Text>
            <Text style={styles.sheetTitle}>Choose game mode</Text>
            <Text style={styles.sheetBody}>
              Either play the full globe of {fullGlobePlaceCount} places or a smaller region.
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
                <View
                  style={styles.toggleCard}
                  onLayout={(event) => setStartModeOptionsHeight(event.nativeEvent.layout.height)}
                >
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
                <View style={[styles.regionPickerFrame, { height: startModeOptionsHeight }]}>
                  <View style={styles.regionPicker}>
                    {regionPickerRows.map((row, rowIndex) => (
                      <View key={`region-pill-row-${rowIndex}`} style={styles.regionPickerRow}>
                        {row.map((variant) => {
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
                                {getRegionPickerLabel(variant)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View
                style={[
                  styles.variantPreview,
                  isSelectedVariantCompleted && styles.variantPreviewCompleted,
                ]}
              >
                {isSelectedVariantCompleted ? (
                  <View pointerEvents="none" style={styles.variantPreviewCompletedOverlay} />
                ) : null}
                {isSelectedVariantCompleted ? (
                  <View style={styles.variantPreviewBadge}>
                    <Feather color={uiTheme.surface} name="check" size={12} />
                    <Text style={styles.variantPreviewBadgeText}>Completed</Text>
                  </View>
                ) : null}
                <View
                  style={[styles.variantPreviewAccent, { backgroundColor: selectedVariant.accent }]}
                />
                <Text
                  style={[
                    styles.variantPreviewTitle,
                    isSelectedVariantCompleted && styles.variantPreviewTitleWithBadge,
                  ]}
                >
                  {selectedVariant.label}
                </Text>
                <View style={styles.variantMetaRow}>
                  <MetaTile
                    accent={selectedVariant.accent}
                    label="Highscore"
                    value={isLoadingHighscores ? '...' : String(selectedVariantBestScore)}
                  />
                  <MetaTile accent={selectedVariant.accent} label="Places" value={String(selectedVariant.placeCount)} />
                </View>
              </View>
            </ScrollView>

            <View style={styles.sheetButtonRow}>
              <PrimaryButton
                label="Start game"
                onPress={handleConfirmStart}
              />
              <SecondaryButton
                label="Close"
                onPress={() => setIsStartModalOpen(false)}
              />
            </View>
      </BottomSheetModal>

      <BottomSheetModal visible={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)}>
            <Text style={styles.sheetEyebrow}>Game history</Text>
            <Text style={styles.sheetTitle}>Played games</Text>
            <Text style={styles.sheetBody}>
              List of all games played
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
                {decoratedHistory.map(
                  ({ accent, artwork, entry, isCompletedRound, isHighscoreRound, score, variant }, index) => (
                  <View
                    key={`${entry.playedAt}-${entry.variantId}-${index}`}
                    style={[
                      styles.historyItem,
                      isCompletedRound && styles.historyItemCompleted,
                      {
                        borderColor: isCompletedRound ? 'rgba(108, 201, 164, 0.72)' : `${accent}55`,
                      },
                    ]}
                  >
                    {isCompletedRound ? (
                      <View pointerEvents="none" style={styles.historyItemCompletedOverlay} />
                    ) : null}
                    {artwork ? (
                      <View pointerEvents="none" style={styles.historyItemArtworkLayer}>
                        <View
                          style={[
                            styles.historyItemArtworkSlot,
                            { right: artwork.right, width: artwork.width },
                          ]}
                        >
                          <View
                            style={[
                              styles.historyItemArtworkStack,
                              {
                                height: artwork.height,
                                width: typeof artwork.width === 'string' ? '100%' : artwork.width,
                              },
                            ]}
                          >
                            <Image
                              blurRadius={14}
                              resizeMode={artwork.resizeMode ?? 'contain'}
                              source={artwork.source}
                              style={[
                                styles.historyItemArtworkShadow,
                                {
                                  height: artwork.height,
                                  opacity: 0.14,
                                  tintColor: isCompletedRound
                                    ? '#d6ffed'
                                    : mixHexColor(accent, '#ffffff', 0.5) || '#dbe6ef',
                                  width: typeof artwork.width === 'string' ? '100%' : artwork.width,
                                },
                              ]}
                            />
                            <Image
                              resizeMode={artwork.resizeMode ?? 'contain'}
                              source={artwork.source}
                              style={[
                                styles.historyItemArtwork,
                                {
                                  height: artwork.height,
                                  opacity: 0.24,
                                  tintColor: isCompletedRound
                                    ? '#d6ffed'
                                    : mixHexColor(accent, '#ffffff', 0.5) || '#dbe6ef',
                                  width: typeof artwork.width === 'string' ? '100%' : artwork.width,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      </View>
                    ) : null}
                    <View style={[styles.historyItemAccent, { backgroundColor: accent }]} />
                    <View style={styles.historyItemPillsFloating}>
                      <View style={styles.historyItemPills}>
                        {isHighscoreRound ? (
                          <View style={styles.historyItemBadgeHighscore}>
                            <Text style={styles.historyItemBadgeHighscoreText}>Highscore</Text>
                          </View>
                        ) : null}
                        {isCompletedRound ? (
                          <View style={styles.historyItemBadgeCompleted}>
                            <Feather color={uiTheme.surface} name="check" size={11} />
                            <Text style={styles.historyItemBadgeCompletedText}>Completed</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.historyItemMainRow}>
                      <View style={styles.historyItemInfo}>
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.historyItemTitle,
                            isCompletedRound && styles.historyItemTitleCompleted,
                          ]}
                        >
                          {variant.label}
                        </Text>
                        <Text style={styles.historyItemDate}>{formatPlayedAt(entry.playedAt)}</Text>
                        <View style={styles.historyItemScoreLine}>
                          <Text
                            style={[
                              styles.historyItemScoreValue,
                              isCompletedRound && styles.historyItemScoreValueCompleted,
                            ]}
                          >
                            {score}
                          </Text>
                          <Text
                            style={[
                              styles.historyItemScoreContext,
                              isCompletedRound && styles.historyItemScoreContextCompleted,
                            ]}
                          >
                            out of {entry.totalQuestions}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <SecondaryButton
              label="Close"
              onPress={() => setIsHistoryModalOpen(false)}
            />
      </BottomSheetModal>
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

function MetaTile({
  accent,
  label,
  value,
}: {
  accent: string;
  label: string;
  value: string;
}) {
  return (
    <View style={[styles.metaTile, { borderColor: `${accent}55` }]}>
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

function BottomSheetModal({
  children,
  onClose,
  visible,
}: {
  children: ReactNode;
  onClose: () => void;
  visible: boolean;
}) {
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isMounted, setIsMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(viewportHeight)).current;

  useEffect(() => {
    const hiddenOffset = Math.max(320, viewportHeight);

    if (visible && !isMounted) {
      setIsMounted(true);
      return;
    }

    if (!isMounted) {
      return;
    }

    translateY.stopAnimation();

    if (visible) {
      translateY.setValue(hiddenOffset);
      const frameId = requestAnimationFrame(() => {
        Animated.timing(translateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });

      return () => cancelAnimationFrame(frameId);
    }

    Animated.timing(translateY, {
      toValue: hiddenOffset,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });
  }, [isMounted, translateY, viewportHeight, visible]);

  if (!isMounted) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      transparent
      visible
      onRequestClose={onClose}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheetCard,
            {
              paddingBottom: 20 + insets.bottom,
              transform: [{ translateY }],
            },
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
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
    minHeight: 0,
    paddingHorizontal: 4,
    paddingTop: 6,
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
    flex: 1,
    minHeight: 0,
    flexShrink: 1,
    marginTop: 18,
    gap: 10,
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
    minHeight: 0,
    gap: 8,
    flexShrink: 1,
  },
  heroBoardRowsRegions: {
    flex: 3,
  },
  heroBoardRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    gap: 8,
  },
  heroBoardRowGlobal: {
    flex: 1,
  },
  boardMetric: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    justifyContent: 'space-between',
  },
  boardMetricCompleted: {
    backgroundColor: 'rgba(57, 110, 95, 0.24)',
    shadowColor: 'rgba(108, 201, 164, 0.22)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  boardMetricPressed: {
    opacity: 0.94,
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
  boardMetricArtworkLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    overflow: 'hidden',
  },
  boardMetricArtworkSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  boardMetricArtworkStack: {
    position: 'relative',
  },
  boardMetricArtworkShadow: {
    position: 'absolute',
  },
  boardMetricArtwork: {
    position: 'absolute',
  },
  boardMetricBadge: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(108, 201, 164, 0.26)',
    borderWidth: 1,
    borderColor: 'rgba(155, 232, 201, 0.34)',
  },
  boardMetricBadgeCompact: {
    top: 7,
    right: 8,
    width: 18,
    height: 18,
  },
  boardMetricTitleSlot: {
    minHeight: 28,
    marginTop: 6,
  },
  boardMetricTitleSlotCompact: {
    minHeight: 24,
    marginTop: 4,
  },
  boardMetricTitle: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
  boardMetricTitleCompact: {
    fontSize: 10,
    lineHeight: 11,
  },
  boardMetricTitleWithBadge: {
    paddingRight: 24,
  },
  boardMetricTitleWithBadgeCompact: {
    paddingRight: 22,
  },
  boardMetricScoreWrap: {
    marginTop: 4,
  },
  boardMetricScoreWrapCompact: {
    marginTop: 2,
  },
  boardMetricValue: {
    color: uiTheme.surface,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '900',
  },
  boardMetricValueCompleted: {
    color: '#b7ffe0',
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
  boardMetricContextCompleted: {
    color: 'rgba(203, 255, 232, 0.72)',
  },
  boardMetricContextCompact: {
    fontSize: 9,
    lineHeight: 10,
    marginTop: 2,
  },
  homeButtons: {
    gap: 10,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 23, 35, 0.46)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 0,
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
  regionPickerFrame: {
    marginTop: 16,
    height: 94,
    justifyContent: 'center',
  },
  regionPicker: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
  },
  regionPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    backgroundColor: uiTheme.backgroundStrong,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(16, 47, 70, 0.16)',
    gap: 14,
    position: 'relative',
  },
  variantPreviewCompleted: {
    borderColor: 'rgba(108, 201, 164, 0.72)',
    shadowColor: 'rgba(108, 201, 164, 0.22)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  variantPreviewCompletedOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    backgroundColor: 'rgba(57, 110, 95, 0.18)',
  },
  variantPreviewBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(108, 201, 164, 0.26)',
    borderWidth: 1,
    borderColor: 'rgba(155, 232, 201, 0.34)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  variantPreviewBadgeText: {
    color: uiTheme.surface,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  variantPreviewAccent: {
    width: 28,
    height: 4,
    borderRadius: 999,
  },
  variantPreviewTitle: {
    color: uiTheme.surface,
    fontSize: 18,
    fontWeight: '800',
  },
  variantPreviewTitleWithBadge: {
    paddingRight: 110,
  },
  variantMetaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaTile: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  metaTileValue: {
    color: uiTheme.surface,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '800',
  },
  metaTileLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '700',
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
    backgroundColor: uiTheme.backgroundStrong,
    borderWidth: 1,
    height: 102,
    paddingHorizontal: 15,
    paddingVertical: 12,
    position: 'relative',
    overflow: 'hidden',
    gap: 8,
    justifyContent: 'space-between',
  },
  historyItemCompleted: {
    shadowColor: 'rgba(108, 201, 164, 0.22)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  historyItemCompletedOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    backgroundColor: 'rgba(57, 110, 95, 0.18)',
  },
  historyItemArtworkLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    overflow: 'hidden',
  },
  historyItemArtworkSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  historyItemArtworkStack: {
    position: 'relative',
  },
  historyItemArtworkShadow: {
    position: 'absolute',
  },
  historyItemArtwork: {
    position: 'absolute',
  },
  historyItemAccent: {
    width: 26,
    height: 4,
    borderRadius: 999,
  },
  historyItemMainRow: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  historyItemInfo: {
    flexShrink: 1,
    maxWidth: '58%',
    minWidth: 0,
    justifyContent: 'center',
  },
  historyItemTitle: {
    color: uiTheme.surface,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '800',
  },
  historyItemTitleCompleted: {
    color: '#d6ffed',
  },
  historyItemPillsFloating: {
    position: 'absolute',
    top: 12,
    right: 14,
    zIndex: 2,
  },
  historyItemPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    minHeight: 19,
  },
  historyItemDate: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  historyItemBadgeHighscore: {
    borderRadius: 999,
    backgroundColor: 'rgba(246, 225, 142, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(247, 223, 133, 0.5)',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  historyItemBadgeHighscoreText: {
    color: '#f6e18e',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  historyItemBadgeCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(108, 201, 164, 0.26)',
    borderWidth: 1,
    borderColor: 'rgba(155, 232, 201, 0.34)',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  historyItemBadgeCompletedText: {
    color: uiTheme.surface,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  historyItemScoreLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    minWidth: 0,
    justifyContent: 'flex-start',
    marginTop: 8,
  },
  historyItemScoreValue: {
    color: uiTheme.surface,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
  },
  historyItemScoreValueCompleted: {
    color: '#b7ffe0',
  },
  historyItemScoreContext: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '700',
  },
  historyItemScoreContextCompleted: {
    color: 'rgba(203, 255, 232, 0.72)',
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
