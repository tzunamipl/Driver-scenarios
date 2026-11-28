// Writes rally/scenario-index.json: per stage / rally the numbers the game's picker filters on (README: Summary index).
// Lengths, the days count and the stage estimate follow the game's own rules (rallySession.js); the difficulty bars
// are not stored: the game derives them from `stageKm`.
// Usage: node scripts/build-scenario-index.mjs [mode folder, default rally]

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const folder = process.argv[2] ?? 'rally';

const ROAD_FACTOR = 1.3; // a stage with no saved length: road metres per straight-line metre between its points
const SAMPLE_M = 10;
const DAY_END = new Set(['parcFerme']); // point types that end a rally day (the game's `endsDay`)
// stage surface -> filter surface; paved / gravel / snow classes
const CLASS_OF = { tarmac: 'tarmac', cobblestone: 'tarmac', gravel: 'gravel', mud: 'gravel', snow: 'snow', ice: 'snow' };
const SNOW_SHARE = 0.5; // snow & ice at least this much = snow
const PURE_SHARE = 0.9; // tarmac / gravel at least this much = that, else mixed

const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const pathOf = (kind, key) => {
  const [country, region, id] = key.split('/');
  return id ? `${folder}/${country}/${region}/${kind}/${id}.json` : `${folder}/${kind}/${country}.json`;
};

function straightM(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

/** Metres per surface class along a saved route (OSM paved / unpaved per leg, surface sections over it). */
function surfaceMetres(route, sections) {
  const out = { tarmac: 0, gravel: 0, snow: 0 };
  if (!route?.points?.length || !route.length) return out;
  const legs = [];
  let along = 0;
  for (let i = 0; i < route.points.length - 1; i++) {
    const [lat, lon, unpaved] = route.points[i];
    const [lat2, lon2] = route.points[i + 1];
    const m = straightM({ lat, lon }, { lat: lat2, lon: lon2 });
    legs.push({ from: along, to: along + m, unpaved });
    along += m;
  }
  const scale = route.length / (along || 1); // simplified vertices: stretch to the measured length
  let leg = 0;
  for (let d = SAMPLE_M / 2; d < route.length; d += SAMPLE_M) {
    while (leg < legs.length - 1 && legs[leg].to * scale < d) leg++;
    let cls = legs[leg]?.unpaved ? 'gravel' : 'tarmac';
    for (const s of sections) if (d >= s.from && d <= s.to && CLASS_OF[s.surface]) cls = CLASS_OF[s.surface];
    out[cls] += SAMPLE_M;
  }
  return out;
}

function surfaceOf(metres) {
  const total = metres.tarmac + metres.gravel + metres.snow;
  if (!total) return null;
  if (metres.snow / total >= SNOW_SHARE) return 'snow';
  if (metres.tarmac / total >= PURE_SHARE) return 'tarmac';
  if (metres.gravel / total >= PURE_SHARE) return 'gravel';
  return 'mixed';
}

function stageVersion(file, reverse) {
  const measured = (reverse ? file.reversePacenotes : file.pacenotes)?.length ?? (reverse ? file.reverseRoute : file.route)?.length;
  const driven = file.points.filter((p) => 'lat' in p);
  const first = driven.findIndex((p) => p.type === 'start');
  const last = driven.findIndex((p) => p.type === 'finish');
  const line = first >= 0 && last > first ? driven.slice(first, last + 1) : driven;
  const estimated = line.slice(1).reduce((sum, p, i) => sum + straightM(line[i], p), 0) * ROAD_FACTOR;
  const metres = measured || estimated;
  const route = reverse ? file.reverseRoute ?? file.route : file.route;
  return { metres, surfaces: surfaceMetres(route, file.surfaces ?? []) };
}

const listing = read(`${folder}/index.json`);
const stageFiles = new Map();
const stages = [];
for (const key of listing.stages ?? []) {
  let file;
  try {
    file = read(pathOf('stages', key));
  } catch (err) {
    console.warn(`skip stage ${key}: ${err.message}`);
    continue;
  }
  stageFiles.set(key, file);
  for (const reverse of file.noReverse ? [false] : [false, true]) {
    const { metres, surfaces } = stageVersion(file, reverse);
    stages.push({ key, ...(reverse ? { reverse: true } : {}), name: file.name ?? key, km: Math.round(metres / 10) / 100, surface: surfaceOf(surfaces) });
  }
}

const rallies = [];
for (const key of listing.rallies ?? []) {
  let file;
  try {
    file = read(pathOf('rallies', key));
  } catch (err) {
    console.warn(`skip rally ${key}: ${err.message}`);
    continue;
  }
  let metres = 0;
  const surfaces = { tarmac: 0, gravel: 0, snow: 0 };
  file.itinerary.forEach((item) => {
    if (!item.stage) return;
    const stage = stageFiles.get(item.stage);
    if (!stage) return;
    const version = stageVersion(stage, !!item.reverse);
    metres += version.metres;
    for (const cls in surfaces) surfaces[cls] += version.surfaces[cls];
  });
  const last = file.itinerary.length - 1;
  const days = 1 + file.itinerary.filter((item, i) => !item.stage && DAY_END.has(item.type) && i < last).length;
  rallies.push({ key, name: file.name ?? key, stageKm: Math.round(metres / 10) / 100, surface: surfaceOf(surfaces), days });
}

const byKey = (a, b) => a.key.localeCompare(b.key) || (a.reverse ? 1 : 0) - (b.reverse ? 1 : 0);
const out = { format: 1, stages: stages.sort(byKey), rallies: rallies.sort(byKey) };
writeFileSync(join(root, `${folder}/scenario-index.json`), `${JSON.stringify(out, null, 1)}\n`);
console.log(`${folder}/scenario-index.json: ${stages.length} stages, ${rallies.length} rallies`);
