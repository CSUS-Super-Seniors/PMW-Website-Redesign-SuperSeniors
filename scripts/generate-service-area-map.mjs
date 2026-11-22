// Developer-only source retrieval; never imported by the website or build.
// Run manually with Node 22: node scripts/generate-service-area-map.mjs
import { mkdir, writeFile } from 'node:fs/promises';

const base = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
async function query(layer, parameters) {
  const url = `${base}/${layer}/query?${new URLSearchParams({
    f: 'json',
    outSR: '4326',
    returnGeometry: 'true',
    ...parameters,
  })}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Census returned ${response.status}`);
  const data = await response.json();
  if (data.error || data.exceededTransferLimit || !data.features?.length) {
    throw new Error(`Incomplete Census data: ${JSON.stringify(data.error ?? data)}`);
  }
  return { url, data };
}

const place = await query('tigerWMS_ACS2025/MapServer/30', {
  where: "STATE='06' AND BASENAME='Carmichael'",
  outFields: 'GEOID,BASENAME,INTPTLAT,INTPTLON',
});
const water = await query('Hydro/MapServer/1', {
  where: "BASENAME IN ('American','Sacramento')",
  outFields: 'BASENAME',
  geometry: '-121.60,38.48,-121.05,38.82',
  geometryType: 'esriGeometryEnvelope',
  inSR: '4326',
  spatialRel: 'esriSpatialRelIntersects',
  maxAllowableOffset: '0.0001',
});
const point = place.data.features[0].attributes;
const lon = Number(point.INTPTLON);
const lat = Number(point.INTPTLAT);
if (!Number.isFinite(lon) || !Number.isFinite(lat))
  throw new Error('Missing official internal point');
// Local equirectangular projection with equal geographic scale on both axes.
const width = 1040,
  height = 760;
const scale = width / (0.55 * Math.cos((lat * Math.PI) / 180));
const project = ([x, y]) => [
  (x + 121.325) * Math.cos((lat * Math.PI) / 180) * scale + width / 2,
  (38.65 - y) * scale + height / 2,
];
const paths = water.data.features.flatMap(({ geometry }) => geometry.rings ?? []);
if (!paths.length) throw new Error('Missing river geometry');
const d = paths
  .map(
    (path) =>
      path
        .map(
          (p, i) =>
            `${i ? 'L' : 'M'}${project(p)
              .map((n) => n.toFixed(2))
              .join(',')}`,
        )
        .join(' ') + ' Z',
  )
  .join(' ');
const [x, y] = project([lon, lat]);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <title>Carmichael regional orientation map</title>
  <desc>Unlabeled river linework and the Census internal point for Carmichael. No service boundary or mileage radius. Source: U.S. Census Bureau TIGERweb; public-domain U.S. government geographic data. Draft artwork for review.</desc>
  <rect width="1040" height="760" fill="#f3e9d8"/>
  <svg viewBox="0 0 1040 760" width="1040" height="760" overflow="hidden">
    <path d="${d}" fill="#a3978a" fill-rule="evenodd"/>
    <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="11" fill="#7a4a21"/>
    <text x="${(x + 22).toFixed(2)}" y="${(y + 9).toFixed(2)}" font-family="sans-serif" font-size="34" fill="#2a1b11">Carmichael</text>
  </svg>
</svg>
`;
await mkdir(new URL('../client/public/images/', import.meta.url), { recursive: true });
await mkdir(new URL('../docs/service-area-map/', import.meta.url), { recursive: true });
await writeFile(new URL('../client/public/images/service-area-map.svg', import.meta.url), svg);
await writeFile(
  new URL('../docs/service-area-map/source.json', import.meta.url),
  JSON.stringify(
    {
      retrievedAt: new Date().toISOString(),
      place,
      water,
      description:
        'Carmichael internal point: ACS 2025, January 1 2025 vintage. Hydrography: TIGERweb Hydro snapshot at retrieval time. View extent is composition only, not coverage.',
    },
    null,
    2,
  ),
);
console.log(`Generated map from ${paths.length} Census river paths; Carmichael ${lat}, ${lon}.`);
