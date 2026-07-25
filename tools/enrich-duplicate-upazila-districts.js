#!/usr/bin/env node
/*
 * Add district (`d`) only to the 14 GeoJSON upazila name groups that appear more
 * than once in bd-upazilas.geo.json. Uses nearest district centroid among known
 * candidates for each group.
 *
 * Usage: node tools/enrich-duplicate-upazila-districts.js
 */
const fs = require('fs');
const path = require('path');

const geoPath = path.resolve(__dirname, '..', 'public', 'assets', 'data', 'bd-upazilas.geo.json');

/** Normalized upazila name -> candidate district names (English, as in CommonCode). */
const DUPLICATE_CANDIDATES = {
    companiganj: ['Noakhali', 'Sylhet'],
    daulatpur: ['Kushtia', 'Manikganj', 'Netrokona'],
    durgapur: ['Rajshahi', 'Netrokona'],
    kachua: ['Chandpur', 'Bagerhat', 'Chattogram'],
    kaliganj: ['Satkhira', 'Jhenaidah', 'Gazipur', 'Lalmonirhat'],
    kawkhali: ['Rangamati', 'Pirojpur'],
    kotwali: ['Dhaka', 'Chattogram', 'Feni'],
    lohagara: ['Chattogram', 'Narail'],
    mirpur: ['Kushtia', 'Dhaka'],
    mohammadpur: ['Magura', 'Dhaka'],
    nawabganj: ['Dhaka', 'Dinajpur'],
    pirganj: ['Thakurgaon', 'Rangpur'],
    shibganj: ['Bogura', 'Chapainawabganj'],
    sreepur: ['Magura', 'Gazipur']
};

/** Approximate [lng, lat] district centroids for disambiguation. */
const DISTRICT_CENTROID = {
    Noakhali: [91.1, 22.8],
    Sylhet: [91.9, 24.9],
    Kushtia: [89.0, 23.9],
    Manikganj: [90.0, 23.8],
    Netrokona: [90.7, 24.9],
    Rajshahi: [88.6, 24.4],
    Chandpur: [90.7, 23.2],
    Bagerhat: [89.8, 22.7],
    Chattogram: [91.8, 22.4],
    Satkhira: [89.1, 22.7],
    Jhenaidah: [89.2, 23.5],
    Gazipur: [90.4, 24.0],
    Lalmonirhat: [89.4, 25.9],
    Rangamati: [92.2, 22.6],
    Pirojpur: [90.0, 22.6],
    Dhaka: [90.4, 23.8],
    Feni: [91.4, 23.0],
    Narail: [89.5, 23.2],
    Magura: [89.4, 23.5],
    Dinajpur: [88.8, 25.6],
    Thakurgaon: [88.5, 26.0],
    Rangpur: [89.2, 25.7],
    Bogura: [89.4, 24.8],
    Chapainawabganj: [88.3, 24.6]
};

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function centroidOf(geometry) {
    const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
    let lng = 0;
    let lat = 0;
    let n = 0;
    for (const ring of rings) {
        for (const [lo, la] of ring) {
            lng += lo;
            lat += la;
            n++;
        }
    }
    return n ? [lng / n, lat / n] : [0, 0];
}

function dist2(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return dx * dx + dy * dy;
}

function pickDistrict(centroid, candidates) {
    let best = null;
    let bestD = Infinity;
    for (const d of candidates) {
        const anchor = DISTRICT_CENTROID[d];
        if (!anchor) continue;
        const d2 = dist2(centroid, anchor);
        if (d2 < bestD) {
            bestD = d2;
            best = d;
        }
    }
    return best;
}

function main() {
    const geo = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
    const duplicateKeys = new Set(Object.keys(DUPLICATE_CANDIDATES));

    // Strip any existing `d` from non-duplicate or all features first.
    for (const f of geo.features) {
        if (f.properties?.d) delete f.properties.d;
    }

    let enriched = 0;
    const log = [];

    for (const f of geo.features) {
        const name = (f.properties?.n ?? '').trim();
        const key = norm(name);
        if (!duplicateKeys.has(key)) continue;

        const candidates = DUPLICATE_CANDIDATES[key];
        const centroid = centroidOf(f.geometry);
        const district = pickDistrict(centroid, candidates);
        if (!district) {
            console.warn(`WARN: no district for duplicate "${name}"`);
            continue;
        }

        f.properties = f.properties || {};
        f.properties.d = district;
        enriched++;
        log.push(`${name} → ${district} [${centroid[0].toFixed(2)}, ${centroid[1].toFixed(2)}]`);
    }

    fs.writeFileSync(geoPath, JSON.stringify(geo));
    console.log(`Tagged ${enriched} polygons across ${duplicateKeys.size} duplicate name groups:`);
    log.forEach((l) => console.log('  ' + l));
}

main();
