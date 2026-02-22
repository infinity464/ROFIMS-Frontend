import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
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
import { EmployeeListService, GetSupernumeraryListRequest } from '@/services/employee-list.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeList } from '@/models/employee-list.model';
import { PostingService } from '@/services/posting.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { SharedService } from '@/shared/services/shared-service';
import { PostingMemberRow, DraftPostingList, PostingNoteSheet } from '@/models/posting.model';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';

/**
 * New Posting Order (ROFIMS Requirements p.45–51).
 * Source: List of Supernumerary Post.
 */
@Component({
    selector: 'app-new-posting-order',
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
    templateUrl: './new-posting-order.html',
    styleUrl: './new-posting-order.scss'
})
export class NewPostingOrderComponent implements OnInit {
    activeTab = 0;
    /** When true, only show the single panel for current route (no tab bar). */
    singleSectionMode = false;
    /** Create Draft List: supernumerary list */
    supernumeraryList: EmployeeList[] = [];
    loadingList = false;
    searchText = '';
    selectedRows: EmployeeList[] = [];
    orgOptions: { label: string; value: number }[] = [];
    selectedOrgId: number | null = null;
    memberTypeOptions: { label: string; value: number }[] = [];
    selectedMemberTypeId: number | null = null;
    rankOptions: { label: string; value: number }[] = [];
    selectedRankId: number | null = null;
    tradeOptions: { label: string; value: number }[] = [];
    selectedTradeId: number | null = null;
    joiningDateFrom: Date | null = null;
    joiningDateTo: Date | null = null;

    /** Add to Note-Sheet: draft lists */
    draftLists: DraftPostingList[] = [];
    selectedDraftListId: string | null = null;

    /** Generate Note-Sheet: note-sheets in Draft */
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

    /** List: by status */
    listNoteSheets: PostingNoteSheet[] = [];
    listStatusFilter: 'Draft' | 'PendingFinalized' | 'PendingApproval' | 'Approved' = 'Draft';

