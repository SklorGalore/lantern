export type BranchKind = 'feature' | 'fix' | 'release' | 'hotfix';
export const kinds: BranchKind[] = ['feature', 'fix', 'release', 'hotfix'];
export const descriptions: Record<BranchKind, string> = { feature: 'Build something new', fix: 'Fix upcoming work', release: 'Prepare the next release', hotfix: 'Repair production quickly' };
export interface FlowConfig { production: string; development: string }
export const defaults: FlowConfig = { production: 'main', development: 'develop' };
export function flow(kind: BranchKind, config: FlowConfig) { return { base: kind === 'hotfix' ? config.production : config.development, targets: kind === 'release' || kind === 'hotfix' ? [config.production, config.development] : [config.development] }; }
export function branchKind(branch: string): BranchKind | undefined { return kinds.find(k => branch.startsWith(k + '/')); }
export interface ChangedFile { path: string; original?: string; status: string; staged: boolean }
export interface RepoState { path: string; name: string; branch: string; branches: string[]; files: ChangedFile[]; config: FlowConfig; configured: boolean; remote: string; upstream: string; ahead: number; behind: number; branchCommits: number; head: string; identity: boolean; blockers: string[]; confirmations: string[] }
export interface HomeState { recent: string[]; git: boolean }
export type Request =
 | { action: 'home' | 'open' | 'clone'; path?: string; url?: string }
 | { action: 'refresh' | 'fetch' | 'pull' | 'push' | 'folder' | 'terminal' | 'editor' }
 | { action: 'configure'; config: FlowConfig; createDevelop: boolean }
 | { action: 'create'; kind: BranchKind; name: string }
 | { action: 'switch'; branch: string }
 | { action: 'diff'; path: string }
 | { action: 'commit'; paths: string[]; message: string; head: string; fingerprint: string }
 | { action: 'website'; target?: string }
 | { action: 'confirm'; target: string; checked: boolean };
export interface Reply { home?: HomeState; repo?: RepoState; diff?: string; cancelled?: boolean; error?: string }
export interface Bridge { request(request: Request): Promise<Reply> }
