import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';
import {
    StatisticsService,
    type ManpowerSummaryRow,
    type ManpowerSummaryResponse
} from '@/services/statistics.service';
import { UserMenuService } from '@/services/user-menu.service';

const SLICE_COLORS = [
    '#4f46e5','#06b6d4','#10b981','#f59e0b','#ef4444',
    '#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1',
    '#22c55e','#0ea5e9','#a855f7','#fb923c','#84cc16'
];

/**
 * Inline Chart.js plugin — draws percentage labels at the midpoint of each
 * pie arc. Because it paints directly onto the canvas, the text is baked into
 * the bitmap that `toDataURL()` captures for the print popup.
 */
const PIE_PERCENTAGE_PLUGIN = {
    id: 'piePercentageLabels',
    afterDatasetsDraw(chart: any): void {
        const { ctx } = chart;
        chart.data.datasets.forEach((_: any, di: number) => {
            const meta = chart.getDatasetMeta(di);
            if (meta.hidden) return;

            const data: number[] = chart.data.datasets[di].data;
            const total = data.reduce((s: number, v: number) => s + (v || 0), 0);
            if (total === 0) return;

            meta.data.forEach((arc: any, i: number) => {
                const value = data[i] ?? 0;
                const pct = (value / total) * 100;
                if (pct < 3) return; // skip tiny slices — label won't fit

                const midAngle = (arc.startAngle + arc.endAngle) / 2;
                // Place label at ~65 % of the outer radius from the centre
                const r = arc.outerRadius * 0.65;
                const x = arc.x + Math.cos(midAngle) * r;
                const y = arc.y + Math.sin(midAngle) * r;

                ctx.save();
                ctx.font = 'bold 11px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Subtle dark shadow so text is readable on any colour
                ctx.shadowColor = 'rgba(0,0,0,0.55)';
                ctx.shadowBlur = 3;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`${pct.toFixed(1)}%`, x, y);
                ctx.restore();
            });
        });
    }
};

@Component({
    selector: 'app-manpower-chart',
    standalone: true,
    imports: [CommonModule, ChartModule],
    templateUrl: './manpower-chart.html',
    styleUrl: './manpower-chart.scss'
})
export class ManpowerChartComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    loading = false;
    rows: ManpowerSummaryRow[] = [];

    showAuth = true;
    showHeld = true;

    /** Names of the RAB Units the user is restricted to. null/empty = full access. */
    accessibleRabUnitNames: string[] | null = null;

    authData: any = null;
    heldData: any = null;
    chartOptions: any = null;

    /** Passed to [plugins] on every p-chart so percentages are drawn on canvas. */
    readonly chartPlugins = [PIE_PERCENTAGE_PLUGIN];

    constructor(private _router: Router, private _userMenuService: UserMenuService, private statisticsService: StatisticsService) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.buildOptions();
        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.statisticsService.getManpowerSummary().subscribe({
            next: (res: ManpowerSummaryResponse) => {
                this.rows   = res.rows ?? [];
                this.accessibleRabUnitNames = res.accessibleRabUnitNames ?? null;
                this.buildCharts();
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    buildOptions(): void {
        this.chartOptions = {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 16,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx: any) => {
                            const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
                            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
                            return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                        }
                    }
                }
            }
        };
    }

    buildCharts(): void {
        const labels = this.rows.map(r => r.orgName);
        const colors = this.rows.map((_, i) => SLICE_COLORS[i % SLICE_COLORS.length]);
        const hover  = colors.map(c => c + 'cc');

        this.authData = {
            labels,
            datasets: [{
                data: this.rows.map(r => r.auth),
                backgroundColor: colors,
                hoverBackgroundColor: hover
            }]
        };

        this.heldData = {
            labels,
            datasets: [{
                data: this.rows.map(r => r.held),
                backgroundColor: colors,
                hoverBackgroundColor: hover
            }]
        };
    }

    toggleAuth(): void { this.showAuth = !this.showAuth; }
    toggleHeld(): void { this.showHeld = !this.showHeld; }

    /** Comma-separated unit-scope line shown under the report title; null when unrestricted. */
    get scopeLine(): string | null {
        const names = this.accessibleRabUnitNames;
        if (!names || names.length === 0) return null;
        return names.join(', ');
    }

    printCharts(): void {
        const canvases = document.querySelectorAll<HTMLCanvasElement>('app-manpower-chart canvas');
        const images: { title: string; src: string }[] = [];

        let idx = 0;
        if (this.showAuth) {
            const c = canvases[idx++];
            if (c) images.push({ title: 'Authorized Strength', src: c.toDataURL('image/png') });
        }
        if (this.showHeld) {
            const c = canvases[idx++];
            if (c) images.push({ title: 'Held Strength', src: c.toDataURL('image/png') });
        }

        const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

        const imgBlocks = images.map(img => `
            <div class="chart-block">
                <h2>${img.title}</h2>
                <img src="${img.src}" />
            </div>
        `).join('');

        const scope = this.scopeLine;
        const escScope = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Manpower Chart Report</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Times New Roman', serif; background: #fff; color: #1e293b; padding: 20mm; }
        h1 { font-size: 16pt; font-weight: 700; text-align: center; margin-bottom: 4px; }
        .scope { font-size: 11pt; font-weight: 600; text-align: center; margin: 2px 0 6px 0; color: #1e3a5f; }
        .date { font-size: 11pt; text-align: center; color: #555; margin-bottom: 24px; }
        .charts-row { display: flex; gap: 32px; justify-content: center; flex-wrap: wrap; }
        .chart-block { flex: 1 1 300px; max-width: 420px; text-align: center; }
        .chart-block h2 { font-size: 12pt; font-weight: 600; margin-bottom: 10px; }
        .chart-block img { width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 6px; }
        @page { size: A4 landscape; margin: 15mm; }
    </style>
</head>
<body>
    <h1>OVERALL MANPOWER SUMMARY</h1>
    ${scope ? `<div class="scope">${escScope(scope)}</div>` : ''}
    <div class="date">${dateStr}</div>
    <div class="charts-row">${imgBlocks}</div>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=900,height=650');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); win.close(); }, 800);
    }
}
