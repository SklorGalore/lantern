// Regenerate desktop icons from the editable SVG with npm run icons.
const { app, BrowserWindow, nativeImage } = require('electron');
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const temporary = mkdtempSync(path.join(require('node:os').tmpdir(), 'lantern-icons-'));
app.setPath('userData', temporary);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await window.loadURL('about:blank');
    const svg = readFileSync(path.join(__dirname, '../src/renderer/public/lantern.svg'));
    const url = await window.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(svg.toString('base64'))};
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1024;
      canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024);
      return canvas.toDataURL('image/png');
    })()`);
    const image = nativeImage.createFromDataURL(url);
    const write = (extension, data) => writeFileSync(path.join(__dirname, '../assets/lantern.' + extension), data);
    const png = size => image.resize({ width: size, height: size, quality: 'best' }).toPNG();
    write('png', image.toPNG());
    const sizes = [16, 32, 48, 64, 128, 256];
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    const images = sizes.map((size, i) => {
      const data = png(size), entry = 6 + i * 16;
      header[entry] = header[entry + 1] = size % 256;
      header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(data.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
      offset += data.length; return data;
    });
    write('ico', Buffer.concat([header, ...images]));
    const chunks = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]].map(([type, size]) => {
      const data = png(size), header = Buffer.alloc(8);
      header.write(type); header.writeUInt32BE(data.length + 8, 4);
      return Buffer.concat([header, data]);
    });
    const icns = Buffer.alloc(8); icns.write('icns');
    icns.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
    write('icns', Buffer.concat([icns, ...chunks]));
    console.log('Generated Lantern PNG, ICO, and ICNS icons.');
  } finally { window.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => rmSync(temporary, { recursive: true, force: true }));
