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
} catch (err) {
  console.error('❌ Error copying assets:', err);
  process.exit(1);
}
