import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtInThemes, lightColors, loadThemes, maxThemeBytes, parseTheme } from '../src/renderer/themes';
const encode = (extra = {}) => JSON.stringify({ version: 1, name: 'My theme', base: 'sky', colors: { accent: '#123456' }, ...extra });

test('custom themes inherit the base and override only supplied colors', () => {
  const theme = parseTheme(encode({ name: '  Custom night  ', base: 'midnight' }));
  assert.equal(theme.name, 'Custom night');
  assert.equal(theme.scheme, 'dark');
  assert.equal(theme.colors.accent, '#123456');
  assert.equal(theme.colors.background, builtInThemes[1].colors.background);
  assert.deepEqual(Object.keys(theme.colors), Object.keys(lightColors));
});
test('invalid and executable theme values are rejected', () => {
  for (const text of ['oops', 'null', '[]', encode({ version: 2 }), encode({ name: ' ' }), encode({ name: 'a'.repeat(61) }), encode({ base: 'unknown' }), encode({ colors: {} }), encode({ colors: { background: 'url(https://example.com)' } }), encode({ colors: { accent: '#fff; color:red' } }), encode({ colors: { unknown: '#123456' } }), encode({ colors: { __proto__: null, constructor: '#123456' } }), ' '.repeat(maxThemeBytes + 1)]) {
    assert.throws(() => parseTheme(text));
  }
});
test('all built-in palettes can round-trip through the upload format', () => {
  for (const theme of builtInThemes) assert.deepEqual(parseTheme(encode({ base: theme.id, colors: theme.colors })).colors, theme.colors);
});
test('saved selection and custom themes survive loading', () => {
  const theme = { ...parseTheme(encode({ base: 'plum' })), id: 'custom-test' };
  const settings = { selected: theme.id, custom: [theme] };
  assert.deepEqual(loadThemes({ getItem: () => JSON.stringify(settings) }), settings);
});
test('unavailable or corrupt storage falls back to Sky', () => {
  const fallback = { selected: 'sky', custom: [] };
  for (const value of [null, '{broken', '{}', JSON.stringify({ selected: 'missing', custom: [] }), JSON.stringify({ selected: 'sky', custom: [{ id: 'custom-bad' }] })]) {
    assert.deepEqual(loadThemes({ getItem: () => value }), fallback);
  }
  assert.deepEqual(loadThemes({ getItem: () => { throw new Error('unavailable'); } }), fallback);
});
