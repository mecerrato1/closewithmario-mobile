import { Platform, StatusBar } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

/**
 * Top padding for a header. iOS keeps its own value. Android draws behind the
 * status bar, whose height differs between phones, so never pad less than it.
 */
export function screenTop(ios: number, android: number): number {
  if (Platform.OS !== 'android') return ios;
  return Math.max(android, (StatusBar.currentHeight ?? 24) + 4);
}

/**
 * Bottom padding for a sheet that slides up from the edge. Android draws it
 * behind the navigation bar, which is tall with three buttons.
 */
export function sheetBottom(ios: number, android: number = ios): number {
  if (Platform.OS !== 'android') return ios;
  return Math.max(android, (initialWindowMetrics?.insets.bottom ?? 0) + 12);
}