    showFinalizeDialog = false;
    finalizeSheet: PostingNoteSheet | null = null;
    finalizeMemberUnits: Record<number, number> = {};

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private employeeListService: EmployeeListService,
        private commonCodeService: CommonCodeService,
        private postingService: PostingService,
        private masterBasicSetup: MasterBasicSetupService,
        private sharedService: SharedService,
        private messageService: MessageService,
        private http: HttpClient
    ) {}

    ngOnInit(): void {
        const tab = this.route.snapshot.data['activeTab'] as number | undefined;
        if (typeof tab === 'number' && tab >= 0 && tab <= 3) {
            this.activeTab = tab;
            this.singleSectionMode = true;
        }
        this.loadOrgOptions();
        this.loadMemberTypeOptions();
        this.loadSupernumeraryList();
        this.postingService.getDraftNewPostingLists().subscribe({
            next: (lists) => {
                this.draftLists = lists;
                if (this.selectedDraftListId && !lists.find((l) => l.id === this.selectedDraftListId))
                    this.selectedDraftListId = null;
            }
        });
        this.postingService.getPostingNoteSheets().subscribe({
            next: (all) => {
                this.draftNoteSheets = all.filter((n) => n.postingType === 'New' && n.status === 'Draft');
                this.listNoteSheets = all.filter((n) => n.postingType === 'New' && n.status === this.listStatusFilter);
                if (this.selectedNoteSheetId && !this.draftNoteSheets.find((n) => n.id === this.selectedNoteSheetId))
                    this.selectedNoteSheetId = null;
            }
        });
        this.loadUnits();
        this.loadApproverOptions();
    }

    loadOrgOptions(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) =>
                (this.orgOptions = (orgs ?? []).map((o: any) => ({
                    label: o.orgNameEN ?? String(o.orgId),
                    value: o.orgId
                }))),
            error: () => {}
        });
    }

    loadMemberTypeOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('EmployeeType').subscribe({
            next: (codes: any[]) =>
                (this.memberTypeOptions = (codes ?? []).map((c) => ({
                    label: c.codeValueEN ?? String(c.codeId),
                    value: c.codeId
                }))),
            error: () => {}
        });
    }

    onOrgChange(): void {
        this.rankOptions = [];
        this.tradeOptions = [];
        this.selectedRankId = null;
        this.selectedTradeId = null;
        const orgId = this.selectedOrgId;
        if (orgId != null) {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                next: (codes: any[]) =>
                    (this.rankOptions = (codes ?? []).map((c) => ({ label: c.codeValueEN ?? String(c.codeId), value: c.codeId }))),
                error: () => {}
            });
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Trade').subscribe({
                next: (codes: any[]) =>
                    (this.tradeOptions = (codes ?? []).map((c) => ({ label: c.codeValueEN ?? String(c.codeId), value: c.codeId }))),
                error: () => {}
            });
        }
        this.loadSupernumeraryList();
    }

    loadSupernumeraryList(): void {
        this.loadingList = true;
        const request: GetSupernumeraryListRequest = {
            orgIds: this.selectedOrgId != null ? [this.selectedOrgId] : undefined,
            memberTypeId: this.selectedMemberTypeId ?? undefined,
            rankId: this.selectedRankId ?? undefined,
            tradeId: this.selectedTradeId ?? undefined,
            joiningDateFrom: this.toDateStr(this.joiningDateFrom),
            joiningDateTo: this.toDateStr(this.joiningDateTo)
        };
        this.employeeListService.getSupernumeraryList(request).subscribe({
            next: (res) => {
                this.supernumeraryList = res ?? [];
                this.loadingList = false;
                const ids = this.supernumeraryList.map((r) => r.employeeID);
                this.postingService.refreshEmployeePostingFlowStatus(ids, 'New').subscribe();
            },
            error: () => {
                this.loadingList = false;
            }
        });
    }

    get filteredSupernumeraryList(): EmployeeList[] {
        const q = this.searchText?.trim()?.toLowerCase() ?? '';
        if (!q) return this.supernumeraryList;
        return this.supernumeraryList.filter(
            (r) =>
                (r.serviceId && r.serviceId.toLowerCase().includes(q)) ||
                (r.rabID && r.rabID.toLowerCase().includes(q))
        );
    }

    isInPostingProcess(row: EmployeeList): boolean {
        return this.postingService.isEmployeeInPostingFlow(row.employeeID, 'New');
    }

    /** Action column label: "Posting in Process" | "Note Sheet in Process" | null */
    getActionLabel(row: EmployeeList): string | null {
        return this.postingService.getActionLabel(row.employeeID);
    }

    toPostingMemberRow(row: EmployeeList): PostingMemberRow {
        return {
            employeeId: row.employeeID,
            serviceId: row.serviceId ?? null,
            rabID: row.rabID ?? null,
            fullNameEN: row.fullNameEN ?? null,
            rankName: row.rankName ?? null,
            corpsName: row.corpsName ?? null,
            tradeName: row.tradeName ?? null,
            motherUnitName: row.motherUnitName ?? null,
            joiningDate: row.joiningDate ?? null,
            relieverServiceId: row.relieverServiceId ?? null
        };
    }

    sendToDraftPostingList(): void {
        const rows = this.selectedRows.length ? this.selectedRows : this.filteredSupernumeraryList.filter((r) => !this.isInPostingProcess(r));
        if (rows.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'No selection', detail: 'Select at least one member or filter list and send all.' });
            return;
        }
        const inProcess = rows.filter((r) => this.isInPostingProcess(r));
        if (inProcess.length > 0) {
            this.messageService.add({ severity: 'warn', summary: 'Some in process', detail: `${inProcess.length} member(s) already in posting flow. Only sending others.` });
        }
        const toSend = rows.filter((r) => !this.isInPostingProcess(r));
        if (toSend.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Nothing to send', detail: 'All selected are already in posting process.' });
            return;
        }
        const user = this.sharedService.getCurrentUser?.() ?? 'User';
        const members = toSend.map((r) => this.toPostingMemberRow(r));
        this.postingService.addToDraftNewPostingList(members, user).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Sent', detail: `${toSend.length} member(s) added to Draft New Posting List.` });
                this.selectedRows = [];
                this.router.navigate(['/posting/new-posting-order/draft-notesheet']);
                this.loadSupernumeraryList();
            },
            error: (err) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to add to draft list.' });
            }
        });
    }

    addToNoteSheet(): void {
        if (!this.selectedDraftListId) {
            this.messageService.add({ severity: 'warn', summary: 'Select list', detail: 'Select a Draft Posting List.' });
            return;
        }
        const user = this.sharedService.getCurrentUser?.() ?? 'User';
        this.postingService.createPostingNoteSheetFromDraftList(this.selectedDraftListId, 'New', user).subscribe({
            next: (sheet) => {
                if (sheet) {
                    this.messageService.add({ severity: 'success', summary: 'Added', detail: 'Members moved to Draft New Posting Note-Sheet. Members removed from Draft Posting List.' });
                    this.selectedDraftListId = null;
                    this.router.navigate(['/posting/new-posting-order/notesheet-generate']);
                    this.loadSupernumeraryList();
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not create note-sheet.' });
                }
            },
            error: (err) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Could not create note-sheet.' });
            }
        });
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
            .getPostingNoteSheetsSnapshot('New')
            .filter((n) => n.status === this.listStatusFilter);
    }

    generateNoteSheet(): void {
        if (!this.selectedNoteSheetId) {
            this.messageService.add({ severity: 'warn', summary: 'Select note-sheet', detail: 'Select a Draft New Posting Note-Sheet.' });
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

    getUnitLabel(unitId: number): string {
        const u = this.unitOptions.find((o) => o.value === unitId);
        return u?.label ?? String(unitId);
    }

    approve(id: string): void {
        this.postingService.approvePostingNoteSheet(id);
        this.messageService.add({ severity: 'success', summary: 'Approved', detail: 'Posting Order generated. Members in Pending List for Joining.' });
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

    getSelectedNoteSheet(): PostingNoteSheet | null {
        return this.postingService.getPostingNoteSheetById(this.selectedNoteSheetId ?? '') ?? null;
    }
}
