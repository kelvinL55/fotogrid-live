const fs = require('fs');
const path = require('path');

// 1x1 transparent/blue PNG base64 string
const base64Png = 'iVBORw0KGgoAAAANSU5ACCgAAAAEAAAAAQMAAAB/N/aMAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5wgDDAgB1u17wAAAAB1SURBVBjTY2CgB/h/kGNgYGBgYWBgYGBgYGBgAAAD2wD/p1zSgQAAAABJRU5ErkJggg==';
const buffer = Buffer.from(base64Png, 'base64');

fs.writeFileSync(path.join(__dirname, '../public/icon-192.png'), buffer);
fs.writeFileSync(path.join(__dirname, '../public/icon-512.png'), buffer);
console.log('PWA icons created successfully');
