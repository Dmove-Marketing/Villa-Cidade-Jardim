import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const targetCssFiles = [
  'https://villacidadejd.com.br/wp-content/uploads/elementor/css/post-10.css',
  'https://villacidadejd.com.br/wp-content/uploads/elementor/css/post-40.css'
];

const destDir = '_html-originais';
const destImagesDir = path.join('src', 'assets', 'images');

// Certificar que os diretórios existam
[destDir, destImagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function downloadFileAuto(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const lib = fileUrl.startsWith('https') ? https : http;
    lib.get(fileUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFileAuto(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);
      fileStream.on('finish', () => { fileStream.close(); resolve(); });
      fileStream.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Starting fetch of additional Elementor CSS files...');
  
  let combinedCss = '';
  
  for (const cssUrl of targetCssFiles) {
    const filename = path.basename(cssUrl);
    const tempPath = path.join(destDir, `temp-${filename}`);
    console.log(`Downloading ${cssUrl}...`);
    try {
      await downloadFileAuto(cssUrl, tempPath);
      const content = fs.readFileSync(tempPath, 'utf8');
      combinedCss += `\n/* === Original: ${filename} === */\n` + content + '\n';
      fs.unlinkSync(tempPath);
      console.log(`Successfully read and cached ${filename}`);
    } catch (err) {
      console.error(`Error downloading ${cssUrl}:`, err.message);
    }
  }
  
  // Append or save combined to _html-originais/bio.css
  const bioCssPath = path.join(destDir, 'bio.css');
  let existingContent = '';
  if (fs.existsSync(bioCssPath)) {
    existingContent = fs.readFileSync(bioCssPath, 'utf8');
  }
  
  fs.writeFileSync(bioCssPath, existingContent + '\n' + combinedCss, 'utf8');
  console.log(`Saved combined CSS to ${bioCssPath}`);
  
  // Parse background images from CSS
  const bgRegex = /url\(['"]?(https?:\/\/[^'")]+\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^'")]*)?)['"]?\)/gi;
  const urls = new Set();
  let match;
  while ((match = bgRegex.exec(combinedCss)) !== null) {
    urls.add(match[1]);
  }
  
  console.log(`Found ${urls.size} background asset URLs in the CSS:`, Array.from(urls));
  
  for (const fileUrl of urls) {
    const cleanUrl = fileUrl.split('?')[0];
    const filename = path.basename(cleanUrl);
    const destPath = path.join(destImagesDir, filename);
    
    if (fs.existsSync(destPath)) {
      console.log(`Asset ${filename} already exists, skipping...`);
      continue;
    }
    
    console.log(`Downloading asset: ${filename} from ${fileUrl}...`);
    try {
      await downloadFileAuto(fileUrl, destPath);
      console.log(`Successfully downloaded ${filename}`);
    } catch (err) {
      console.error(`Failed to download ${filename}:`, err.message);
    }
  }
  
  console.log('Finished downloading CSS and background assets.');
}

main();
