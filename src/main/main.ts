import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { readFile, writeFile, mkdir, rename, realpath } from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { defaults, flow, branchKind, type FlowConfig, type Request, type Reply } from '../shared';
import { git, optional, Repository, hostingUrl } from './git';
interface Settings { recent: string[]; repos: Record<string, { config: FlowConfig; confirmations: Record<string, string[]> }> }
let settings: Settings = { recent: [], repos: {} }; let repository: Repository | undefined; let window: BrowserWindow; let queue = Promise.resolve();
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
async function save() { await mkdir(app.getPath('userData'), { recursive: true }); await writeFile(settingsFile() + '.tmp', JSON.stringify(settings, null, 2)); await rename(settingsFile() + '.tmp', settingsFile()); }
async function state(): Promise<Reply> { if (!repository) return {}; const stored = settings.repos[repository.cwd]; const repo = await repository.snapshot(!!stored); repo.confirmations = stored?.confirmations[`${repo.branch}:${repo.head}`] || []; return { repo }; }
async function openRepo(location: string) { const root = (await git(location, ['rev-parse', '--show-toplevel'])).trim(); const canonical = await realpath(root); const configured = settings.repos[canonical]?.config; const config = configured || { ...defaults, production: (await optional(canonical, ['show-ref', '--verify', 'refs/heads/main'])) ? 'main' : (await optional(canonical, ['show-ref', '--verify', 'refs/heads/master'])) ? 'master' : 'main' }; repository = new Repository(canonical, config); settings.recent = [canonical, ...settings.recent.filter(p => p !== canonical)].slice(0, 10); await save(); return state(); }
async function handle(request: Request): Promise<Reply> {
  if (request.action === 'home') return { home: { recent: settings.recent, git: !!(await optional(app.getPath('home'), ['--version'])) } };
  if (request.action === 'open') { const location = request.path || (await dialog.showOpenDialog(window, { properties: ['openDirectory'] })).filePaths[0]; return location ? openRepo(location) : { cancelled: true }; }
  if (request.action === 'clone') {
    if (!request.url || !/^(https:\/\/|ssh:\/\/|git@)[^\s]+$/.test(request.url)) throw new Error('Enter an HTTPS or SSH repository URL.');
    const destination = (await dialog.showSaveDialog(window, { title: 'Choose a new folder for the cloned repository', defaultPath: path.join(app.getPath('documents'), request.url.split('/').pop()?.replace(/\.git$/, '') || 'repository'), buttonLabel: 'Clone here' })).filePath;
    if (!destination) return { cancelled: true };
    await git(path.dirname(destination), ['clone', '--', request.url, destination], 180000); return openRepo(destination);
  }
  if (!repository) throw new Error('Open a repository first.');
  switch (request.action) {
    case 'refresh': break;
    case 'diff': return { diff: await repository.diff(request.path) };
    case 'configure': await repository.configure(request.config, request.createDevelop); settings.repos[repository.cwd] = { config: request.config, confirmations: settings.repos[repository.cwd]?.confirmations || {} }; await save(); break;
    case 'create': if (!settings.repos[repository.cwd]) throw new Error('Set up Git Flow first.'); await repository.create(request.kind, request.name); break;
    case 'switch': await repository.switch(request.branch); break;
    case 'fetch': await repository.fetch(); break;
    case 'pull': await repository.pull(); break;
    case 'push': await repository.push(); break;
    case 'commit': await repository.commit(request.paths, request.message, request.head, request.fingerprint); break;
    case 'website': { const s = await repository.snapshot(); const kind = branchKind(s.branch); if (request.target && (!kind || !flow(kind, s.config).targets.includes(request.target))) throw new Error('Invalid merge destination.'); await shell.openExternal(hostingUrl(s.remote, s.branch, request.target)); break; }
    case 'confirm': { const s = await repository.snapshot(); const kind = branchKind(s.branch); if (!kind || !flow(kind, s.config).targets.includes(request.target)) throw new Error('Invalid merge destination.'); if (request.checked && (s.files.length || s.blockers.length || s.ahead || s.upstream !== `origin/${s.branch}`)) throw new Error('Push all commits and finish local changes before confirming a merge.'); const stored = settings.repos[repository.cwd]; if (!stored) throw new Error('Set up Git Flow first.'); const key = `${s.branch}:${s.head}`; const targets = flow(kind, s.config).targets; if (request.checked && targets.indexOf(request.target) > 0 && !(stored.confirmations[key] || []).includes(targets[0])) throw new Error('Confirm the production merge first.'); const previous = stored.confirmations[key] || []; stored.confirmations[key] = request.checked ? [...new Set([...previous, request.target])] : previous.filter(t => t !== request.target); await save(); break; }
    case 'folder': { const error = await shell.openPath(repository.cwd); if (error) throw new Error(error); break; }
    case 'editor': await new Promise<void>((resolve, reject) => execFile('code', [repository!.cwd], error => error ? reject(new Error('Install the VS Code “code” command, or open this folder in your preferred editor.')) : resolve())); break;
    case 'terminal': { const cwd = repository.cwd;
      if (process.platform === 'darwin') await new Promise<void>((resolve, reject) => execFile('open', ['-a', 'Terminal', cwd], error => error ? reject(error) : resolve()));
      else await new Promise<void>((resolve, reject) => { const child = spawn(process.platform === 'win32' ? 'cmd.exe' : 'x-terminal-emulator', process.platform === 'win32' ? ['/K'] : [], { cwd, detached: true, stdio: 'ignore', windowsHide: false }); child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); }); }); break; }
  }
  return state();
}
app.whenReady().then(async () => {
  try { const parsed = JSON.parse(await readFile(settingsFile(), 'utf8')); if (Array.isArray(parsed.recent) && parsed.repos && typeof parsed.repos === 'object') settings = parsed; } catch { /* first launch */ }
  ipcMain.handle('git-sky', (event, request: Request) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted sender.');
    const result = queue.then(async () => { try { return await handle(request); } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; } }); queue = result.then(() => undefined); return result;
  });
  function createWindow() { window = new BrowserWindow({ width: 1320, height: 880, minWidth: 1000, minHeight: 700, backgroundColor: '#f5f6fa', title: 'Git Sky', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } }); window.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); window.webContents.on('will-navigate', event => event.preventDefault()); void window.loadFile(path.join(__dirname, '../../renderer/index.html')); }
  createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
