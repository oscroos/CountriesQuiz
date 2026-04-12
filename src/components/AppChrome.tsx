import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { uiTheme } from '../theme/uiTheme';

export function HelpSection({
  points,
  title,
}: {
  points: readonly string[];
  title: string;
}) {
  return (
    <View style={styles.helpSection}>
      <Text style={styles.helpSectionTitle}>{title}</Text>
      <View style={styles.helpPointList}>
        {points.map((point) => (
          <View key={point} style={styles.helpPointRow}>
            <View style={styles.helpPointBullet} />
            <Text style={styles.helpPointText}>{point}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function StatCard({
  icon,
  label,
  tone,
  value,
}: {
  icon: 'target' | 'trophy';
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
      <View
        style={[
          styles.statCardIconWrap,
          icon === 'target' ? styles.statCardIconWrapScore : styles.statCardIconWrapHighscore,
        ]}
      >
        {icon === 'target' ? (
          <Feather color="#ffd3af" name="target" size={16} />
        ) : (
          <MaterialCommunityIcons color="#d9b04b" name="trophy-outline" size={16} />
        )}
      </View>
      <View style={styles.statCardText}>
        <Text style={styles.statCardValue}>{value}</Text>
        <Text style={styles.statCardLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function SummaryMetric({
  icon,
  label,
  tone,
  value,
}: {
  icon: 'clock' | 'target';
  label: string;
  tone: 'score' | 'time';
  value: string;
}) {
  return (
    <View
      style={[
        styles.summaryMetric,
        tone === 'score' ? styles.summaryMetricScore : styles.summaryMetricTime,
      ]}
    >
      <View
        style={[
          styles.summaryMetricIconWrap,
          tone === 'score' ? styles.summaryMetricIconWrapScore : styles.summaryMetricIconWrapTime,
        ]}
      >
        <Feather color={tone === 'score' ? '#ffd3af' : '#d6ffed'} name={icon} size={16} />
      </View>
      <Text style={styles.summaryMetricValue}>{value}</Text>
      <Text style={styles.summaryMetricLabel}>{label}</Text>
    </View>
  );
}

export function OfflineOverlay({ visible }: { visible: boolean }) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={() => {}}
    >
      <View style={styles.offlineOverlay}>
        <LinearGradient
          colors={[
            'rgba(8, 23, 35, 0.72)',
            'rgba(8, 23, 35, 0.58)',
            'rgba(8, 23, 35, 0.76)',
          ]}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.offlineCard}>
          <View style={styles.offlineIconWrap}>
            <Feather color="#ff9b57" name="wifi-off" size={32} />
          </View>
          <Text style={styles.offlineTitle}>You're offline</Text>
          <Text style={styles.offlineBody}>
            Countries Quiz needs an internet connection to work. Reconnect to Wi-Fi or mobile
            data and the app will pick up right where you left off.
          </Text>
          <View style={styles.offlineStatusRow}>
            <ActivityIndicator color="rgba(255,250,242,0.82)" size="small" />
            <Text style={styles.offlineStatusText}>Waiting for a connection...</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function BottomSheetModal({
  children,
  fillHeight = false,
  onClose,
  visible,
}: {
  children: ReactNode;
  fillHeight?: boolean;
  onClose: () => void;
  visible: boolean;
}) {
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isMounted, setIsMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(viewportHeight)).current;
  const dragStartValueRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        translateY.stopAnimation((value) => {
          dragStartValueRef.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(0, dragStartValueRef.current + gesture.dy);
        translateY.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 120 || gesture.vy > 0.8) {
          onCloseRef.current();
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 18,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 18,
        }).start();
      },
    }),
  ).current;

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
            fillHeight && styles.sheetCardFillHeight,
            {
              paddingBottom: 20 + insets.bottom,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.sheetHandleArea} {...panResponder.panHandlers}>
            <View style={styles.sheetHandle} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  sheetCardFillHeight: {
    height: '92%',
  },
  sheetHandleArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: -12,
    marginBottom: 2,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(8, 23, 35, 0.18)',
  },
  helpSection: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: uiTheme.surfaceTint,
    borderWidth: 1,
    borderColor: uiTheme.border,
  },
  helpSectionTitle: {
    color: uiTheme.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  helpPointList: {
    gap: 8,
    marginTop: 10,
  },
  helpPointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  helpPointBullet: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginTop: 7,
    backgroundColor: uiTheme.accentStrong,
  },
  helpPointText: {
    flex: 1,
    color: uiTheme.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  statCardAccent: {
    backgroundColor: 'rgba(255, 155, 87, 0.18)',
  },
  statCardDanger: {
    backgroundColor: 'rgba(212, 99, 74, 0.16)',
  },
  statCardText: {
    flexShrink: 1,
  },
  statCardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statCardIconWrapScore: {
    backgroundColor: 'rgba(255, 155, 87, 0.16)',
    borderColor: 'rgba(255, 186, 138, 0.28)',
  },
  statCardIconWrapHighscore: {
    backgroundColor: 'rgba(202, 138, 4, 0.18)',
    borderColor: 'rgba(180, 117, 0, 0.34)',
  },
  statCardValue: {
    color: uiTheme.surface,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  statCardLabel: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 11,
    marginTop: 1,
    fontWeight: '600',
    lineHeight: 14,
  },
  summaryMetric: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 14,
    backgroundColor: uiTheme.backgroundStrong,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  summaryMetricScore: {
    shadowColor: 'rgba(255, 155, 87, 0.16)',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  summaryMetricTime: {
    shadowColor: 'rgba(108, 201, 164, 0.2)',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  summaryMetricIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
  },
  summaryMetricIconWrapScore: {
    backgroundColor: 'rgba(255, 155, 87, 0.16)',
    borderColor: 'rgba(255, 186, 138, 0.28)',
  },
  summaryMetricIconWrapTime: {
    backgroundColor: 'rgba(108, 201, 164, 0.16)',
    borderColor: 'rgba(155, 232, 201, 0.28)',
  },
  summaryMetricValue: {
    color: uiTheme.surface,
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '800',
  },
  summaryMetricLabel: {
    color: 'rgba(255,255,255,0.64)',
    marginTop: 5,
    fontSize: 12,
    fontWeight: '700',
  },
  offlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  offlineCard: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: uiTheme.surface,
    padding: 24,
    alignItems: 'center',
    shadowColor: uiTheme.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
  },
  offlineIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 155, 87, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 186, 138, 0.34)',
    marginBottom: 16,
  },
  offlineTitle: {
    color: uiTheme.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  offlineBody: {
    color: uiTheme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
  },
  offlineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(8, 23, 35, 0.9)',
  },
  offlineStatusText: {
    color: 'rgba(255,250,242,0.82)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
