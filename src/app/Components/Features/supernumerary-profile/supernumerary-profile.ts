import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { Toast } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { EmployeeListService } from '@/services/employee-list.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService, EmployeeDocumentReferenceItem } from '@/services/emp-service';
import { SupernumeraryEmpProfile, AddressBlock, RelieverRow } from '@/models/employee-list.model';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import { TooltipModule } from 'primeng/tooltip';
import { ExportService, type ProfileExportConfig, type ProfileExportSection } from '@/services/export.service';

@Component({
    selector: 'app-supernumerary-profile',
    standalone: true,
    imports: [CommonModule, RouterModule, ButtonModule, TableModule, Toast, DialogModule, TooltipModule],
    providers: [MessageService],
    templateUrl: './supernumerary-profile.html',
    styleUrl: './supernumerary-profile.scss'
})
export class SupernumeraryProfile implements OnInit, OnDestroy {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    employeeId: number | null = null;
    profile: SupernumeraryEmpProfile | null = null;
    profileImageUrl: string | null = null;
    loading = false;

    /** Reliever table rows - use property instead of function for reliable p-table button clicks */
    relieverTableRows: Array<{ employeeID: number; serviceId: string | null; rank: string | null; corps: string | null; trade: string | null; name: string | null; wingBattalion: string | null; appointment: string | null }> = [];

    /** Documents/Files from GetEmployeeDocumentReferences (like ex-member profile). */
    documentList: EmployeeDocumentReferenceItem[] = [];

    /** Joining date from GetEmployeePersonalServiceOverview (same source as ex-member profile). */
    serviceOverview: EmployeePersonalServiceOverview | null = null;

    exportDropdownOpen = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private employeeListService: EmployeeListService,
        private servingMembersService: ServingMembersService,
        private messageService: MessageService,
        private empService: EmpService,
        private exportService: ExportService,
        private _userMenuService: UserMenuService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    getExportData(): ProfileExportConfig {
        const p = this.profile;
        const title = p ? `Supernumerary Profile - ${p.name || p.serviceId || ''}` : 'Supernumerary Profile';
        const sections: ProfileExportSection[] = [];
        const addSection = (secTitle: string, columns: string[], rows: string[][], noTableHeader?: boolean, addressSection?: boolean) =>
            sections.push({ title: secTitle, columns, rows, noTableHeader, addressSection });
        const kv = (label: string, value: string): [string, string] => [label, value];
        const val = (v: string | number | null | undefined): string => (v == null || v === '') ? '-' : String(v);

        if (!p) return { title, lang: 'en', sections, showPageNumbers: true };

        // Basic Service Information
        addSection('Basic Service Information', ['Field', 'Value'], [
            kv('Service ID', val(p.serviceId)),
            kv('RAB ID', val(p.rabId)),
            kv('Name', val(p.name)),
            kv('Type of Member', val(p.typeOfMember)),
            kv('Rank', val(p.rank)),
            kv('Corps', val(p.corpsName || p.corps)),
            kv('Trade', val(p.trade) === '-' ? 'N/A' : val(p.trade)),
            kv('Mother Organization', val(p.motherOrganization)),
            kv('Last Unit', val(p.lastUnit)),
            kv('Last Unit District', val(p.location)),
            kv('Appointment', val(p.appointment)),
            kv('Date of Joining in RAB', this.formatDateOfJoining(this.serviceOverview?.joiningDate ?? this.getDateOfJoiningInRAB(p))),
            kv('Special Qualifications', val(this.serviceOverview?.specialQualifications ?? null)),
            kv('Marital Status', val(this.serviceOverview?.maritalStatus ?? null)),
        ], true);

        // Own Permanent Address
        if (this.hasAddress(p.ownPermanentAddress)) {
            addSection('Own Permanent Address', ['Field', 'Value'], [
                kv('Village/Area', this.addrVal(p.ownPermanentAddress, 'villageArea')),
                kv('District', this.addrVal(p.ownPermanentAddress, 'district')),
                kv('Post Office', this.addrVal(p.ownPermanentAddress, 'postOffice')),
                kv('Division', this.addrVal(p.ownPermanentAddress, 'division')),
                kv('Upazila/Thana', this.addrVal(p.ownPermanentAddress, 'upazilaThana')),
            ], true, true);
        }

        // Own Present Address
        if (this.hasAddress(p.ownPresentAddress)) {
            addSection('Own Present Address', ['Field', 'Value'], [
                kv('Village/Area', this.addrVal(p.ownPresentAddress, 'villageArea')),
                kv('District', this.addrVal(p.ownPresentAddress, 'district')),
                kv('Post Office', this.addrVal(p.ownPresentAddress, 'postOffice')),
                kv('Division', this.addrVal(p.ownPresentAddress, 'division')),
                kv('Upazila/Thana', this.addrVal(p.ownPresentAddress, 'upazilaThana')),
            ], true, true);
        }

        // Spouse Present Address
        if (this.hasAddress(p.spousePresentAddress)) {
            addSection('Spouse Present Address', ['Field', 'Value'], [
                kv('Village/Area', this.addrVal(p.spousePresentAddress, 'villageArea')),
                kv('District', this.addrVal(p.spousePresentAddress, 'district')),
                kv('Post Office', this.addrVal(p.spousePresentAddress, 'postOffice')),
                kv('Division', this.addrVal(p.spousePresentAddress, 'division')),
                kv('Upazila/Thana', this.addrVal(p.spousePresentAddress, 'upazilaThana')),
            ], true, true);
        }

        // Spouse Permanent Address
        if (this.hasAddress(p.spousePermanentAddress)) {
            addSection('Spouse Permanent Address', ['Field', 'Value'], [
                kv('Village/Area', this.addrVal(p.spousePermanentAddress, 'villageArea')),
                kv('District', this.addrVal(p.spousePermanentAddress, 'district')),
                kv('Post Office', this.addrVal(p.spousePermanentAddress, 'postOffice')),
                kv('Division', this.addrVal(p.spousePermanentAddress, 'division')),
                kv('Upazila/Thana', this.addrVal(p.spousePermanentAddress, 'upazilaThana')),
            ], true, true);
        }

        // Reliever Information
        if (p.relievedBy && this.relieverTableRows.length > 0) {
            const relieverRows = this.relieverTableRows.map((r, i) => [
                String(i + 1) + '.',
                val(r.serviceId),
                val(r.rank),
                val(r.corps),
                val(r.trade),
                val(r.name),
                val(r.wingBattalion),
                val(r.appointment),
            ]);
            addSection('Reliever Information', ['Ser', 'Service ID', 'Rank', 'Corps', 'Trade', 'Name', 'Wing/Battalion', 'Appointment'], relieverRows);
        }

        // Documents
        const docRows = this.documentList.map((row, i) => [String(i + 1) + '.', this.getDocumentSourceLabel(row), this.getDocumentFileName(row)]);
        if (docRows.length === 0) docRows.push(['No documents available.']);
        addSection('Files', ['Ser', 'Section', 'File Name'], docRows);

        return { title, lang: 'en', sections, showPageNumbers: true };
    }

