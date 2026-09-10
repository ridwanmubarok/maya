const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/public');
const destDir = path.join(__dirname, '../dist/public');

try {
  if (fs.existsSync(srcDir)) {
    // Copy src/public to dist/public recursively
    fs.cpSync(srcDir, destDir, { recursive: true });
    console.log('✅ Static assets (src/public) successfully copied to dist/public');
  } else {
    console.warn('⚠️ Warning: src/public directory does not exist!');
  }

  const assetsSrc = path.join(__dirname, '../assets');
  const assetsDest = path.join(__dirname, '../dist/assets');
  if (fs.existsSync(assetsSrc)) {
    fs.cpSync(assetsSrc, assetsDest, { recursive: true });
    console.log('✅ Image assets (assets/) successfully copied to dist/assets');
  }
} catch (err) {
  console.error('❌ Error copying assets:', err);
  process.exit(1);
}
