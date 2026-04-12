import * as Network from 'expo-network';

export function useOnlineStatus(): boolean {
  const state = Network.useNetworkState();

  if (state.isInternetReachable === false) {
    return false;
  }
  if (state.isConnected === false) {
    return false;
  }
  return true;
}
