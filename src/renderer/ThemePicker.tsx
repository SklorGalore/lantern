import React, { useRef, useState } from 'react';
import { builtInThemes, maxThemeBytes, parseTheme, type Theme, type ThemeSettings } from './themes';

export function ThemePicker({ settings, onChange }: { settings: ThemeSettings; onChange: (settings: ThemeSettings) => void }) {
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const themes = [...builtInThemes, ...settings.custom];
  function change(next: ThemeSettings) {
    try { onChange(next); setError(''); } catch { setError('Could not save your theme. Local storage may be full or unavailable.'); }
  }
  async function upload(file: File) {
    setUploading(true); setError('');
    try {
      if (file.size > maxThemeBytes) throw new Error('Theme files must be 32 KB or smaller.');
      const theme: Theme = { ...parseTheme(await file.text()), id: `custom-${crypto.randomUUID()}` };
      onChange({ selected: theme.id, custom: [...settings.custom, theme] });
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not upload this theme.'); }
    finally { setUploading(false); }
  }
  function download() {
    const theme = themes.find(theme => theme.id === settings.selected)!;
    const blob = new Blob([JSON.stringify({ version: 1, name: 'My theme', base: theme.scheme === 'dark' ? 'midnight' : 'sky', colors: theme.colors }, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'lantern-theme.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <span className="eyebrow">MAKE YOURSELF AT HOME</span><h2 id="modal-title">Themes</h2>
    <p>Choose a palette for your workspace. Your choice is saved on this device.</p>
    <div className="theme-options" role="group" aria-label="Workspace theme">
      {themes.map(theme => <button key={theme.id} className="theme-option" aria-pressed={settings.selected === theme.id} disabled={uploading} onClick={() => change({ ...settings, selected: theme.id })}>
        <span className="theme-swatches" aria-hidden="true">{[theme.colors.background, theme.colors.surface, theme.colors.accent, theme.colors.text].map((color, i) => <i key={i} style={{ background: color }}/>)}</span>
        <span>{theme.name}</span><small>{settings.selected === theme.id ? 'Selected' : theme.scheme === 'dark' ? 'Dark' : 'Light'}</small>
      </button>)}
    </div>
    <h3 className="theme-upload-heading">Your own theme</h3>
    <p>Download the current palette as a template, edit its colors, then upload the JSON file (up to 32 KB).</p>
    <div className="button-row"><button disabled={uploading} onClick={() => input.current?.click()}>{uploading ? 'Uploading…' : 'Upload theme'}</button><button onClick={download}>Download template</button>
    {settings.custom.some(theme => theme.id === settings.selected) && <button disabled={uploading} onClick={() => change({ selected: 'sky', custom: settings.custom.filter(theme => theme.id !== settings.selected) })}>Remove selected theme</button>}</div>
    <input ref={input} hidden type="file" accept=".json,application/json" aria-label="Upload theme file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }}/>
    {error && <div className="alert error" role="alert">{error}</div>}
  </>;
}
