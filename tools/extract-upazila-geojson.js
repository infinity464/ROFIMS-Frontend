#!/usr/bin/env node
/*
 * One-time extraction: pull the GeoJSON FeatureCollection out of the upazila atlas
 * HTML file and write it to public/assets/data/bd-upazilas.geo.json (the path the
 * dev server serves from, per angular.json's `public` assets entry).
 *
 * Usage:
 *   node tools/extract-upazila-geojson.js "path/to/bangladesh_upazila_map.html"
 *
 * If no path is given, defaults to ./bangladesh_upazila_map.html in CWD.
 */
const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2] || path.resolve(process.cwd(), 'bangladesh_upazila_map.html');
const outputPath = path.resolve(__dirname, '..', 'public', 'assets', 'data', 'bd-upazilas.geo.json');

if (!fs.existsSync(inputPath)) {
    console.error(`Input HTML not found: ${inputPath}`);
    console.error('Pass the HTML path as the first argument.');
    process.exit(1);
}

const html = fs.readFileSync(inputPath, 'utf8');
const match = html.match(/<script id="geo" type="application\/json">([\s\S]*?)<\/script>/);
if (!match) {
    console.error('Could not find <script id="geo" type="application/json"> ... </script> block.');
    process.exit(1);
}

let json;
try {
    json = JSON.parse(match[1].trim());
} catch (err) {
    console.error('Extracted block is not valid JSON:', err.message);
    process.exit(1);
}

if (json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
    console.error('Extracted JSON is not a FeatureCollection.');
    process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(json));
console.log(`Wrote ${json.features.length} features to ${outputPath}`);
