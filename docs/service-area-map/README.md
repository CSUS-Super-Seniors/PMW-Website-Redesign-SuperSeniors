# Service Area draft map (SSPMW-243)

The local static asset is `client/public/images/service-area-map.svg`. **Draft artwork: design/client review remains required.** Its viewport is regional orientation, not service coverage. No boundary or mileage radius is drawn.

## Geographic source and reuse

- Source: U.S. Census Bureau TIGERweb GeoServices REST API.
- Carmichael: `TIGERweb/tigerWMS_ACS2025/MapServer/30`, California place feature, its `INTPTLAT`/`INTPTLON` internal point. This is a statistical representative point, not a business/street location.
- Rivers: `TIGERweb/Hydro/MapServer/1` (Areal Hydrography, January 1, 2026), American and Sacramento river polygons intersecting the regional envelope. Their names are query filters, **not visible map labels**. These are water shapes, not service boundaries.
- Exact retrieval URLs, retrieval timestamp, returned coordinates and attributes are recorded in `source.json`. Hydro and ACS2025 intentionally have different documented vintages.
- Census source attribution: **Source: U.S. Census Bureau**. This also appears visibly below the map.
- Census-produced U.S. government geographic data is public domain under 17 USC 105, permitting copying, modification and redistribution. This is not a commercial basemap screenshot. TIGER/Line is a Census Bureau trademark; attribution does not imply endorsement.
- Official documentation: <https://www.census.gov/about/policies/copyright.html>, <https://www2.census.gov/geo/pdfs/maps-data/data/tiger/tgrshp2023/TGRSHP2023_TechDoc.pdf>, <https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Hydro/MapServer>.

## Reproduction

From the repository root, explicitly run `node scripts/generate-service-area-map.mjs` with Node 22 and network access. It downloads public geographic data only, installs nothing and accesses no database. It is not part of runtime or the build. Review source changes before replacing the asset.

The script uses a local equirectangular projection scaled by Carmichael's latitude, clips to the SVG viewport, and requests a 0.0001-degree geometry simplification tolerance. The marker derives from Census coordinates. No service polygon or other invented geography is added. Only Carmichael is named on the map. The self-contained SVG makes no external resource requests.

## Acceptance review still required

Inspect both 1440px desktop and 390px phone layouts: marker location, river geometry, geographic extent, typography, crop, corner radius, contrast, and attribution. Confirm no other location label, street address, boundary, or radius appears. Confirm alt text describes the actual river-linework image. The supplied Figma frames define a placeholder slot, not approved artwork, so generated artwork is not client-approved merely because tests pass.
