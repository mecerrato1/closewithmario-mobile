import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { GIO } from './gioImages';

export function CaughtUp() {
  return (
    <View style={styles.box}>
      <Image source={GIO.highFive} style={styles.art} resizeMode="contain" accessibilityElementsHidden />
      <Text style={styles.title}>You're caught up for today</Text>
      <Text style={styles.body}>Nobody left to call. Nice work.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 16 },
  art: { width: 170, height: 118 },
  title: { color: '#0F172A', fontSize: 17, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  body: { color: '#64748B', fontSize: 13, marginTop: 4, textAlign: 'center' },
});
