import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputTextModule } from 'primeng/inputtext';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { DatePickerModule } from 'primeng/datepicker';
import { TabsModule } from 'primeng/tabs';
import { DialogModule } from 'primeng/dialog';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ServingMembersService, ServingMemberFilterRequest, ServingMemberPaginatedFilterRequest } from '@/services/serving-members.service';
import { EmployeeServiceOverview } from '@/models/employee-service-overview.model';
import { PostingService } from '@/services/posting.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { SharedService } from '@/shared/services/shared-service';
import { PostingMemberRow, DraftPostingList, PostingNoteSheet } from '@/models/posting.model';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { PagedResponse } from '@/Core/Models/Pagination';

/**
 * Inter-Posting Order (ROFIMS Requirements p.52–58).
 * Source: Presently Serving Members.
 */
@Component({
    selector: 'app-inter-posting-order',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        CardModule,
        ButtonModule,
        TableModule,
        SelectModule,
        MultiSelectModule,
        InputTextModule,
        IconField,
        InputIcon,
        DatePickerModule,
        TabsModule,
        DialogModule,
        Toast
    ],
    providers: [MessageService],
    templateUrl: './inter-posting-order.html',
    styleUrl: './inter-posting-order.scss'
})
export class InterPostingOrderComponent implements OnInit {
    activeTab = 0;
    servingList: EmployeeServiceOverview[] = [];
    loadingList = false;
    totalRecords = 0;
    first = 0;
    rows = 10;
    selectedRows: EmployeeServiceOverview[] = [];

    filter: ServingMemberFilterRequest = {};
    rabUnitOptions: { label: string; value: number }[] = [];
    rankOptions: { label: string; value: number }[] = [];
    corpsOptions: { label: string; value: number }[] = [];
    tradeOptions: { label: string; value: number }[] = [];
    districtOptions: { label: string; value: number }[] = [];
    appointmentOptions: { label: string; value: number }[] = [];

    draftLists: DraftPostingList[] = [];
    selectedDraftListId: string | null = null;

    draftNoteSheets: PostingNoteSheet[] = [];
    selectedNoteSheetId: string | null = null;
    unitOptions: { label: string; value: number }[] = [];
    initiatorOptions: { label: string; value: number }[] = [];
    recommenderOptions: { label: string; value: number }[] = [];
    finalApproverOptions: { label: string; value: number }[] = [];
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    generateSubject = '';
    generateMainText = '';
    generateRefNo = '';
    generateDate: Date | null = null;
    generateInitiatorId: number | null = null;
    generateRecommenderIds: number[] = [];
    generateFinalApproverId: number | null = null;
    generateTextType: 'en' | 'bn' = 'en';

    listNoteSheets: PostingNoteSheet[] = [];
    listStatusFilter: 'Draft' | 'PendingFinalized' | 'PendingApproval' | 'Approved' = 'Draft';
    showFinalizeDialog = false;
    finalizeSheet: PostingNoteSheet | null = null;
    finalizeMemberUnits: Record<number, number> = {};

    constructor(
        private servingMembersService: ServingMembersService,
        private postingService: PostingService,
        private masterBasicSetup: MasterBasicSetupService,
        private sharedService: SharedService,
        private messageService: MessageService,
        private http: HttpClient
    ) {}

    ngOnInit(): void {
        this.loadFilterOptions();
        this.loadServingList();
        this.postingService.getDraftInterPostingLists().subscribe((lists) => {
            this.draftLists = lists;
            if (this.selectedDraftListId && !lists.find((l) => l.id === this.selectedDraftListId))
                this.selectedDraftListId = null;
        });
        this.postingService.getPostingNoteSheets().subscribe((all) => {
            this.draftNoteSheets = all.filter((n) => n.postingType === 'Inter' && n.status === 'Draft');
            this.listNoteSheets = all.filter((n) => n.postingType === 'Inter' && n.status === this.listStatusFilter);
            if (this.selectedNoteSheetId && !this.draftNoteSheets.find((n) => n.id === this.selectedNoteSheetId))
                this.selectedNoteSheetId = null;
        });
        this.loadUnits();
        this.loadApproverOptions();
    }

