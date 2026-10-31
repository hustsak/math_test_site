/**
 * The anti-screenshot watermark as ONE repeating background image (an SVG tile) instead of
 * hundreds of rotated text elements, which is much lighter for cheap phones to scroll.
 * Each tile holds the student's name, date and time so a leaked picture can be traced back.
 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** CSS `background-image` value: a tile with the text written at -24 degrees. */
export function watermarkBackground(text: string): string {
  const safe = escapeXml(String(text ?? '').trim().slice(0, 48));
  const fontSize = 14;
  const angle = 24 * (Math.PI / 180);
  // Generous width estimate so the rotated text never touches the tile edge and gets clipped
  const textWidth = Math.max(100, safe.length * 9.5);
  const boxW = textWidth * Math.cos(angle) + fontSize * Math.sin(angle);
  const boxH = textWidth * Math.sin(angle) + fontSize * Math.cos(angle);
  const w = Math.round(boxW + 80);
  const h = Math.round(boxH + 80);
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<text x="${cx}" y="${cy}" transform="rotate(-24 ${cx} ${cy})" text-anchor="middle" ` +
    `dominant-baseline="middle" font-family="Khmer OS Siemreap, Khmer UI, Leelawadee UI, Noto Sans Khmer, sans-serif" ` +
    `font-size="${fontSize}" fill="#6b7280">${safe}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
