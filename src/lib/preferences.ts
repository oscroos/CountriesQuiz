import AsyncStorage from '@react-native-async-storage/async-storage';

const ZOOM_HINT_DISMISSED_KEY = 'countries-quiz.zoomHintDismissed.v1';

export async function loadZoomHintDismissed(): Promise<boolean> {
  try {
    const rawValue = await AsyncStorage.getItem(ZOOM_HINT_DISMISSED_KEY);
    return rawValue === 'true';
  } catch {
    return false;
  }
}

export async function saveZoomHintDismissed(): Promise<void> {
  try {
    await AsyncStorage.setItem(ZOOM_HINT_DISMISSED_KEY, 'true');
  } catch {
    // Best-effort persistence; ignore storage errors.
  }
}
