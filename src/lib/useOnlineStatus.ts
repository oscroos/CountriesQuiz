import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const PROBE_URL = 'https://www.gstatic.com/generate_204';
const ONLINE_INTERVAL_MS = 15000;
const OFFLINE_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 4000;

async function probeConnection(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(PROBE_URL, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);
  const isActiveRef = useRef(true);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isActiveRef.current = true;
    let currentOnline = true;

    const clearPendingTimer = () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };

    const runProbe = async () => {
      const online = await probeConnection();
      if (!isActiveRef.current) {
        return;
      }
      currentOnline = online;
      setIsOnline(online);
      clearPendingTimer();
      timeoutIdRef.current = setTimeout(
        runProbe,
        online ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS,
      );
    };

    runProbe();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !currentOnline) {
        runProbe();
      }
    });

    return () => {
      isActiveRef.current = false;
      clearPendingTimer();
      appStateSub.remove();
    };
  }, []);

  return isOnline;
}
