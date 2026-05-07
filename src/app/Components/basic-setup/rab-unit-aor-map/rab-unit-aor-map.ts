import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';

import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';

import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { CommonCode } from '../shared/models/common-code';
import { RABUnitAORModel } from '../shared/models/rab-unit-aor';

type LngLat = [number, number];
type Ring = LngLat[];
type GeoFeature = {
    type: 'Feature';
    properties: { n: string; bn?: string };
    geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
};
type GeoJSON = { type: 'FeatureCollection'; features: GeoFeature[] };

type RenderedFeature = {
    name: string;
    nameBn?: string;
    upazilaId?: number;
    unitId?: number;
    unitName?: string;
    color: string;
    pathD: string;
};

type LegendEntry = { unitId: number; name: string; color: string; upazilaCount: number; sortOrder: number };

const DEFAULT_LAND = '#b8c49c';
const DEFAULT_LAND_ALT = '#a9b68d';

@Component({
    selector: 'app-rab-unit-aor-map',
    standalone: true,
    imports: [CommonModule, ProgressSpinnerModule, MessageModule],
    templateUrl: './rab-unit-aor-map.html',
    styleUrls: ['./rab-unit-aor-map.scss']
})
export class RabUnitAorMap implements OnInit {
    private master = inject(MasterBasicSetupService);
    private http = inject(HttpClient);

    @ViewChild('mapHost', { static: false }) mapHost?: ElementRef<HTMLDivElement>;

    title = 'RAB Unit AOR — Upazila Map';
    loading = true;
    errorMessage = '';

    rendered: RenderedFeature[] = [];
    legend: LegendEntry[] = [];
    unmatchedNames: string[] = [];

    viewBox = '0 0 800 1000';
    tooltip = { visible: false, x: 0, y: 0, name: '', nameBn: '', unitName: '', battalionHQ: '' };

    private aorByUpazila = new Map<number, { unitId: number; unitName: string; color: string; battalionHQ: string }>();

    ngOnInit(): void {
        this.loadAll();
    }

    private loadAll(): void {
        this.loading = true;
        this.errorMessage = '';

        forkJoin({
            geo: this.http.get<GeoJSON>('assets/data/bd-upazilas.geo.json'),
            upazilas: this.master.getAllByType('Upazila'),
            units: this.master.getAllByType('RabUnit'),
            aors: this.master.getAllRABUnitAOR()
        }).subscribe({
            next: ({ geo, upazilas, units, aors }) => {
                this.buildAorIndex(upazilas, units, aors);
                this.renderMap(geo);
                this.buildLegend(units, aors);
                this.loading = false;
            },
            error: (err) => {
                this.errorMessage =
                    err?.error?.message ||
                    err?.message ||
                    'Failed to load map data. If bd-upazilas.geo.json is missing, run: node tools/extract-upazila-geojson.js <path-to-html>';
                this.loading = false;
            }
        });
    }