    async exportAs(type: 'pdf' | 'word'): Promise<void> {
        const config: ProfileExportConfig = { ...this.getExportData() };
        if (this.profileImageUrl) {
            try {
                const blob = await fetch(this.profileImageUrl).then((r) => r.blob());
                const dataUrl = await new Promise<string>((res, rej) => {
                    const r = new FileReader();
                    r.onload = () => res(r.result as string);
                    r.onerror = rej;
                    r.readAsDataURL(blob);
                });
                config.imageDataUrl = dataUrl;
            } catch {
                // omit image if fetch/read fails
            }
        }
        if (type === 'pdf') this.exportService.exportProfilePDF(config);
        else if (type === 'word') await this.exportService.exportProfileWord(config);
        this.exportDropdownOpen = false;
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        const id = this.route.snapshot.paramMap.get('id');
        if (id != null) {
            this.employeeId = +id;
            if (!isNaN(this.employeeId)) this.loadProfile();
            else this.onError('Invalid employee ID');
        } else {
            this.onError('Missing employee ID');
        }
    }

    loadProfile(): void {
        if (this.employeeId == null) return;
        const id = this.employeeId;
        this.loading = true;
        forkJoin({
            profile: this.employeeListService.getSupernumeraryEmpProfile(id),
            overview: this.servingMembersService.getEmployeePersonalServiceOverview(id).pipe(
                catchError(() => of(null))
            )
        }).subscribe({
            next: ({ profile, overview }) => {
                this.profile = profile ?? null;
                this.serviceOverview = overview ?? null;
                this.loadProfileImage(this.profile);
                this.relieverTableRows = this.buildRelieverTableRows(this.profile);
                this.loadDocuments();
                this.loading = false;
            },
            error: (err) => {
                console.error('Failed to load profile', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load profile'
                });
                this.loading = false;
            }
        });
    }

    onError(message: string): void {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: message });
    }

    goBack(): void {
        this.router.navigate(['/supernumerary-list']);
    }

    ngOnDestroy(): void {
        if (this.profileImageUrl) {
            URL.revokeObjectURL(this.profileImageUrl);
            this.profileImageUrl = null;
        }
    }

    private loadProfileImage(profile: SupernumeraryEmpProfile | null): void {
        if (this.profileImageUrl) {
            URL.revokeObjectURL(this.profileImageUrl);
            this.profileImageUrl = null;
        }
        const json = profile?.profileImages ?? (profile as { ProfileImages?: string })?.ProfileImages ?? null;
        if (!json || typeof json !== 'string') return;
        let refs: { FileId?: number; fileName?: string }[];
        try {
            refs = JSON.parse(json) as { FileId?: number; fileName?: string }[];
        } catch {
            return;
        }
        const first = Array.isArray(refs) && refs.length > 0 ? refs[0] : null;
        const fileId = first?.FileId ?? (first as { fileId?: number })?.fileId;
        if (fileId == null || fileId <= 0) return;
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => {
                if (blob && blob.size > 0) {
                    this.profileImageUrl = URL.createObjectURL(blob);
                }
            },
            error: (err: any) => {}
        });
    }

    relieverDialogVisible = false;
    relieverProfile: SupernumeraryEmpProfile | null = null;
    relieverProfileLoading = false;

    /** Extract employeeID from row (handles camelCase and PascalCase from API). */
    getEmployeeId(row: { employeeID?: number; EmployeeID?: number }): number | null {
        const id = row?.employeeID ?? row?.['EmployeeID'];
        return typeof id === 'number' ? id : null;
    }

    /** Opens reliever profile modal when View is clicked. */
    onViewRelieverClick(row: { employeeID?: number; EmployeeID?: number }): void {
        const id = this.getEmployeeId(row);
        if (id != null) this.viewRelieverProfile(id);
    }

    viewRelieverProfile(employeeId: number): void {
        if (employeeId == null || typeof employeeId !== 'number') return;
        this.relieverProfile = null;
        this.relieverDialogVisible = true;
        this.relieverProfileLoading = true;
        this.employeeListService.getSupernumeraryEmpProfile(employeeId).subscribe({
            next: (p) => {
                this.relieverProfile = p ?? null;
                this.relieverProfileLoading = false;
            },
            error: (err) => {
                console.error('Failed to load reliever profile', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load reliever profile'
                });
                this.relieverProfileLoading = false;
            }
        });
    }

    closeRelieverDialog(): void {
        this.relieverDialogVisible = false;
        this.relieverProfile = null;
    }

    private loadDocuments(): void {
        if (this.employeeId == null) return;
        this.empService.getEmployeeDocumentReferences(this.employeeId).subscribe({
            next: (list) => {
                this.documentList = list ?? [];
            },
            error: (err: any) => {
                this.documentList = [];
            }
        });
    }

    getDocumentSourceLabel(row: { sourceTable?: string; SourceTable?: string }): string {
        const sourceTable = row?.sourceTable ?? row?.SourceTable ?? '';
        const labels: Record<string, string> = {
            PersonalInfo: 'Personal Info',
            EmployeeInfo: 'Employee Info',
            PreviousRABServiceInfo: 'Previous RAB Service',
            PromotionInfo: 'Promotion',
            RankConfirmationInfo: 'Rank Confirmation',
            BankAccInfo: 'Bank Account',
            CourseInfo: 'Course',
            DisciplineInfo: 'Discipline',
            EducationInfo: 'Education',
            ForeignVisitInfo: 'Foreign Visit',
            MedicalInfo: 'Medical',
            MOServHistory: 'MO Service History',
            NomineeInfo: 'Nominee'
        };
        return labels[sourceTable] ?? (sourceTable || 'Document');
    }

    getDocumentFileName(row: { fileName?: string; FileName?: string }): string {
        return row?.fileName ?? row?.FileName ?? '-';
    }

    downloadDocument(item: EmployeeDocumentReferenceItem): void {
        const fileId = item.fileId ?? (item as { FileId?: number }).FileId;
        const fileName = item.fileName ?? (item as { FileName?: string }).FileName ?? 'download';
        if (fileId == null) return;
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, fileName),
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file.' })
        });
    }

    /** True if address block exists and has at least one non-empty field. */
    hasAddress(addr: AddressBlock | null | undefined): boolean {
        if (!addr) return false;
        const keys: (keyof AddressBlock)[] = ['villageArea', 'district', 'postOffice', 'division', 'upazilaThana'];
        return keys.some((k) => this.getAddrField(addr, k) !== '-');
    }

    /** Get Date of Joining in RAB from profile; API may return camelCase or PascalCase (same as ex-member joiningDate). */
    getDateOfJoiningInRAB(profile: SupernumeraryEmpProfile | null): string | null {
        if (!profile) return null;
        const raw = profile as unknown as Record<string, unknown>;
        const val =
            raw['dateOfJoiningInRAB'] ??
            raw['DateOfJoiningInRAB'] ??
            raw['joiningDate'] ??
            raw['JoiningDate'];
        return val != null && val !== '' ? String(val) : null;
    }

    formatDateOfJoining(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return value;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
        } catch {
            return value;
        }
    }

    /** Single-line address for inline display; for section layout use address field getters below. */
    formatAddressLine(addr: AddressBlock | null | undefined): string {
        if (!addr) return '-';
        const parts = ['villageArea', 'district', 'postOffice', 'division', 'upazilaThana'].map((k) => this.getAddrField(addr, k as keyof AddressBlock));
        return parts.filter((p) => p !== '-').length ? parts.filter((p) => p !== '-').join(', ') : '-';
    }

    /** Get address field value; API may return PascalCase (VillageArea, District, etc.) so check both. */
    getAddrField(addr: AddressBlock | null | undefined, key: keyof AddressBlock): string {
        if (!addr) return '-';
        const raw = addr as unknown as Record<string, unknown>;
        const camel = addr[key];
        if (camel != null && camel !== '') return camel;
        const pascalMap: Record<keyof AddressBlock, string> = {
            villageArea: 'VillageArea',
            district: 'District',
            postOffice: 'PostOffice',
            division: 'Division',
            upazilaThana: 'UpazilaThana'
        };
        const pascalKey = pascalMap[key];
        const v = pascalKey ? raw[pascalKey] : undefined;
        if (v != null && v !== '') return String(v);
        // Village/Area: backend may send VillageArea from HouseRoad ?? AddressAreaEN; support alternate keys
        if (key === 'villageArea') {
            const altKeys = ['Village', 'Area', 'AddressAreaEN', 'HouseRoad', 'addressAreaEN', 'houseRoad'];
            for (const k of altKeys) {
                const alt = raw[k];
                if (alt != null && alt !== '') return String(alt);
            }
        }
        return '-';
    }

    addrVal(addr: AddressBlock | null | undefined, key: keyof AddressBlock): string {
        return this.getAddrField(addr, key);
    }

    /** Get initials from name for avatar fallback. */
    getInitials(name: string | null | undefined): string {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    /** Build combined rows for reliever table: RelievedBy (if any) + Relievers. */
    private buildRelieverTableRows(profile: SupernumeraryEmpProfile | null): Array<{ employeeID: number; serviceId: string | null; rank: string | null; corps: string | null; trade: string | null; name: string | null; wingBattalion: string | null; appointment: string | null }> {
        const p = profile;
        if (!p) return [];
        const rows: Array<{ employeeID: number; serviceId: string | null; rank: string | null; corps: string | null; trade: string | null; name: string | null; wingBattalion: string | null; appointment: string | null }> = [];
        if (p.relievedBy) {
            rows.push({
                employeeID: p.relievedBy.employeeID ?? (p.relievedBy as any).EmployeeID,
                serviceId: p.relievedBy.serviceId ?? (p.relievedBy as any).ServiceId,
                rank: p.relievedBy.rank ?? (p.relievedBy as any).Rank ?? '-',
                corps: p.relievedBy.corps ?? (p.relievedBy as any).Corps ?? '-',
                trade: p.relievedBy.trade ?? (p.relievedBy as any).Trade ?? '-',
                name: p.relievedBy.name ?? (p.relievedBy as any).Name ?? '-',
                wingBattalion: p.relievedBy.wingBattalion ?? (p.relievedBy as any).WingBattalion ?? '-',
                appointment: p.relievedBy.appointment ?? (p.relievedBy as any).Appointment ?? '-'
            });
        }
        if (p.relievers?.length) {
            for (const r of p.relievers) {
                const a = r as RelieverRow & { EmployeeID?: number; ServiceId?: string; Rank?: string; Corps?: string; Trade?: string; Name?: string; WingBattalion?: string; Appointment?: string };
                rows.push({
                    employeeID: r.employeeID ?? a.EmployeeID ?? 0,
                    serviceId: (r.serviceId ?? a.ServiceId ?? '-') as string | null,
                    rank: (r.rank ?? a.Rank ?? '-') as string | null,
                    corps: (r.corps ?? a.Corps ?? '-') as string | null,
                    trade: (r.trade ?? a.Trade ?? '-') as string | null,
                    name: (r.name ?? a.Name ?? '-') as string | null,
                    wingBattalion: (r.wingBattalion ?? a.WingBattalion ?? '-') as string | null,
                    appointment: (r.appointment ?? a.Appointment ?? '-') as string | null
                });
            }
        }
        return rows;
    }
}
