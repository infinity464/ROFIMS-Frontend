import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type {
    StayAfterRelieverJoinedReportParams,
    StayAfterRelieverJoinedReportRow,
} from '@/models/report.model';

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-report-stay-after-reliever-joined',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, Toast],
    providers: [MessageService],
    templateUrl: './report-stay-after-reliever-joined.component.html',
    styleUrls: [
        '../report-theme.scss',
        '../report-card-mtr.scss',
        '../report-pending-inter-posting/report-pending-inter-posting.component.scss',
        './report-stay-after-reliever-joined.component.scss',
    ],
})
export class ReportStayAfterRelieverJoinedComponent implements OnInit {
    lang: Lang = 'en';

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    list: StayAfterRelieverJoinedReportRow[] = [];
    loading = false;
    searched = false;

    totalRecords = 0;
    pageNo = 1;
    rows = 20;
    rowsPerPageOptions = [20, 50, 100];

    exportDropdownOpen = false;
    exporting = false;

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private reportService: ReportService,
        private messageService: MessageService,
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        // No filters to gather — load immediately on first paint.
        this.searched = true;
        this.loadPage();
    }

    get reportTitle(): string {
        return this.lang === 'en'
            ? 'Nominal Roll of Stay in RAB after Reliever Joined'
            : 'প্রতিস্থাপক যোগদানের পর র‍্যাবে অবস্থানরত সদস্যের নামীয় তালিকা';
    }

    get dateLine(): string {
        const now = new Date();
        return this.lang === 'en'
            ? now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
            : now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        if (!this.searched) return;
        const first = event?.first ?? 0;
        const take = event?.rows ?? this.rows;
        this.rows = take;
        this.pageNo = Math.floor(first / take) + 1;
        this.loadPage();
    }

    private loadPage(): void {
        this.loading = true;
        const params: StayAfterRelieverJoinedReportParams = {
            postingStatus: 'Servings',
            pagination: { page_no: this.pageNo, row_per_page: this.rows },
        };
        this.reportService.getStayAfterRelieverJoinedReport(params).subscribe({
            next: (res) => {
                this.list = res.datalist ?? [];
                this.totalRecords = res.pages?.rows ?? 0;
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load nominal roll.',
                });
                this.loading = false;
            },
        });
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    getExportData(): { columns: string[]; rows: string[][] } {
        const columns = this.lang === 'en'
            ? ['Ser', 'Service ID', 'Rank', 'Name', 'Date of Joining in RAB',
               'Duration of Stay', 'Battalion', 'Posted-out Unit',
               'Reliever Joining Date', 'Rmks']
            : ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবী', 'নাম', 'র‍্যাবে যোগদানের তারিখ',
               'অবস্থানের মেয়াদকাল', 'ব্যাটালিয়ন', 'বদলিকৃত ইউনিট',
               'প্রতিস্থাপক যোগদানের তারিখ', 'মন্তব্য'];
        const rows = this.list.map((row, i) => [
            this.displayNum(i + 1),
            this.displayNum(row.serviceId),
            this.codeValue(row.rank, row.rankBN),
            this.codeValue(row.name, row.nameBN),
            this.formatDateLabel(row.joiningInRab),
            this.formatDuration(row.durationOfStay),
            this.codeValue(row.presentUnit, row.presentUnitBN),
            this.codeValue(row.postedOutUnit, row.postedOutUnitBN),
            this.formatDateLabel(row.relieverJoiningDate),
            row.rmks ?? '—',
        ]);
        return { columns, rows };
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        const { columns, rows } = this.getExportData();
        const config = {
            title: this.reportTitle,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            filterLines: [],
            landscape: true,
            filename: 'stay-after-reliever-joined',
        };
        if (type === 'pdf') {
            this.exporting = true;
            try { await this.exportService.generatePDF(config); } finally { this.exporting = false; }
        } else if (type === 'print') {
            this.exportService.exportPDF(config);
        } else if (type === 'word') {
            await this.exportService.exportWord(config);
        } else {
            this.exportService.exportExcel(config);
        }
    }

    displayNum(v: number | string | null | undefined): string {
        if (v == null || v === '') return '-';
        const s = String(v);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
        return enVal ?? bnVal ?? '—';
    }

    formatDateLabel(v: string | null | undefined): string {
        if (v == null || v === '') return '—';
        try {
            const d = new Date(v);
            if (isNaN(d.getTime())) return v;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = String(d.getFullYear());
            const s = `${day}-${month}-${year}`;
            return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
        } catch {
            return v;
        }
    }

    formatDuration(v: string | null | undefined): string {
        if (!v) return '—';
        const m = /^(\d+)y\s+(\d+)m$/.exec(v.trim());
        if (!m) return v;
        const y = Number(m[1]);
        const mo = Number(m[2]);
        if (this.lang === 'en') {
            const parts: string[] = [];
            if (y > 0) parts.push(`${y} ${y === 1 ? 'year' : 'years'}`);
            parts.push(`${mo} ${mo === 1 ? 'month' : 'months'}`);
            return parts.join(' ');
        }
        const yBn = BanglaNumerals.toBangla(String(y));
        const mBn = BanglaNumerals.toBangla(String(mo));
        return `${yBn} বছর ${mBn} মাস`;
    }
}
