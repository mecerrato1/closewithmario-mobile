import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_BRAND } from '../../brand/brands';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('button fills and text colours meet 4.5:1 contrast on their backgrounds', () => {
  const { colors } = PUBLIC_BRAND;
  assert.ok(contrast('#FFFFFF', colors.accentStrong) >= 4.5, 'button');
  assert.ok(contrast(colors.accentText, '#FFFFFF') >= 4.5, 'link on white');
  assert.ok(contrast(colors.accentText, colors.canvas) >= 4.5, 'link on canvas');
  assert.ok(contrast('#FFFFFF', colors.primary) >= 7, 'header text');
  assert.ok(contrast(colors.textSecondary, colors.canvas) >= 4.5, 'secondary text');
});