    private buildAorIndex(upazilas: CommonCode[], units: CommonCode[], aors: RABUnitAORModel[]): void {
        this._upazilaNameToId.clear();
        for (const u of upazilas ?? []) {
            const key = this.normalizeName(u.codeValueEN ?? '');
            if (key) this._upazilaNameToId.set(key, u.codeId);
        }

        const unitById = new Map<number, { name: string; color: string }>();
        for (const u of units ?? []) {
            unitById.set(u.codeId, { name: u.codeValueEN ?? '', color: '' });
        }

        this.aorByUpazila.clear();
        for (const aor of aors ?? []) {
            const rabUnitId = (aor as any).rabUnitId ?? (aor as any).RABUnitId;
            const upazilaIds = (aor as any).upazilaIds ?? (aor as any).UpazilaIds;
            const color = ((aor as any).identificationColor ?? (aor as any).IdentificationColor ?? '').toString().trim();
            const battalionHQ = ((aor as any).locationOfBattalionHQ ?? (aor as any).LocationOfBattalionHQ ?? '').toString();
            if (!rabUnitId || !upazilaIds) continue;

            const ids = String(upazilaIds)
                .split(',')
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => !isNaN(n));

            const unitMeta = unitById.get(rabUnitId);
            const unitName = unitMeta?.name ?? `Unit ${rabUnitId}`;
            const resolvedColor = color || this.fallbackColor(rabUnitId);

            for (const upazilaId of ids) {
                // First-write wins; warn on overlap so admins can fix the AOR data.
                if (this.aorByUpazila.has(upazilaId)) continue;
                this.aorByUpazila.set(upazilaId, { unitId: rabUnitId, unitName, color: resolvedColor, battalionHQ });
            }
        }
    }

    private renderMap(geo: GeoJSON): void {
        const w = 800;
        const h = 1000;
        const pad = 20;
        const projection = this.fitMercator(geo, w, h, pad);

        const upazilaIdByName = this.upazilaIdMap();

        const rendered: RenderedFeature[] = [];
        const unmatched: string[] = [];

        geo.features.forEach((f, i) => {
            const name = (f.properties?.n ?? '').trim();
            const key = this.normalizeName(name);
            const upazilaId = upazilaIdByName.get(key);
            const aor = upazilaId != null ? this.aorByUpazila.get(upazilaId) : undefined;

            if (!upazilaId) unmatched.push(name);

            const fill = aor?.color ?? (i % 3 === 0 ? DEFAULT_LAND_ALT : DEFAULT_LAND);
            rendered.push({
                name,
                nameBn: f.properties?.bn,
                upazilaId,
                unitId: aor?.unitId,
                unitName: aor?.unitName,
                color: fill,
                pathD: this.geometryToPath(f.geometry, projection)
            });
        });

        this.rendered = rendered;
        this.unmatchedNames = unmatched;
        this.viewBox = `0 0 ${w} ${h}`;

        if (unmatched.length) {
            console.warn(
                `[RabUnitAorMap] ${unmatched.length} GeoJSON upazila names did not match the backend Upazila list.`,
                unmatched.slice(0, 20)
            );
        }
    }

    private buildLegend(units: CommonCode[], aors: RABUnitAORModel[]): void {
        const counts = new Map<number, number>();
        for (const a of aors ?? []) {
            const id = (a as any).rabUnitId ?? (a as any).RABUnitId;
            const ids = String((a as any).upazilaIds ?? (a as any).UpazilaIds ?? '')
                .split(',')
                .filter((s) => s.trim());
            counts.set(id, (counts.get(id) ?? 0) + ids.length);
        }
        const colorByUnit = new Map<number, string>();
        for (const entry of this.aorByUpazila.values()) {
            if (!colorByUnit.has(entry.unitId)) colorByUnit.set(entry.unitId, entry.color);
        }
        this.legend = (units ?? [])
            .filter((u) => counts.has(u.codeId))
            .map((u) => ({
                unitId: u.codeId,
                name: u.codeValueEN ?? `Unit ${u.codeId}`,
                color: colorByUnit.get(u.codeId) ?? this.fallbackColor(u.codeId),
                upazilaCount: counts.get(u.codeId) ?? 0,
                sortOrder: u.sortOrder ?? Number.MAX_SAFE_INTEGER
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }

    private upazilaIdMap(): Map<string, number> {
        return this._upazilaNameToId;
    }
    private _upazilaNameToId = new Map<string, number>();

    private fitMercator(geo: GeoJSON, w: number, h: number, pad: number) {
        const project = (lng: number, lat: number): [number, number] => {
            const x = (lng * Math.PI) / 180;
            const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2));
            return [x, y];
        };

        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        const visit = (ring: Ring) => {
            for (const [lng, lat] of ring) {
                const [x, y] = project(lng, lat);
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        };
        for (const f of geo.features) {
            if (f.geometry.type === 'Polygon') {
                f.geometry.coordinates.forEach(visit);
            } else {
                f.geometry.coordinates.forEach((poly) => poly.forEach(visit));
            }
        }

        const dx = maxX - minX;
        const dy = maxY - minY;
        const scale = Math.min((w - 2 * pad) / dx, (h - 2 * pad) / dy);
        const offsetX = pad + ((w - 2 * pad) - dx * scale) / 2 - minX * scale;
        // Mercator y grows north; SVG y grows south, so flip.
        const offsetY = pad + ((h - 2 * pad) - dy * scale) / 2 + maxY * scale;

        return (lng: number, lat: number): [number, number] => {
            const [px, py] = project(lng, lat);
            return [px * scale + offsetX, -py * scale + offsetY];
        };
    }

    private geometryToPath(
        geom: GeoFeature['geometry'],
        projection: (lng: number, lat: number) => [number, number]
    ): string {
        const ringToPath = (ring: Ring): string => {
            let s = '';
            for (let i = 0; i < ring.length; i++) {
                const [x, y] = projection(ring[i][0], ring[i][1]);
                s += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
            }
            return s + 'Z';
        };
        if (geom.type === 'Polygon') {
            return geom.coordinates.map(ringToPath).join(' ');
        }
        return geom.coordinates.map((poly) => poly.map(ringToPath).join(' ')).join(' ');
    }

    private normalizeName(s: string): string {
        return (s || '')
            .toLowerCase()
            .replace(/['’`]/g, '')
            .replace(/[\s\-_.]+/g, ' ')
            .replace(/\bsadar\b/g, 'sadar')
            .trim();
    }

    private fallbackColor(seed: number): string {
        // Deterministic muted palette so unconfigured units still get distinct colors.
        const palette = ['#8c3a1f', '#d69878', '#eeb166', '#9cb7bc', '#6b7854', '#7a5a3a', '#a87cb0', '#5e8b7e'];
        return palette[Math.abs(seed) % palette.length];
    }

    onFeatureMove(event: MouseEvent, f: RenderedFeature): void {
        const host = this.mapHost?.nativeElement;
        if (!host) return;
        const rect = host.getBoundingClientRect();
        this.tooltip = {
            visible: true,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            name: f.name,
            nameBn: f.nameBn ?? '',
            unitName: f.unitName ?? 'Not assigned',
            battalionHQ: f.unitId != null ? this.aorByUpazila.get(f.upazilaId ?? -1)?.battalionHQ ?? '' : ''
        };
    }

    onFeatureLeave(): void {
        this.tooltip.visible = false;
    }

}
