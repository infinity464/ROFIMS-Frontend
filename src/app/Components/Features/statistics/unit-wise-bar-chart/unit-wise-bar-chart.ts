import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ChartModule } from 'primeng/chart';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import {
    StatisticsService,
    type MemberTypeOption,
    type MotherUnitOrgOption,
    type UnitBarItem,
    type UnitWiseBarChartResponse,
    type UnitWiseRankOption,
    type UnitWiseTradeOption
} from '@/services/statistics.service';
import { UserMenuService } from '@/services/user-menu.service';

type Lang = 'en' | 'bn';

const BAR_COLORS = [
    '#4f46e5','#06b6d4','#10b981','#f59e0b','#ef4444',
    '#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1',
    '#22c55e','#0ea5e9','#a855f7','#fb923c','#84cc16',
    '#d946ef','#0d9488','#dc2626','#2563eb','#65a30d'
];

@Component({
    selector: 'app-unit-wise-bar-chart',
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule, ChartModule],
    templateUrl: './unit-wise-bar-chart.html',
    styleUrl: './unit-wise-bar-chart.scss'
})
export class UnitWiseBarChartComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;

    orgOptions: MotherUnitOrgOption[] = [];
    selectedOrgId: number | null = null;

    memberTypeOptions: MemberTypeOption[] = [];
    selectedMemberTypeId: number | null = null;

    /** Full rank list from the API (all orgs). UI cascades from selectedOrgId / selectedMemberTypeId. */
    private allRankOptions: UnitWiseRankOption[] = [];
    rankOptions: { label: string; value: number }[] = [];
    selectedRankId: number | null = null;

    tradeOptions: UnitWiseTradeOption[] = [];
    selectedTradeId: number | null = null;

    units: UnitBarItem[] = [];
    total = 0;

    /** Names of the RAB Units the user is restricted to. null/empty = full access. */
    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

    chartData: any = null;
    chartOptions: any = null;

    private static readonly EN_MONTHS = [
        'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
        'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
    ];
    private static readonly BN_MONTHS = [
        'জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
        'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'
    ];

    constructor(private _router: Router, private _userMenuService: UserMenuService, private statisticsService: StatisticsService) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.buildChartOptions();
        this.loadData();
    }

    onOrgChange(): void {
        // Reset rank if it no longer belongs to the chosen org
        if (this.selectedRankId != null && this.selectedOrgId != null) {
            const r = this.allRankOptions.find(x => x.rankId === this.selectedRankId);
            if (r && r.orgId !== this.selectedOrgId) {
                this.selectedRankId = null;
            }
        }
        this.rebuildRankOptions();
        this.loadData();
    }

    onMemberTypeChange(): void {
        // Reset rank if it no longer belongs to the chosen member type
        if (this.selectedRankId != null) {
            const r = this.allRankOptions.find(x => x.rankId === this.selectedRankId);
            if (this.selectedMemberTypeId != null && r && r.memberTypeId !== this.selectedMemberTypeId) {
                this.selectedRankId = null;
            }
        }
        this.rebuildRankOptions();
        this.loadData();
    }

    onRankChange(): void {
        this.loadData();
    }

    onTradeChange(): void {
        this.loadData();
    }

    /**
     * Collapse trade options with the same EN name into a single entry. Trades are scoped per
     * corps in master data, so "N/A" (and any other generic label) shows up once per corps; we
     * only ever show the first occurrence in the dropdown. The backend filter expansion matches
     * every sibling sharing the same name when this representative tradeId is sent.
     */
    private dedupeTradeOptions(list: UnitWiseTradeOption[]): UnitWiseTradeOption[] {
        const seen = new Set<string>();
        const out: UnitWiseTradeOption[] = [];
        for (const t of list) {
            const key = (t.tradeName ?? '').trim().toUpperCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(t);
        }
        return out;
    }

    /** Rebuild the rank dropdown options, narrowed to the selected org and/or member type. */
    private rebuildRankOptions(): void {
        let list = this.allRankOptions;
        if (this.selectedOrgId != null) {
            list = list.filter(r => r.orgId === this.selectedOrgId);
        }
        if (this.selectedMemberTypeId != null) {
            list = list.filter(r => r.memberTypeId === this.selectedMemberTypeId);
        }
        this.rankOptions = list.map(r => ({
            label: this.lang === 'en'
                ? (this.selectedOrgId != null
                    ? r.rankName
                    : `${r.orgName ? r.orgName + ' - ' : ''}${r.rankName}`)
                : (this.selectedOrgId != null
                    ? (r.rankNameBN || r.rankName)
                    : `${r.orgNameBN || r.orgName ? (r.orgNameBN || r.orgName) + ' - ' : ''}${r.rankNameBN || r.rankName}`),
            value: r.rankId
        }));
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.buildChart();
        this.buildChartOptions();
        this.rebuildRankOptions();
    }


    // ── Computed labels ──────────────────────────────────────────────────

    get selectedMemberType(): MemberTypeOption | undefined {
        return this.selectedMemberTypeId != null
            ? this.memberTypeOptions.find(m => m.memberTypeId === this.selectedMemberTypeId)
            : undefined;
    }

    get titleLabel(): string {
        return this.lang === 'en'
            ? 'UNIT WISE SERVING MANPOWER'
            : 'ইউনিট ভিত্তিক কর্মরত জনবল';
    }

    /**
     * Active filter chips rendered below the title (e.g. "Organization: Army").
     * Each chip = one applied dropdown filter, in the same order as the toolbar.
     */
    get filterChips(): { label: string; value: string }[] {
        const chips: { label: string; value: string }[] = [];

        if (this.selectedOrgId != null) {
            const o = this.orgOptions.find(x => x.orgId === this.selectedOrgId);
            if (o) chips.push({
                label: this.lang === 'en' ? 'Organization' : 'বাহিনী',
                value: this.lang === 'en' ? o.orgName : (o.orgNameBN || o.orgName)
            });
        }
        const mt = this.selectedMemberType;
        if (mt) chips.push({
            label: this.lang === 'en' ? 'Member Type' : 'সদস্য প্রকার',
            value: this.lang === 'en' ? mt.memberTypeName : (mt.memberTypeNameBN || mt.memberTypeName)
        });
        if (this.selectedRankId != null) {
            const r = this.allRankOptions.find(x => x.rankId === this.selectedRankId);
            if (r) chips.push({
                label: this.lang === 'en' ? 'Rank' : 'পদবী',
                value: this.lang === 'en' ? r.rankName : (r.rankNameBN || r.rankName)
            });
        }
        if (this.selectedTradeId != null) {
            const t = this.tradeOptions.find(x => x.tradeId === this.selectedTradeId);
            if (t) chips.push({
                label: this.lang === 'en' ? 'Trade' : 'ট্রেড',
                value: this.lang === 'en' ? t.tradeName : (t.tradeNameBN || t.tradeName)
            });
        }
        return chips;
    }

    get dateLine(): string {
        const now = new Date();
        const day = now.getDate(), mon = now.getMonth(), year = now.getFullYear();
        if (this.lang === 'en') return `${day} ${UnitWiseBarChartComponent.EN_MONTHS[mon]} ${year}`;
        return `${BanglaNumerals.toBangla(String(day))} ${UnitWiseBarChartComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
    }

    get totalLabel(): string {
        const v = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.total)) : String(this.total);
        return this.lang === 'en' ? `Total: ${v}` : `মোট: ${v}`;
    }

    memberTypeLabel(m: MemberTypeOption): string {
        return this.lang === 'en' ? m.memberTypeName : (m.memberTypeNameBN || m.memberTypeName);
    }

    /** Comma-separated unit-scope line shown under the report title; null when unrestricted. */
    get scopeLine(): string | null {
        const names = this.lang === 'bn'
            ? (this.accessibleRabUnitNamesBN ?? this.accessibleRabUnitNames)
            : this.accessibleRabUnitNames;
        if (!names || names.length === 0) return null;
        return names.join(', ');
    }

    // ── Data loading ─────────────────────────────────────────────────────

    private loadData(): void {
        this.loading = true;
        this.statisticsService.getUnitWiseBarChart(
            this.selectedOrgId        ?? undefined,
            this.selectedMemberTypeId ?? undefined,
            this.selectedRankId       ?? undefined,
            this.selectedTradeId      ?? undefined
        ).subscribe({
            next: (res: UnitWiseBarChartResponse) => {
                this.orgOptions        = res.orgs        ?? [];
                this.memberTypeOptions = res.memberTypes ?? [];
                this.allRankOptions    = res.ranks       ?? [];
                this.tradeOptions      = this.dedupeTradeOptions(res.trades ?? []);
                this.units             = res.units       ?? [];
                this.total             = res.total       ?? 0;
                this.accessibleRabUnitNames   = res.accessibleRabUnitNames   ?? null;
                this.accessibleRabUnitNamesBN = res.accessibleRabUnitNamesBN ?? null;
                this.rebuildRankOptions();
                this.buildChart();
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    // ── Chart building ───────────────────────────────────────────────────

    private buildChartOptions(): void {
        this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx: any) => ` ${ctx.parsed.y}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { font: { size: 10 }, autoSkip: false, maxRotation: 45, minRotation: 30 }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: this.lang === 'en' ? 'Number of Personnel' : 'জনবল সংখ্যা',
                        font: { size: 12 }
                    },
                    ticks: { precision: 0 }
                }
            }
        };
    }

    private buildChart(): void {
        const labels = this.units.map(u =>
            this.lang === 'en' ? u.unitName : (u.unitNameBN || u.unitName)
        );
        const data = this.units.map(u => u.count);
        const colors = this.units.map((_, i) => BAR_COLORS[i % BAR_COLORS.length]);

        this.chartData = {
            labels,
            datasets: [{
                label: this.lang === 'en' ? 'Serving' : 'কর্মরত',
                data,
                backgroundColor: colors,
                borderRadius: 4
            }]
        };
    }

    // ── Print ────────────────────────────────────────────────────────────

    printChart(): void {
        const canvas = document.querySelector('app-unit-wise-bar-chart p-chart canvas') as HTMLCanvasElement;
        if (!canvas) return;
        const imgData = canvas.toDataURL('image/png');
        const fontFamily = this.lang === 'bn'
            ? "'Noto Sans Bengali', 'Nirmala UI', sans-serif"
            : "'Times New Roman', serif";

        const scope = this.scopeLine;
        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const chipsHtml = this.filterChips.length
            ? `<div class="chips">${this.filterChips
                .map(c => `<span class="chip">${esc(c.label)}: ${esc(c.value)}</span>`).join(' ')}</div>`
            : '';

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${this.titleLabel}</title>
<style>
    body { font-family: ${fontFamily}; text-align: center; padding: 20px; color: #000; }
    h1 { font-size: 14pt; font-weight: 700; margin-bottom: 4px; }
    .scope { font-size: 11pt; font-weight: 600; margin: 2px 0 6px 0; color: #1e3a5f; }
    .date { font-size: 10pt; margin-bottom: 8px; color: #555; }
    .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 6px 0 10px 0; }
    .chip { display: inline-block; padding: 3px 10px; font-size: 9.5pt; font-weight: 500;
            color: #0f766e; background: rgba(20,184,166,0.10);
            border: 1px solid rgba(20,184,166,0.35); border-radius: 9999px; line-height: 1.3; }
    .total { font-size: 11pt; font-weight: 600; margin-bottom: 16px; }
    img { max-width: 100%; height: auto; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print { body { padding: 0; } }
</style></head><body>
    <h1>${this.titleLabel}</h1>
    ${scope ? `<div class="scope">${esc(scope)}</div>` : ''}
    <div class="date">${this.dateLine}</div>
    ${chipsHtml}
    <div class="total">${this.totalLabel}</div>
    <img src="${imgData}" />
</body></html>`;

        const win = window.open('', '_blank', 'width=1100,height=700');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
    }
}
