import { Component, ElementRef, Input, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';

import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';

import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { CommonCode } from '../shared/models/common-code';
import { RABUnitAORModel } from '../shared/models/rab-unit-aor';
import { DUPLICATE_UPAZILA_NAMES } from './upazila-duplicate-names';

type LngLat = [number, number];
type Ring = LngLat[];
type GeoFeature = {
    type: 'Feature';
    /** `d` = district English name; present on the 14 duplicate upazila name groups in GeoJSON. */
    properties: { n: string; bn?: string; d?: string };
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

const UNASSIGNED_FILL = '#e8d9b0';

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

    /** When embedded (e.g. dashboard) hide the card chrome / legend so only the atlas shows. */
    @Input() hideTitle = false;
    @Input() hideLegend = false;
    @Input() bare = false;
    /** Override the map host height (px). When set, the default 4:5 aspect-ratio is ignored. */
    @Input() heightPx?: number;

    title = 'RAB Unit AOR — Upazila Map';
    loading = true;
    errorMessage = '';

    rendered: RenderedFeature[] = [];
    legend: LegendEntry[] = [];
    unmatchedNames: string[] = [];

    viewBox = '0 0 800 1000';
    tooltip = { visible: false, x: 0, y: 0, transform: '', name: '', nameBn: '', unitName: '', battalionHQ: '' };

    private aorByUpazila = new Map<number, { unitId: number; unitName: string; color: string; battalionHQ: string }>();

    // ── Zoom / pan state (in viewBox units) ──────────────────────────────
    private vbW = 800;
    private vbH = 1000;
    zoom = 1;
    panX = 0;
    panY = 0;
    isPanning = false;
    private panOrigin = { x: 0, y: 0, panX: 0, panY: 0 };
    private readonly MIN_ZOOM = 1;
    private readonly MAX_ZOOM = 8;

    ngOnInit(): void {
        this.loadAll();
    }

    private loadAll(): void {
        this.loading = true;
        this.errorMessage = '';

        forkJoin({
            geo: this.http.get<GeoJSON>('assets/data/bd-upazilas.geo.json'),
            upazilas: this.master.getAllByType('Upazila'),
            districts: this.master.getAllByType('District'),
            units: this.master.getAllByType('RabUnit'),
            aors: this.master.getAllRABUnitAOR()
        }).subscribe({
            next: ({ geo, upazilas, districts, units, aors }) => {
                this.buildAorIndex(upazilas, districts, units, aors);
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

    private buildAorIndex(
        upazilas: CommonCode[],
        districts: CommonCode[],
        units: CommonCode[],
        aors: RABUnitAORModel[]
    ): void {
        const districtNameById = new Map<number, string>();
        for (const d of districts ?? []) {
            districtNameById.set(d.codeId, d.codeValueEN ?? '');
        }

        const nameCounts = new Map<string, number>();
        for (const u of upazilas ?? []) {
            const key = this.normalizeName(u.codeValueEN ?? '');
            if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
        }

        this._upazilaNameToId.clear();
        this._districtUpazilaToId.clear();
        for (const u of upazilas ?? []) {
            const upazilaKey = this.normalizeName(u.codeValueEN ?? '');
            if (!upazilaKey) continue;

            const districtName = districtNameById.get(u.parentCodeId ?? -1) ?? '';
            const districtKey = this.normalizeName(districtName);
            if (districtKey) {
                this._districtUpazilaToId.set(`${districtKey}|${upazilaKey}`, u.codeId);
            }

            // Name-only lookup for upazilas whose name is unique in the backend.
            if ((nameCounts.get(upazilaKey) ?? 0) === 1) {
                this._upazilaNameToId.set(upazilaKey, u.codeId);
            }
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

        const rendered: RenderedFeature[] = [];
        const unmatched: string[] = [];

        geo.features.forEach((f) => {
            const name = (f.properties?.n ?? '').trim();
            const key = this.normalizeName(name);
            const district = (f.properties?.d ?? '').trim();
            const upazilaId = this.resolveUpazilaId(key, district);
            const aor = upazilaId != null ? this.aorByUpazila.get(upazilaId) : undefined;

            if (!upazilaId) unmatched.push(district ? `${name} (${district})` : name);

            const fill = aor?.color ?? UNASSIGNED_FILL;
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

  private resolveUpazilaId(upazilaKey: string, districtEN: string): number | undefined {
        if (DUPLICATE_UPAZILA_NAMES.has(upazilaKey)) {
            const districtKey = this.normalizeName(districtEN);
            if (!districtKey) return undefined;
            return this._districtUpazilaToId.get(`${districtKey}|${upazilaKey}`);
        }
        return this._upazilaNameToId.get(upazilaKey);
    }

    private upazilaIdMap(): Map<string, number> {
        return this._upazilaNameToId;
    }
    private _upazilaNameToId = new Map<string, number>();
    /** Composite key: normalize(district)|normalize(upazila) → codeId */
    private _districtUpazilaToId = new Map<string, number>();

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

    /**
     * Collapse a name to a compact, lowercase, non-alphanumeric-stripped key so spacing variants
     * like "Alikadam" vs "Ali Kadam" or "Cox's Bazar Sadar" vs "Coxs-Bazar Sadar" all match.
     */
    private normalizeName(s: string): string {
        return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    private fallbackColor(seed: number): string {
        // Deterministic muted palette so unconfigured units still get distinct colors.
        const palette = ['#8c3a1f', '#d69878', '#eeb166', '#9cb7bc', '#6b7854', '#7a5a3a', '#a87cb0', '#5e8b7e'];
        return palette[Math.abs(seed) % palette.length];
    }

    // ── Zoom / pan ───────────────────────────────────────────────────────
    zoomIn(): void { this.applyZoom(this.zoom * 1.4); }
    zoomOut(): void { this.applyZoom(this.zoom / 1.4); }

    resetView(): void {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
    }

    /** Zoom toward the viewBox centre, keeping that point fixed. */
    private applyZoom(next: number, anchorX = this.vbW / 2, anchorY = this.vbH / 2): void {
        const z = Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, next));
        // content point currently under the anchor
        const cx = (anchorX - this.panX) / this.zoom;
        const cy = (anchorY - this.panY) / this.zoom;
        this.zoom = z;
        this.panX = anchorX - cx * z;
        this.panY = anchorY - cy * z;
        this.clampPan();
    }

    private clampPan(): void {
        const minX = this.vbW * (1 - this.zoom);
        const minY = this.vbH * (1 - this.zoom);
        this.panX = Math.min(0, Math.max(minX, this.panX));
        this.panY = Math.min(0, Math.max(minY, this.panY));
    }

    onWheel(event: WheelEvent): void {
        event.preventDefault();
        const host = this.mapHost?.nativeElement;
        if (!host) return;
        const rect = host.getBoundingClientRect();
        // Anchor zoom at the cursor position (converted to viewBox units).
        const ax = ((event.clientX - rect.left) / rect.width) * this.vbW;
        const ay = ((event.clientY - rect.top) / rect.height) * this.vbH;
        this.applyZoom(event.deltaY < 0 ? this.zoom * 1.15 : this.zoom / 1.15, ax, ay);
    }

    onPanStart(event: MouseEvent): void {
        if (this.zoom <= 1) return; // nothing to pan when fully zoomed out
        this.isPanning = true;
        this.panOrigin = { x: event.clientX, y: event.clientY, panX: this.panX, panY: this.panY };
        this.tooltip.visible = false;
    }

    onPanMove(event: MouseEvent): void {
        if (!this.isPanning) return;
        const host = this.mapHost?.nativeElement;
        if (!host) return;
        const rect = host.getBoundingClientRect();
        const dx = ((event.clientX - this.panOrigin.x) / rect.width) * this.vbW;
        const dy = ((event.clientY - this.panOrigin.y) / rect.height) * this.vbH;
        this.panX = this.panOrigin.panX + dx;
        this.panY = this.panOrigin.panY + dy;
        this.clampPan();
    }

    onPanEnd(): void {
        this.isPanning = false;
    }

    onHostLeave(): void {
        this.isPanning = false;
        this.onFeatureLeave();
    }

    onFeatureMove(event: MouseEvent, f: RenderedFeature): void {
        if (this.isPanning) return;
        const host = this.mapHost?.nativeElement;
        if (!host) return;
        const rect = host.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const nameBn = f.nameBn ?? '';
        const unitName = f.unitName ?? 'Not assigned';
        const battalionHQ = f.unitId != null ? this.aorByUpazila.get(f.upazilaId ?? -1)?.battalionHQ ?? '' : '';

        // The tip lives inside the overflow:hidden host, so near the edges the default
        // "centred, above the cursor" placement gets clipped. Flip its anchor toward the
        // interior, deciding from the tip's estimated size so tall (4-line) tips near the
        // top edge — e.g. northern upazilas like Patgram — flip below instead of clipping.
        // Placement itself uses -50%/-100%/-100% offsets which are pixel-exact regardless
        // of the estimate; the estimate only picks which side to flip to.
        let estH = 13 + 17 + 22; // padding + name row + unit row (incl. mt-1)
        if (nameBn) estH += 15;
        if (battalionHQ) estH += 18;
        const estChars = Math.max(f.name.length, nameBn.length, ('Unit: ' + unitName).length, ('HQ: ' + battalionHQ).length);
        const estW = Math.min(rect.width - 8, estChars * 8 + 24);

        const tx = x - estW / 2 < 4 ? '0' : x + estW / 2 > rect.width - 4 ? '-100%' : '-50%';
        const ty = y - estH - 14 < 0 ? '14px' : 'calc(-100% - 10px)';

        this.tooltip = {
            visible: true,
            x,
            y,
            transform: `translate(${tx}, ${ty})`,
            name: f.name,
            nameBn,
            unitName,
            battalionHQ
        };
    }

    onFeatureLeave(): void {
        this.tooltip.visible = false;
    }

}
