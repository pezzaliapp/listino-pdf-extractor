// Generate PWA icons (PNG) from an inline SVG using sharp.

import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b3d91"/>
  <text x="256" y="300" font-family="Arial, sans-serif" font-size="200" font-weight="700"
        fill="#ffffff" text-anchor="middle">LP</text>
  <rect x="370" y="120" width="60" height="80" rx="6" fill="#ffffff" opacity="0.9"/>
  <line x1="380" y1="140" x2="420" y2="140" stroke="#0b3d91" stroke-width="4"/>
  <line x1="380" y1="160" x2="420" y2="160" stroke="#0b3d91" stroke-width="4"/>
  <line x1="380" y1="180" x2="410" y2="180" stroke="#0b3d91" stroke-width="4"/>
</svg>`;

const buf = Buffer.from(svg);
await sharp(buf).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(buf).resize(512, 512).png().toFile('public/icon-512.png');
await sharp(buf).resize(512, 512).png().toFile('public/icon-512-maskable.png');
await sharp(buf).resize(180, 180).png().toFile('public/apple-touch-icon.png');
console.log('✓ icons generated');
