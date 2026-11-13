import { StyleSheet } from 'react-native';
import type { BrandId } from './brands';

/**
 * Screens were written with Close With Mario's violet as literal colours.
 * Rather than edit ~1,700 literals, a screen's StyleSheet is created with
 * themedStyles(); at render time its colours are mapped to the active brand.
 * Close With Mario has no map, so its styles are returned exactly as written.
 */
const AGENT_LO_CONNECT_MAP: Record<string, string> = {
  '#7C3AED': '#2563EB',
  '#6D28D9': '#1D4ED8',
  '#8B5CF6': '#3B82F6',
  '#A78BFA': '#93C5FD',
  '#C4B5FD': '#BFD3FB',
  '#DDD6FE': '#BFD3FB',
  '#E9E0FF': '#BFD3FB',
  '#EDE9FE': '#E8F0FE',
  '#F5F3FF': '#F3F7FE',
  '#F9F5FF': '#F3F7FE',
  '#FAF5FF': '#F3F7FE',
  '#F3F0FF': '#F6F7F9',
  '#E8DFF5': '#F6F7F9',
  '#4C1D95': '#0B1220',
  '#5B21B6': '#0B1220',
};

const COLOUR_MAPS: Record<BrandId, Record<string, string> | null> = {
  'close-with-mario': null,
  'agent-lo-connect': AGENT_LO_CONNECT_MAP,
};

export function recolorStyle<T extends object>(style: T, map: Record<string, string>): T {
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (typeof value === 'string' && value[0] === '#') {
      const mapped = map[value.toUpperCase()];
      if (mapped) {
        out[key] = mapped;
        changed = true;
        continue;
      }
    }
    out[key] = value;
  }
  return changed ? (out as T) : style;
}

// Set by the authenticated shell once the server has confirmed the account's
// brand, and cleared when that shell unmounts. Public screens never read it.
let activeBrand: BrandId | null = null;

export function setActiveBrand(brand: BrandId | null) {
  activeBrand = brand;
}

export function getActiveBrand(): BrandId | null {
  return activeBrand;
}

/** Drop-in replacement for StyleSheet.create that follows the active brand. */
export function themedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  base: T | StyleSheet.NamedStyles<T>,
): T {
  const source = StyleSheet.create(base) as T;
  const cache = new Map<BrandId, Record<string, unknown>>();
  return new Proxy(source, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string' || activeBrand === null) return original;
      const map = COLOUR_MAPS[activeBrand];
      if (!map || original === null || typeof original !== 'object') return original;
      let brandCache = cache.get(activeBrand);
      if (!brandCache) {
        brandCache = {};
        cache.set(activeBrand, brandCache);
      }
      if (!(prop in brandCache)) brandCache[prop] = recolorStyle(original, map);
      return brandCache[prop];
    },
  }) as T;
}
