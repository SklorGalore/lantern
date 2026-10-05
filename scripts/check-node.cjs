const major = Number(process.versions.node.split('.')[0]);
if (major < 22 || major > 24) {
  console.error('Packaging requires Node.js 22 or 24. Use Node 22 (see .nvmrc), then run this command again. Node 26 can exit Forge before producing an artifact.');
  process.exit(1);
}
