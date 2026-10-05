export const lightColors = {
  background: '#f6f7fb', surface: '#ffffff', sidebar: '#fcfcfe', text: '#26334a',
  muted: '#64718a', border: '#dde2ec', hover: '#f0f3fc', accent: '#5266df',
  accentHover: '#4356ca', accentText: '#ffffff', accentSoft: '#edf0ff', focus: '#a5b7ff',
  success: '#39734f', successSoft: '#edf7f0', warning: '#806322', warningSoft: '#fff8e9',
  danger: '#a14747', dangerSoft: '#fff0f0', purple: '#8962bd', purpleSoft: '#f2edf9',
  overlay: '#202f5065', shadow: '#18264720',
};
export type Colors = typeof lightColors;
export interface Theme { id: string; name: string; scheme: 'light' | 'dark'; colors: Colors }
export const builtInThemes: Theme[] = [
  { id: 'sky', name: 'Sky', scheme: 'light', colors: lightColors },
  { id: 'midnight', name: 'Midnight', scheme: 'dark', colors: {
    background: '#141824', surface: '#202738', sidebar: '#191f2d', text: '#edf1fa',
    muted: '#adb9d0', border: '#3e4a62', hover: '#2d374e', accent: '#a1b0ff',
    accentHover: '#c1cbff', accentText: '#151c37', accentSoft: '#303b60', focus: '#b6c2ff',
    success: '#95d9ae', successSoft: '#223d32', warning: '#edcd8d', warningSoft: '#423825',
    danger: '#f4aaa9', dangerSoft: '#472c35', purple: '#c9aff3', purpleSoft: '#3a3050',
    overlay: '#080b16b0', shadow: '#00000040',
  } },
  { id: 'forest', name: 'Forest', scheme: 'light', colors: { ...lightColors,
    background: '#f1f5ef', sidebar: '#f8faf5', text: '#233d32', muted: '#587064',
    border: '#d1ddd1', hover: '#e8f0e5', accent: '#357253', accentHover: '#28593f',
    accentSoft: '#e0eee1', focus: '#76b58b',
  } },
  { id: 'sand', name: 'Sand', scheme: 'light', colors: { ...lightColors,
    background: '#f7f1e7', surface: '#fffcf5', sidebar: '#fbf6ed', text: '#49382b',
    muted: '#786552', border: '#e2d5c1', hover: '#f1e6d4', accent: '#99602d',
    accentHover: '#78471e', accentSoft: '#f2e2c9', focus: '#c69a68',
  } },
  { id: 'plum', name: 'Plum', scheme: 'dark', colors: {
    background: '#231b2c', surface: '#30263b', sidebar: '#291f33', text: '#f6edf9',
    muted: '#c6b2d0', border: '#594563', hover: '#44334f', accent: '#ddb0ee',
    accentHover: '#edcbf8', accentText: '#2e1938', accentSoft: '#50365f', focus: '#e8c2fa',
    success: '#a6dbb1', successSoft: '#2c4036', warning: '#efd19c', warningSoft: '#493c30',
    danger: '#f7adb9', dangerSoft: '#50303f', purple: '#d5b4f7', purpleSoft: '#49355d',
    overlay: '#110a19b0', shadow: '#00000040',
  } },
];
export const storageKey = 'lantern-themes-v1';
export const maxThemeBytes = 32 * 1024;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parseTheme(text: string): Omit<Theme, 'id'> {
  if (new TextEncoder().encode(text).length > maxThemeBytes) throw new Error('Theme files must be 32 KB or smaller.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Choose a valid JSON theme file.'); }
  if (!isObject(value) || value.version !== 1) throw new Error('Theme files must include "version": 1.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 60) throw new Error('Give your theme a name between 1 and 60 characters.');
  const base = builtInThemes.find(theme => theme.id === value.base);
  if (!base) throw new Error('Choose a base: sky, midnight, forest, sand, or plum.');
  if (!isObject(value.colors) || !Object.keys(value.colors).length) throw new Error('Include at least one color in "colors".');
  const colors = { ...base.colors };
  for (const [key, color] of Object.entries(value.colors)) {
    if (!Object.hasOwn(lightColors, key)) throw new Error(`Unknown theme color: ${key}.`);
    if (typeof color !== 'string' || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(color)) throw new Error(`Use a hex color such as #5266df for ${key}.`);
    colors[key as keyof Colors] = color;
  }
  return { name: value.name.trim(), scheme: base.scheme, colors };
}
export interface ThemeSettings { selected: string; custom: Theme[] }
export function loadThemes(storage: Pick<Storage, 'getItem'>): ThemeSettings {
  const fallback = { selected: 'sky', custom: [] };
  try {
    const raw: unknown = JSON.parse(storage.getItem(storageKey) || 'null');
    if (!isObject(raw) || !Array.isArray(raw.custom)) return fallback;
    const custom: Theme[] = raw.custom.map((item: unknown) => {
      if (!isObject(item) || typeof item.id !== 'string' || !item.id.startsWith('custom-') || !['light', 'dark'].includes(String(item.scheme))) throw new Error('Invalid saved theme');
      return { ...parseTheme(JSON.stringify({ version: 1, name: item.name, base: item.scheme === 'dark' ? 'midnight' : 'sky', colors: item.colors })), id: item.id };
    });
    if (new Set(custom.map(theme => theme.id)).size !== custom.length) return fallback;
    const selected = [...builtInThemes, ...custom].some(theme => theme.id === raw.selected) ? String(raw.selected) : 'sky';
    return { selected, custom };
  } catch { return fallback; }
}
export function applyTheme(theme: Theme) {
  for (const [key, value] of Object.entries(theme.colors)) document.documentElement.style.setProperty(`--${key}`, value);
  document.documentElement.style.colorScheme = theme.scheme;
  window.lantern.setWindowTheme({ background: theme.colors.surface, text: theme.colors.text, scheme: theme.scheme });
}
