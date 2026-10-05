import { execFile } from 'node:child_process';
import { access, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { branchKind, flow, type BranchKind, type ChangedFile, type FlowConfig, type RepoState } from '../shared';

export function git(cwd: string, args: string[], timeout = 30000): Promise<string> {
  return new Promise((resolve, reject) => execFile('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' } }, (error, stdout, stderr) => {
    if (error) reject(new Error((stderr || error.message).trim() + (/authentication|permission denied|could not read Username/i.test(stderr) ? '\nConfigure your Git credentials outside Lantern, then retry.' : '')));
    else resolve(stdout);
  }));
}
export async function optional(cwd: string, args: string[]) { try { return (await git(cwd, args)).trim(); } catch { return ''; } }
export function parseStatus(raw: string): ChangedFile[] {
  const entries = raw.split('\0'); const files: ChangedFile[] = [];
  for (let i = 0; i < entries.length; i++) { const entry = entries[i]; if (!entry) continue; const status = entry.slice(0, 2); const file: ChangedFile = { path: entry.slice(3), status, staged: status[0] !== ' ' && status[0] !== '?' }; if (/[RC]/.test(status)) file.original = entries[++i]; files.push(file); }
  return files;
}
export class Repository {
  constructor(readonly cwd: string, public config: FlowConfig) {}
  async files() { return parseStatus(await git(this.cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])); }
  async snapshot(configured = true, confirmations: string[] = []): Promise<RepoState> {
    const branch = await optional(this.cwd, ['symbolic-ref', '--short', 'HEAD']);
    const head = await optional(this.cwd, ['rev-parse', '--verify', 'HEAD']);
    const files = await this.files();
    const upstream = await optional(this.cwd, ['rev-parse', '--abbrev-ref', '@{upstream}']);
    const counts = upstream ? (await optional(this.cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])).split(/\s+/).map(Number) : [0, 0];
    const blockers: string[] = [];
    if (!branch) blockers.push('Detached HEAD: create or select a branch in your editor or terminal.');
    if (!head) blockers.push('This repository needs its first commit. Create it in your editor or terminal, then refresh.');
    if (files.some(f => ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(f.status))) blockers.push('Conflicting files need to be resolved in your editor or terminal.');
    for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_START']) {
      const location = await optional(this.cwd, ['rev-parse', '--git-path', marker]);
      try { await access(path.resolve(this.cwd, location)); blockers.push(`Git operation in progress (${marker}). Finish or abort it in your editor or terminal.`); } catch { /* absent */ }
    }
    const kind = branchKind(branch);
    const base = kind ? flow(kind, this.config).base : this.config.development;
    const branchCommits = Number(await optional(this.cwd, ['rev-list', '--count', `refs/heads/${base}..HEAD`])) || 0;
    return { branchCommits, path: this.cwd, name: path.basename(this.cwd), branch, head, files, branches: (await git(this.cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])).trim().split('\n').filter(Boolean), remote: await optional(this.cwd, ['remote', 'get-url', 'origin']), upstream, ahead: counts[0] || 0, behind: counts[1] || 0, identity: !!(await optional(this.cwd, ['var', 'GIT_AUTHOR_IDENT'])), config: this.config, configured, blockers, confirmations };
  }
  async guard(clean = false, working = false) {
    const state = await this.snapshot();
    if (state.blockers.length) throw new Error(state.blockers.join('\n'));
    if (clean && state.files.length) throw new Error('Commit your changes before creating, switching, or updating a branch.');
    if (working && [this.config.production, this.config.development].includes(state.branch)) throw new Error('Start a feature, fix, release, or hotfix branch first. Integration branches are protected.');
    return state;
  }
  async validateBranch(name: string) { if (!name || name.startsWith('-')) throw new Error('Enter a valid branch name.'); await git(this.cwd, ['check-ref-format', '--branch', name]); }
  async fetch() { await git(this.cwd, ['fetch', '--prune', 'origin'], 120000); }
  async syncBase(base: string) {
    await this.validateBranch(base); await this.guard(true);
    const remote = await optional(this.cwd, ['remote', 'get-url', 'origin']);
    if (!remote) {
      if (!(await optional(this.cwd, ['rev-parse', '--verify', `refs/heads/${base}`]))) throw new Error(`The local starting branch ${base} is missing. Check your workflow settings.`);
      await git(this.cwd, ['switch', base]);
      return;
    }
    await this.fetch();
    const remoteRef = `refs/remotes/origin/${base}`;
    if (!(await optional(this.cwd, ['rev-parse', '--verify', remoteRef]))) throw new Error(`Publish ${base} to origin first so the starting point can be synchronized.`);
    const localRef = `refs/heads/${base}`;
    if (await optional(this.cwd, ['rev-parse', '--verify', localRef])) {
      const [ahead] = (await git(this.cwd, ['rev-list', '--left-right', '--count', `${localRef}...${remoteRef}`])).trim().split(/\s+/).map(Number);
      if (ahead) throw new Error(`${base} has local commits or has diverged. Synchronize it outside the app before starting work.`);
      await git(this.cwd, ['switch', base]); await git(this.cwd, ['merge', '--ff-only', remoteRef]);
    } else await git(this.cwd, ['switch', '--track', '-c', base, `origin/${base}`]);
  }
  async create(kind: BranchKind, name: string) {
    if (!['feature', 'fix', 'release', 'hotfix'].includes(kind)) throw new Error('Choose a branch type.');
    const branch = `${kind}/${name.trim()}`; await this.validateBranch(branch);
    if (await optional(this.cwd, ['rev-parse', '--verify', `refs/heads/${branch}`])) throw new Error('That branch already exists. Switch to it instead.');
    await this.syncBase(flow(kind, this.config).base);
    if (await optional(this.cwd, ['rev-parse', '--verify', `refs/remotes/origin/${branch}`])) throw new Error('That branch already exists on origin. Choose another name.');
    await git(this.cwd, ['switch', '-c', branch]);
  }
  async configure(config: FlowConfig, createDevelop: boolean) {
    await this.validateBranch(config.production); await this.validateBranch(config.development);
    if (config.production === config.development) throw new Error('Production and development must be different branches.');
    await this.guard();
    if (!(await optional(this.cwd, ['rev-parse', '--verify', `refs/heads/${config.production}`]))) throw new Error('The production branch must exist locally.');
    if (!(await optional(this.cwd, ['rev-parse', '--verify', `refs/heads/${config.development}`]))) {
      if (!createDevelop) throw new Error('Enable creation of the missing development branch.');
      const remote = await optional(this.cwd, ['remote', 'get-url', 'origin']);
      if (!remote) {
        // Creating a ref does not touch HEAD, the index, or working files.
        await git(this.cwd, ['branch', config.development, config.production]);
      } else {
        await this.guard(true);
        await this.fetch();
        if (await optional(this.cwd, ['rev-parse', '--verify', `refs/remotes/origin/${config.development}`])) await git(this.cwd, ['branch', '--track', config.development, `origin/${config.development}`]);
        else { await this.syncBase(config.production); await git(this.cwd, ['branch', config.development, config.production]); }
        await git(this.cwd, ['push', '-u', 'origin', `refs/heads/${config.development}:refs/heads/${config.development}`], 120000);
      }
    }
    this.config = config;
  }
  async switch(branch: string) { const s = await this.guard(true); if (!s.branches.includes(branch)) throw new Error('Select an existing branch.'); await git(this.cwd, ['switch', branch]); }
  async pull() { const s = await this.guard(true); if (!s.upstream) throw new Error('This branch has no upstream. Push it first.'); await git(this.cwd, ['pull', '--ff-only', '--no-rebase'], 120000); }
  async push() { const s = await this.guard(false, true); await git(this.cwd, ['push', '-u', 'origin', `refs/heads/${s.branch}:refs/heads/${s.branch}`], 120000); }
  async commit(paths: string[], message: string, head: string, fingerprint: string) {
    const s = await this.guard(false, true);
    if (!s.identity) throw new Error('Configure user.name and user.email in Git before committing.');
    if (s.head !== head || JSON.stringify(s.files) !== fingerprint) throw new Error('Repository state changed. Refresh and review the commit again.');
    if (!message.trim() || !paths.length) throw new Error('Select files and enter a commit message.');
    if (new Set(paths).size !== paths.length || paths.some(p => !s.files.some(f => f.path === p))) throw new Error('The file selection is stale. Refresh and try again.');
    // Reset only the index; working files are preserved. The UI explicitly confirms this.
    await git(this.cwd, ['reset', '--mixed', 'HEAD']);
    const selected = s.files.filter(f => paths.includes(f.path)).flatMap(f => f.original ? [f.path, f.original] : [f.path]);
    await git(this.cwd, ['add', '--all', '--', ...selected]);
    await git(this.cwd, ['commit', '-m', message.trim()], 120000);
  }
  async diff(file: string) {
    const entry = (await this.files()).find(f => f.path === file); if (!entry) throw new Error('File is no longer changed. Refresh the repository.');
    if (entry.status === '??') {
      const filename = path.resolve(this.cwd, file); if (!filename.startsWith(this.cwd + path.sep)) throw new Error('Invalid file path.');
      const stat = await lstat(filename); if (stat.isSymbolicLink()) return 'Symbolic link. Preview unavailable.';
      if (stat.size > 200000) return 'This file is too large to preview. Open it in your editor.';
      const content = await readFile(filename); return content.includes(0) ? 'Binary file. Preview unavailable.' : content.toString('utf8');
    }
    try { const result = await git(this.cwd, ['diff', '--no-ext-diff', '--no-textconv', '--no-color', 'HEAD', '--', file, ...(entry.original ? [entry.original] : [])]); return result.length > 200000 ? result.slice(0, 200000) + '\n… Preview truncated. Open your editor for the full diff.' : result || 'No textual changes.'; }
    catch (error) { if (String(error).includes('maxBuffer')) return 'Diff too large. Open it in your editor.'; throw error; }
  }
}
export function hostingUrl(remote: string, branch?: string, target?: string): string {
  const normalized = remote.replace(/^git@([^:]+):/, 'https://$1/').replace(/^ssh:\/\/git@/, 'https://').replace(/\.git$/, '');
  let url: URL; try { url = new URL(normalized); } catch { throw new Error('This remote has no supported website URL. Open your hosting website manually.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Open your hosting website manually for this remote.');
  if (branch && target) {
    const source = encodeURIComponent(branch), dest = encodeURIComponent(target);
    if (url.hostname === 'github.com') return `${url.origin}${url.pathname}/compare/${dest}...${source}?expand=1`;
    if (url.hostname === 'gitlab.com') return `${url.origin}${url.pathname}/-/merge_requests/new?merge_request[source_branch]=${source}&merge_request[target_branch]=${dest}`;
    if (url.hostname === 'bitbucket.org') return `${url.origin}${url.pathname}/pull-requests/new?source=${source}&dest=${dest}`;
  }
  return url.origin + url.pathname;
}