    loadFilterOptions(): void {
        this.servingMembersService.getServingMemberFilterOptions().subscribe({
            next: (opts) => {
                this.rabUnitOptions = (opts.rabUnits ?? []).map((u) => ({ label: u.codeValueEN, value: u.codeId }));
                this.rankOptions = (opts.ranks ?? []).map((r) => ({ label: r.codeValueEN, value: r.codeId }));
                this.corpsOptions = (opts.corps ?? []).map((c) => ({ label: c.codeValueEN, value: c.codeId }));
                this.tradeOptions = (opts.trades ?? []).map((t) => ({ label: t.codeValueEN, value: t.codeId }));
                this.districtOptions = (opts.districts ?? []).map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                this.appointmentOptions = (opts.appointments ?? []).map((a) => ({ label: a.codeValueEN, value: a.codeId }));
            },
            error: () => {}
        });
    }

    loadServingList(): void {
        this.loadingList = true;
        const pageNo = Math.floor(this.first / this.rows) + 1;
        const hasFilter = Object.values(this.filter).some((v) => v != null && v !== '');
        if (hasFilter) {
            const request: ServingMemberPaginatedFilterRequest = {
                pagination: { page_no: pageNo, row_per_page: this.rows },
                filter: this.filter
            };
            this.servingMembersService.getPresentlyServingMembersPaginatedFiltered(request).subscribe({
                next: (res: PagedResponse<EmployeeServiceOverview>) => {
                    this.servingList = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.loadingList = false;
                },
                error: () => {
                    this.loadingList = false;
                }
            });
        } else {
            this.servingMembersService.getPresentlyServingMembersPaginated(pageNo, this.rows).subscribe({
                next: (res: PagedResponse<EmployeeServiceOverview>) => {
                    this.servingList = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
                    this.loadingList = false;
                },
                error: () => {
                    this.loadingList = false;
                }
            });
        }
    }

    onPage(event: TableLazyLoadEvent): void {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
        this.loadServingList();
    }

    search(): void {
        this.first = 0;
        this.loadServingList();
    }

    clearFilter(): void {
        this.filter = {};
        this.first = 0;
        this.loadServingList();
    }

    isInPostingProcess(row: EmployeeServiceOverview): boolean {
        return this.postingService.isEmployeeInPostingFlow(row.employeeID, 'Inter');
    }

    toPostingMemberRow(row: EmployeeServiceOverview): PostingMemberRow {
        return {
            employeeId: row.employeeID,
            serviceId: row.serviceId ?? null,
            rabID: row.rabID ?? null,
            fullNameEN: row.nameEnglish ?? null,
            rankName: row.armyRank ?? null,
            corpsName: row.corps ?? null,
            tradeName: row.trade ?? null,
            rabUnit: row.rabUnit ?? null,
            joiningDate: row.joiningDate ?? null,
            homeDistrictName: row.permanentDistrictTypeName ?? null
        };
    }

