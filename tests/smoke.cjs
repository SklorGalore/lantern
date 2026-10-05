const { app } = require('electron');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = mkdtempSync(path.join(os.tmpdir(), 'git-sky-smoke-'));
const repo = path.join(root, 'stellar-notes');
mkdirSync(repo); const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
git('init','--initial-branch=main');git('config','user.name','Smoke Test');git('config','user.email','smoke@example.invalid');
writeFileSync(path.join(repo,'README.md'),'# Stellar Notes\n\nA home for your next idea.\n');git('add','.');git('commit','-m','Initial');git('switch','-c','feature/welcome-screen');
writeFileSync(path.join(repo,'README.md'),'# Stellar Notes\n\nA home for your next idea.\n\nWelcome to your workspace.\n');
app.setPath('userData',path.join(root,'settings'));
let ended = false;
function finish(code) { if (ended) return; ended=true; rmSync(root,{recursive:true,force:true}); app.exit(code); }
setTimeout(()=>{console.error('Smoke check timed out');finish(1)},30000).unref();
app.on('browser-window-created',(_event,window)=>{
 window.webContents.on('did-fail-load',(_event,code,description)=>{console.error(code,description);finish(1)});
 window.webContents.once('did-finish-load',async()=>{
  try {
   const initial = await window.webContents.executeJavaScript('document.body.innerText');assert.match(initial,/Good ideas deserve/);
   const opened = await window.webContents.executeJavaScript(`window.gitSky.request({action:'open',path:${JSON.stringify(repo)}})`);assert.equal(opened.repo.branch,'feature/welcome-screen');
   const configured = await window.webContents.executeJavaScript(`window.gitSky.request({action:'configure',config:{production:'main',development:'develop'},createDevelop:true})`);assert.equal(configured.error,undefined);assert.equal(configured.repo.configured,true);assert.ok(configured.repo.branches.includes('develop'));assert.equal(configured.repo.remote,'');assert.equal(configured.repo.branch,'feature/welcome-screen');
   // Re-open through the actual React UI using its native picker replacement in this test window.
   await window.webContents.executeJavaScript(`document.querySelector('.repo-picker').click()`);
  } catch(error) {console.error(error);finish(1)}
 });
});
// Replace only the native dialog in this isolated smoke process.
require('electron').dialog.showOpenDialog = async () => ({ canceled:false,filePaths:[repo] });
app.on('browser-window-created',(_event,window)=>{
 window.webContents.once('did-finish-load',()=>{
  const timer=setInterval(async()=>{try {
   const text=await window.webContents.executeJavaScript('document.body.innerText');
   if(!text.includes('Make something good.')) return;
   clearInterval(timer);assert.match(text,/feature\/welcome-screen/);assert.match(text,/README.md/);
   await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.file button')).find(b=>b.textContent.includes('README.md')).click()`);
   setTimeout(async()=>{try {
    const content=await window.webContents.executeJavaScript('document.body.innerText');assert.match(content,/Welcome to your workspace/);
    mkdirSync(path.join(__dirname,'../out'),{recursive:true});writeFileSync(path.join(__dirname,'../out/smoke.png'),(await window.webContents.capturePage()).toPNG());
    console.log('Electron smoke check passed: preload, welcome screen, repository, workflow configuration, file list, and diff preview.');finish(0);
   }catch(e){console.error(e);finish(1)}},700);
  }catch(e){clearInterval(timer);console.error(e);finish(1)}},200);
 });
});
require('../dist/main/main/main.js');
