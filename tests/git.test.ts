import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { git, Repository, parseStatus, hostingUrl } from '../src/main/git';
import { defaults, flow, kinds } from '../src/shared';
async function fixture(t: { after(fn: () => Promise<void>): void }) {
 const root = await mkdtemp(path.join(os.tmpdir(), 'lantern-test-')); t.after(() => rm(root,{recursive:true,force:true}));
 const remote = path.join(root,'origin.git'), local = path.join(root,'working tree'); await mkdir(remote); await mkdir(local);
 await git(remote,['init','--bare','--initial-branch=main']); await git(local,['init','--initial-branch=main']);
 await git(local,['config','user.name','Lantern Test']); await git(local,['config','user.email','test@example.invalid']);
 await writeFile(path.join(local,'hello.txt'),'hello\n'); await git(local,['add','.']); await git(local,['commit','-m','Initial']); await git(local,['remote','add','origin',remote]); await git(local,['push','-u','origin','main']);
 const repo = new Repository(local,{...defaults}); await repo.configure(defaults,true); return {repo,root,remote,local};
}
test('status handles spaces, renames, staged and untracked files', () => {
 assert.deepEqual(parseStatus('R  new name\0old name\0?? extra.txt\0 M changed.txt\0'),[{path:'new name',original:'old name',status:'R ',staged:true},{path:'extra.txt',status:'??',staged:false},{path:'changed.txt',status:' M',staged:false}]);
});
test('branch models and hosting links encode names', () => {
 for(const kind of kinds) { assert.equal(flow(kind,defaults).base,kind==='hotfix'?'main':'develop'); assert.deepEqual(flow(kind,defaults).targets,['release','hotfix'].includes(kind)?['main','develop']:['develop']); }
 assert.equal(hostingUrl('git@github.com:team/repo.git','feature/a b','develop'),'https://github.com/team/repo/compare/develop...feature%2Fa%20b?expand=1');
 assert.throws(()=>hostingUrl('file:///tmp/repo')); assert.throws(()=>hostingUrl('https://user:password@github.com/a/b.git'));
});
test('setup and every branch kind use their correct base',async t=>{
 const {repo,local}=await fixture(t); await git(local,['switch','develop']); await writeFile(path.join(local,'upcoming.txt'),'upcoming'); await git(local,['add','.']); await git(local,['commit','-m','Upcoming']); await git(local,['push']);
 for(const kind of kinds){await repo.create(kind,'example'); const s=await repo.snapshot();assert.equal(s.branch,`${kind}/example`); assert.equal(s.head,(await git(local,['rev-parse',flow(kind,defaults).base])).trim());}
 await assert.rejects(repo.create('feature','example'),/already exists/); await assert.rejects(repo.create('feature','bad name'),/not a valid branch name/);
});
test('commit selection preserves excluded working files and replaces old staging',async t=>{
 const {repo,local}=await fixture(t);await repo.create('feature','commit');await writeFile(path.join(local,'hello.txt'),'changed\n');await writeFile(path.join(local,'new file.txt'),'new\n');await git(local,['add','hello.txt']);
 const s=await repo.snapshot();await repo.commit(['new file.txt'],'Add file',s.head,JSON.stringify(s.files));
 assert.equal((await git(local,['show','HEAD:hello.txt'])),'hello\n'); assert.equal(await readFile(path.join(local,'hello.txt'),'utf8'),'changed\n');assert.equal((await repo.files())[0].staged,false);
 await repo.push();const pushed=await repo.snapshot();assert.equal(pushed.upstream,'origin/feature/commit');assert.equal(pushed.ahead,0);
 await assert.rejects(repo.switch('main'),/Commit your changes/); await assert.rejects(repo.pull(),/Commit your changes/);
});
test('protects integration branches, detached HEAD, stale selection and conflicts',async t=>{
 const {repo,local}=await fixture(t);await assert.rejects(repo.push(),/protected/);await repo.create('fix','safety'); await writeFile(path.join(local,'hello.txt'),'new\n');const s=await repo.snapshot();await assert.rejects(repo.commit(['hello.txt'],'save','stale',JSON.stringify(s.files)),/state changed/);
 await repo.commit(['hello.txt'],'save',s.head,JSON.stringify(s.files));await git(local,['checkout','--detach']);assert.ok((await repo.snapshot()).blockers.some(b=>b.includes('Detached')));await assert.rejects(repo.push(),/Detached/);
 await git(local,['switch','main']);await git(local,['switch','-c','feature/conflict']);await writeFile(path.join(local,'hello.txt'),'other\n');await git(local,['add','.']);await git(local,['commit','-m','Other']);await assert.rejects(git(local,['merge','fix/safety']));assert.ok((await repo.snapshot()).blockers.some(b=>b.includes('Conflicting')));await assert.rejects(repo.create('fix','blocked'),/Conflicting/);
});
test('fetch, pull and synchronized starting points reject divergence',async t=>{
 const {repo,root,remote,local}=await fixture(t); const other=path.join(root,'other');await git(root,['clone',remote,other]);await git(other,['config','user.name','Other']);await git(other,['config','user.email','other@example.invalid']);await git(other,['switch','develop']);await writeFile(path.join(other,'remote.txt'),'remote');await git(other,['add','.']);await git(other,['commit','-m','Remote update']);await git(other,['push']);
 await repo.create('release','1.0.0'); assert.equal(await readFile(path.join(local,'remote.txt'),'utf8'),'remote');await repo.switch('develop'); await repo.pull();
 await writeFile(path.join(local,'local.txt'),'local');await git(local,['add','.']);await git(local,['commit','-m','Unpublished']);await assert.rejects(repo.create('feature','blocked'),/local commits or has diverged/);
});
test('diff handles binary files and missing remote',async t=>{const {repo,local}=await fixture(t);await repo.create('feature','diff');await writeFile(path.join(local,'binary.bin'),Buffer.from([1,0,2]));assert.match(await repo.diff('binary.bin'),/Binary/);await assert.rejects(repo.diff('../outside'),/no longer changed/);await git(local,['remote','remove','origin']);await assert.rejects(repo.push());});
test('configuration accepts existing branches with working changes',async t=>{const {repo,local}=await fixture(t);await writeFile(path.join(local,'hello.txt'),'in progress');await repo.configure(defaults,false);assert.equal(await readFile(path.join(local,'hello.txt'),'utf8'),'in progress');await assert.rejects(repo.configure({production:'main',development:'integration'},true),/Commit your changes/);});
test('rejected pushes preserve local history and working files',async t=>{
 const {repo,local,root,remote}=await fixture(t);await repo.create('feature','shared');await repo.push();const other=path.join(root,'contributor');await git(root,['clone',remote,other]);await git(other,['config','user.name','Other']);await git(other,['config','user.email','other@example.invalid']);await git(other,['switch','feature/shared']);await writeFile(path.join(other,'remote.txt'),'remote');await git(other,['add','.']);await git(other,['commit','-m','Remote']);await git(other,['push']);
 await writeFile(path.join(local,'local.txt'),'local');const s=await repo.snapshot();await repo.commit(['local.txt'],'Local',s.head,JSON.stringify(s.files));const before=(await repo.snapshot()).head;await assert.rejects(repo.push(),/rejected/);assert.equal((await repo.snapshot()).head,before);assert.equal(await readFile(path.join(local,'local.txt'),'utf8'),'local');
});
test('missing identity prevents a commit without altering staging',async t=>{const {repo,local}=await fixture(t);await repo.create('fix','identity');await git(local,['config','user.name','']);await git(local,['config','user.email','']);await writeFile(path.join(local,'hello.txt'),'change');await git(local,['add','.']);const s=await repo.snapshot();assert.equal(s.identity,false);await assert.rejects(repo.commit(['hello.txt'],'save',s.head,JSON.stringify(s.files)),/identity|user.name/);assert.equal((await repo.files())[0].staged,true);});
