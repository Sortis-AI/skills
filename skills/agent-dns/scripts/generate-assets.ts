/**
 * Generate OG image (1200x630) and favicon (32x32 + 16x16 ICO) from SVG.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "..", "..", "public");

// ── OG Image (1200x630) ──

const ogSvg = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a"/>
      <stop offset="100%" style="stop-color:#1a1a2e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#4a9eff"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Grid pattern -->
  <g opacity="0.06" stroke="#fff" stroke-width="1">
    ${Array.from({ length: 20 }, (_, i) => `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="630"/>`).join("")}
    ${Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${i * 60}" x2="1200" y2="${i * 60}"/>`).join("")}
  </g>

  <!-- DNS icon - simplified globe with lines -->
  <g transform="translate(100, 215)" opacity="0.15">
    <circle cx="100" cy="100" r="90" fill="none" stroke="#4a9eff" stroke-width="2"/>
    <ellipse cx="100" cy="100" rx="45" ry="90" fill="none" stroke="#4a9eff" stroke-width="1.5"/>
    <line x1="10" y1="60" x2="190" y2="60" stroke="#4a9eff" stroke-width="1"/>
    <line x1="10" y1="140" x2="190" y2="140" stroke="#4a9eff" stroke-width="1"/>
    <line x1="100" y1="10" x2="100" y2="190" stroke="#4a9eff" stroke-width="1"/>
  </g>

  <!-- Title -->
  <text x="100" y="295" font-family="ui-monospace, 'SF Mono', 'Cascadia Code', monospace" font-size="72" font-weight="700" fill="#fff">agent-dns</text>

  <!-- Accent bar -->
  <rect x="100" y="320" width="200" height="4" rx="2" fill="url(#accent)"/>

  <!-- Tagline -->
  <text x="100" y="370" font-family="ui-monospace, 'SF Mono', 'Cascadia Code', monospace" font-size="24" fill="#888">DNS for autonomous agents</text>

  <!-- Details -->
  <text x="100" y="420" font-family="ui-monospace, 'SF Mono', 'Cascadia Code', monospace" font-size="18" fill="#555">Pay-per-request via USDC on Solana</text>

  <!-- Code snippet decoration -->
  <g transform="translate(100, 470)" opacity="0.4">
    <text font-family="ui-monospace, monospace" font-size="14" fill="#4a9eff">$</text>
    <text x="20" font-family="ui-monospace, monospace" font-size="14" fill="#888">aw GET https://agent-dns.org/domains/check/example.com</text>
  </g>
  <g transform="translate(100, 495)" opacity="0.3">
    <text font-family="ui-monospace, monospace" font-size="14" fill="#4a9eff">$</text>
    <text x="20" font-family="ui-monospace, monospace" font-size="14" fill="#888">aw POST https://agent-dns.org/zones '{"name":"example.com"}'</text>
  </g>

  <!-- URL -->
  <text x="100" y="580" font-family="ui-monospace, monospace" font-size="20" fill="#666">agent-dns.org</text>

  <!-- HTTP 402 badge -->
  <g transform="translate(1000, 50)">
    <rect width="140" height="36" rx="6" fill="none" stroke="#4a9eff" stroke-width="1.5" opacity="0.4"/>
    <text x="70" y="24" font-family="ui-monospace, monospace" font-size="16" fill="#4a9eff" text-anchor="middle" opacity="0.6">HTTP 402</text>
  </g>
</svg>`;

// ── Favicon SVG (scalable) ──

const faviconSvg = `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a"/>
      <stop offset="100%" style="stop-color:#1a1a2e"/>
    </linearGradient>
    <linearGradient id="faccent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4a9eff"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" rx="96" fill="url(#fbg)"/>

  <!-- DNS globe icon -->
  <g transform="translate(256, 240)">
    <circle cx="0" cy="0" r="140" fill="none" stroke="url(#faccent)" stroke-width="12" opacity="0.8"/>
    <ellipse cx="0" cy="0" rx="70" ry="140" fill="none" stroke="url(#faccent)" stroke-width="8" opacity="0.6"/>
    <line x1="-130" y1="-50" x2="130" y2="-50" stroke="url(#faccent)" stroke-width="6" opacity="0.4"/>
    <line x1="-130" y1="50" x2="130" y2="50" stroke="url(#faccent)" stroke-width="6" opacity="0.4"/>
  </g>

  <!-- Small "a" in center -->
  <text x="256" y="270" font-family="ui-monospace, 'SF Mono', monospace" font-size="140" font-weight="700" fill="#fff" text-anchor="middle">a</text>
</svg>`;

async function main() {
  // OG image → PNG
  const ogPng = await sharp(Buffer.from(ogSvg)).png().toBuffer();
  writeFileSync(join(OUT, "og.png"), ogPng);
  console.log(`og.png: ${ogPng.length} bytes`);

  // Favicon → 32x32 PNG (browsers accept PNG favicons served as image/x-icon)
  const fav32 = await sharp(Buffer.from(faviconSvg))
    .resize(32, 32)
    .png()
    .toBuffer();

  const fav16 = await sharp(Buffer.from(faviconSvg))
    .resize(16, 16)
    .png()
    .toBuffer();

  // Write a simple ICO file (single 32x32 PNG image)
  // ICO header: 2 bytes reserved, 2 bytes type (1=ICO), 2 bytes count
  // Directory entry: 16 bytes per image
  // Then PNG data
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);     // reserved
  icoHeader.writeUInt16LE(1, 2);     // type: ICO
  icoHeader.writeUInt16LE(1, 4);     // image count

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(32, 0);        // width
  dirEntry.writeUInt8(32, 1);        // height
  dirEntry.writeUInt8(0, 2);         // color palette
  dirEntry.writeUInt8(0, 3);         // reserved
  dirEntry.writeUInt16LE(1, 4);      // color planes
  dirEntry.writeUInt16LE(32, 6);     // bits per pixel
  dirEntry.writeUInt32LE(fav32.length, 8);  // image size
  dirEntry.writeUInt32LE(22, 12);    // offset (6 header + 16 dir = 22)

  const ico = Buffer.concat([icoHeader, dirEntry, fav32]);
  writeFileSync(join(OUT, "favicon.ico"), ico);
  console.log(`favicon.ico: ${ico.length} bytes`);

  // Also write the SVG favicon for modern browsers
  writeFileSync(join(OUT, "favicon.svg"), faviconSvg.trim());
  console.log("favicon.svg written");
}

main().catch(console.error);
