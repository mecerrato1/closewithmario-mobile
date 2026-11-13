import React from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { BrandConfig } from './brands';

/** The Agent | LO | Connect mark: three vertical bars (see the web brand reference). */
export function AgentLoMark({ size, barColor, centerColor }: { size: number; barColor: string; centerColor: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden>
      <Rect x={10} y={30} width={8} height={20} rx={2} fill={barColor} />
      <Rect x={28} y={14} width={8} height={36} rx={2} fill={centerColor} />
      <Rect x={46} y={22} width={8} height={28} rx={2} fill={barColor} />
    </Svg>
  );
}

type Props = { brand: BrandConfig; size?: 'large' | 'small'; tone?: 'onLight' | 'onDark' };

export default function BrandLogo({ brand, size = 'large', tone = 'onLight' }: Props) {
  const large = size === 'large';
  if (brand.id === 'close-with-mario') {
    return (
      <Image
        accessibilityLabel={brand.displayName}
        source={require('../../assets/CWMLogo.png')}
        style={large ? styles.cwmLarge : styles.cwmSmall}
        resizeMode="contain"
      />
    );
  }

  const textColor = tone === 'onDark' ? '#FFFFFF' : brand.colors.textPrimary;
  const center = tone === 'onDark' ? '#FFFFFF' : brand.colors.primary;
  return (
    <View
      accessible
      accessibilityLabel={brand.displayName}
      style={[styles.row, large && styles.rowLarge]}
    >
      <AgentLoMark size={large ? 56 : 28} barColor={brand.colors.accent} centerColor={center} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={1.2}
        style={[styles.wordmark, { color: textColor, fontSize: large ? 24 : 16 }]}
      >
        Agent
        <Text style={{ color: brand.colors.accent }}>{'  |  '}</Text>
        LO
        <Text style={{ color: brand.colors.accent }}>{'  |  '}</Text>
        Connect
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLarge: { flexDirection: 'column', gap: 12 },
  wordmark: { fontWeight: '700', letterSpacing: 0.3 },
  cwmLarge: { width: 108, height: 108 },
  cwmSmall: { width: 120, height: 40 },
});