    sendToDraftInterPostingList(): void {
        const rows = this.selectedRows.length ? this.selectedRows : this.servingList.filter((r) => !this.isInPostingProcess(r));
        if (rows.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'No selection', detail: 'Select at least one member.' });
            return;
        }
        const toSend = rows.filter((r) => !this.isInPostingProcess(r));
        if (toSend.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Already in list', detail: 'All selected are already in Inter Posting List or Note-Sheet.' });
            return;
        }
        const user = this.sharedService.getCurrentUser?.() ?? 'User';
        const members = toSend.map((r) => this.toPostingMemberRow(r));
        this.postingService.addToDraftInterPostingList(members, user);
        this.messageService.add({ severity: 'success', summary: 'Sent', detail: `${toSend.length} member(s) added to Draft Inter Posting List.` });
        this.selectedRows = [];
        this.activeTab = 1;
    }

    addToNoteSheet(): void {
        if (!this.selectedDraftListId) {
            this.messageService.add({ severity: 'warn', summary: 'Select list', detail: 'Select a Draft Inter Posting List.' });
            return;
        }
        const user = this.sharedService.getCurrentUser?.() ?? 'User';
        const sheet = this.postingService.createPostingNoteSheetFromDraftList(this.selectedDraftListId, 'Inter', user);
        if (sheet) {
            this.messageService.add({ severity: 'success', summary: 'Added', detail: 'Members moved to Draft Inter Posting Note-Sheet.' });
            this.selectedDraftListId = null;
            this.activeTab = 2;
        } else {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not create note-sheet.' });
        }
    }

    loadUnits(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (list: CommonCode[]) =>
                (this.unitOptions = (Array.isArray(list) ? list : []).map((c) => ({
                    label: c.codeValueEN || c.codeValueBN || String(c.codeId),
                    value: c.codeId
                }))),
            error: () => {}
        });
    }

    loadApproverOptions(): void {
        this.http.get<any[]>(`${environment.apis.core}/EmployeeInfo/GetAll`).subscribe({
            next: (list) => {
                const opts = (Array.isArray(list) ? list : []).map((e: any) => ({
                    label: e.fullNameEN || e.FullNameEN || e.rabid || e.Rabid || `ID ${e.employeeID ?? e.EmployeeID}`,
                    value: e.employeeID ?? e.EmployeeID
                }));
                this.initiatorOptions = opts;
                this.recommenderOptions = opts;
                this.finalApproverOptions = opts;
            },
            error: () => {}
        });
    }

    onListStatusFilterChange(): void {
        this.listNoteSheets = this.postingService
            .getPostingNoteSheetsSnapshot('Inter')
            .filter((n) => n.status === this.listStatusFilter);
    }

    generateNoteSheet(): void {
        if (!this.selectedNoteSheetId) {
            this.messageService.add({ severity: 'warn', summary: 'Select note-sheet', detail: 'Select a Draft Inter Posting Note-Sheet.' });
            return;
        }
        this.postingService.updatePostingNoteSheet(this.selectedNoteSheetId, {
            subject: this.generateSubject,
            mainText: this.generateMainText,
            referenceNumber: this.generateRefNo || null,
            noteSheetDate: this.generateDate ? this.toDateStr(this.generateDate) ?? undefined : undefined,
            textType: this.generateTextType,
            initiatorId: this.generateInitiatorId,
            recommenderIds: this.generateRecommenderIds,
            finalApproverId: this.generateFinalApproverId
        });
        this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Note-sheet details updated.' });
    }

    submitForFinalized(id: string): void {
        this.postingService.submitForFinalized(id);
        this.messageService.add({ severity: 'success', summary: 'Submitted', detail: 'Moved to Pending for Finalized.' });
        this.onListStatusFilterChange();
    }

    openFinalizeDialog(sheet: PostingNoteSheet): void {
        this.finalizeSheet = sheet;
        this.finalizeMemberUnits = {};
        sheet.members.forEach((m) => {
            if (m.transferUnitId) this.finalizeMemberUnits[m.employeeId] = m.transferUnitId;
        });
        this.showFinalizeDialog = true;
    }

    submitFinalizedWithUnits(): void {
        if (!this.finalizeSheet) return;
        const missing = this.finalizeSheet.members.filter((m) => !this.finalizeMemberUnits[m.employeeId]);
        if (missing.length > 0) {
            this.messageService.add({ severity: 'warn', summary: 'Assign units', detail: 'Select unit for each member.' });
            return;
        }
        this.postingService.finalizeWithUnits(this.finalizeSheet.id, this.finalizeMemberUnits);
        this.postingService.submitForApproval(this.finalizeSheet.id);
        this.messageService.add({ severity: 'success', summary: 'Submitted', detail: 'Submitted for Approval.' });
        this.showFinalizeDialog = false;
        this.finalizeSheet = null;
        this.onListStatusFilterChange();
    }

    approve(id: string): void {
        this.postingService.approvePostingNoteSheet(id);
        this.messageService.add({ severity: 'success', summary: 'Approved', detail: 'Posting Order generated.' });
        this.onListStatusFilterChange();
    }

    toDateStr(d: Date | null): string | undefined {
        if (!d) return undefined;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    formatDate(v: string | null): string {
        if (!v) return '-';
        try {
            const d = new Date(v);
            return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return v;
        }
    }

    getSelectedDraftList(): DraftPostingList | null {
        return this.draftLists.find((l) => l.id === this.selectedDraftListId) ?? null;
    }
}
