export interface ContactSheetTile {
  readonly label: string;
  readonly svgInner: string;
  readonly viewBox: string;
  readonly width: number;
  readonly height: number;
}

export interface ContactSheetHeader {
  readonly worldId: string;
  readonly status: string;
  readonly usesQuarantinedAssets: boolean;
  readonly registryHash: string;
  readonly canonicalHash: string | null;
}

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function composeContactSheet(tiles: readonly ContactSheetTile[], header: ContactSheetHeader): string {
  const cellW = Math.max(1, ...tiles.map((tile) => tile.width));
  const cellH = Math.max(1, ...tiles.map((tile) => tile.height)) + 34;
  const columns = 2;
  const rows = Math.ceil(tiles.length / columns);
  const width = cellW * columns;
  const height = 92 + cellH * rows;
  const banner = `DEVELOPMENT FIXTURE — NOT RELEASE CONTENT · ${header.worldId} · ${header.status}${header.usesQuarantinedAssets ? ' · quarantined assets' : ''}`;
  const body = tiles.map((tile, index) => {
    const x = (index % columns) * cellW;
    const y = 92 + Math.floor(index / columns) * cellH;
    return `<g transform="translate(${x},${y})"><svg viewBox="${escape(tile.viewBox)}" width="${tile.width}" height="${tile.height}">${tile.svgInner}</svg><text x="8" y="${tile.height + 22}" font-family="sans-serif" font-size="14">${escape(tile.label)}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="92" fill="#f4ead2"/><text x="18" y="28" font-family="sans-serif" font-size="18" font-weight="700">${escape(banner)}</text><text x="18" y="54" font-family="monospace" font-size="12">registry ${escape(header.registryHash)}</text><text x="18" y="72" font-family="monospace" font-size="12">world ${escape(header.canonicalHash ?? 'null')}</text>${body}</svg>`;
}
