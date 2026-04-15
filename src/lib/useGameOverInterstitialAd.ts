import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StatusBar as NativeStatusBar } from 'react-native';
import {
  getTrackingPermissionsAsync,
  PermissionStatus,
  requestTrackingPermissionsAsync,
} from 'expo-tracking-transparency';
import mobileAds, { TestIds, useInterstitialAd } from 'react-native-google-mobile-ads';

const GAME_OVER_INTERSTITIAL_AD_UNIT_IDS = {
  android: 'ca-app-pub-0000000000000000/0000000000',
  ios: 'ca-app-pub-6399393872087612/9387525769',
} as const;

function isPlaceholderAdUnitId(adUnitId: string) {
  return adUnitId.includes('0000000000000000') || adUnitId.endsWith('/0000000000');
}

function getGameOverInterstitialAdUnitId() {
  if (__DEV__) {
    return TestIds.INTERSTITIAL;
  }

  const adUnitId =
    Platform.OS === 'android'
      ? GAME_OVER_INTERSTITIAL_AD_UNIT_IDS.android
      : Platform.OS === 'ios'
        ? GAME_OVER_INTERSTITIAL_AD_UNIT_IDS.ios
        : null;

  if (!adUnitId || isPlaceholderAdUnitId(adUnitId)) {
    return null;
  }

  return adUnitId;
}

export function useGameOverInterstitialAd() {
  const adUnitId = useMemo(getGameOverInterstitialAdUnitId, []);
  const [isMobileAdsInitialized, setIsMobileAdsInitialized] = useState(false);
  const { isClosed, isLoaded, isShowing, load, show } = useInterstitialAd(adUnitId);

  useEffect(() => {
    if (!adUnitId) {
      return undefined;
    }

    let isActive = true;

    const initializeMobileAds = async () => {
      if (Platform.OS === 'ios') {
        const trackingPermissions = await getTrackingPermissionsAsync();
        if (trackingPermissions.status === PermissionStatus.UNDETERMINED) {
          await requestTrackingPermissionsAsync();
        }
      }

      await mobileAds().initialize();
      if (isActive) {
        setIsMobileAdsInitialized(true);
      }
    };

    void initializeMobileAds().catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [adUnitId]);

  useEffect(() => {
    if (adUnitId && isMobileAdsInitialized) {
      load();
    }
  }, [adUnitId, isMobileAdsInitialized, load]);

  useEffect(() => {
    if (adUnitId && isMobileAdsInitialized && isClosed) {
      load();
    }
  }, [adUnitId, isClosed, isMobileAdsInitialized, load]);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return undefined;
    }

    NativeStatusBar.setHidden(isShowing, 'fade');

    return () => {
      NativeStatusBar.setHidden(false, 'fade');
    };
  }, [isShowing]);

  const showGameOverInterstitial = useCallback(() => {
    if (!adUnitId || !isMobileAdsInitialized || isShowing) {
      return false;
    }

    if (!isLoaded) {
      load();
      return false;
    }

    show();
    return true;
  }, [adUnitId, isLoaded, isMobileAdsInitialized, isShowing, load, show]);

  return { showGameOverInterstitial };
}
