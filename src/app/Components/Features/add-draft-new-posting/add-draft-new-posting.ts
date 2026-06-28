import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { Toast } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { EmployeeListService } from '@/services/employee-list.service';
import { PostingService } from '@/services/posting.service';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { EmployeeList } from '@/models/employee-list.model';
import { DraftPostingMasterDto, DraftPostingMasterWithDetailsDto, DraftPostingDetailDto } from '@/models/posting.model';
import { DraftPostingStatusOptions, IsSendingNotesheetStatus } from '@/models/enums';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';

@Component({
    selector: 'app-add-draft-new-posting',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        InputTextModule,
        DatePickerModule, FlexibleDateDirective,
        SelectModule,
        MultiSelectModule,
        Toast,
        DialogModule,
        ConfirmDialogModule,
        TooltipModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './add-draft-new-posting.html',
    styleUrl: './add-draft-new-posting.scss'
})
export class AddDraftNewPostingComponent implements OnInit {
    draftPostingDate: Date | null = null;
    draftPostingListNo = '';
    list: EmployeeList[] = [];
    selectedRows: EmployeeList[] = [];
    loading = false;
    saving = false;
    draftMastersList: DraftPostingMasterDto[] = [];
    loadingMasters = false;
    /** Edit mode: loaded draft id and data */
    editDraftId: number | null = null;
    editDraft: DraftPostingMasterWithDetailsDto | null = null;
    editDraftStatus = '';
    draftPostingStatusOptions = DraftPostingStatusOptions;
    canView = true;
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    /** All active Member Types (CommonCode 'EmployeeType'); `memberTypeOptions` exposes the accessible subset. */
    allMemberTypeOptions: { label: string; value: number }[] = [];
    selectedMemberTypeIds: number[] = [];
    /** Member type ids the logged-in user may access (null = not yet resolved / unrestricted). */
    allowedMemberTypeIds: number[] | null = null;

    constructor(
        private employeeListService: EmployeeListService,
        private postingService: PostingService,
        private sharedService: SharedService,
        private messageService: MessageService,
        private _router: Router,
        private _userMenuService: UserMenuService,
        private masterBasicSetupService: MasterBasicSetupService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canView = _perms.canView;
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadCurrentUserMemberTypePermissions();
        this.loadData();
        this.loadDraftMasters();
        this.loadMemberTypes();
        this.draftPostingDate = new Date();
    }

    /** Dropdown options limited to the user's accessible member types (all if not resolved). */
    get memberTypeOptions(): { label: string; value: number }[] {
        if (this.allowedMemberTypeIds == null) return this.allMemberTypeOptions;
        const allowed = this.allowedMemberTypeIds;
        return this.allMemberTypeOptions.filter((o) => allowed.includes(o.value));
    }

    /** Resolve the current user's accessible member type ids.
     *  Shows the cached set first (no blank flash), then ALWAYS refetches from the API so
     *  admin changes to this user's accessible member types take effect without a re-login
     *  (cacheForUser also refreshes the shared localStorage cache). */
    private loadCurrentUserMemberTypePermissions(): void {
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) { this.allowedMemberTypeIds = null; return; }
        this.allowedMemberTypeIds = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        this.memberTypeAccess.cacheForUser(userId).subscribe({
            next: (ids) => { this.allowedMemberTypeIds = Array.isArray(ids) ? ids : []; },
            error: () => { /* network error: keep whatever cached value we already have */ }
        });
    }

    /** Display name for a member type id (from the loaded EmployeeType options). */
    memberTypeName(id: number | null | undefined): string {
        if (id == null) return '-';
        return this.allMemberTypeOptions.find((o) => o.value === id)?.label ?? '-';
    }

    /** True if an employee's member type is within the user's accessible set (no restriction when unresolved). */
    isAccessibleMemberType(id: number | null | undefined): boolean {
        if (this.allowedMemberTypeIds == null) return true;
        if (id == null) return false;
        return this.allowedMemberTypeIds.includes(id);
    }

    /** True if a saved draft's member types overlap the user's accessible set.
     *  Untagged (legacy) drafts and unresolved access are treated as visible. */
    isDraftAccessible(employeeTypeIds: string | null | undefined): boolean {
        if (this.allowedMemberTypeIds == null) return true;
        const ids = this.parseMemberTypeIds(employeeTypeIds);
        if (ids.length === 0) return true;
        const allowed = this.allowedMemberTypeIds;
        return ids.some((id) => allowed.includes(id));
    }

    /** Saved drafts limited to those whose member types the user may access (for the list table).
     *  Keeps the full `draftMastersList` intact for duplicate-check + list-no sequencing. */
    get visibleDraftMasters(): DraftPostingMasterDto[] {
        return this.draftMastersList.filter((m) => this.isDraftAccessible(m.employeeTypeIds));
    }

    /** Load active Member Types (CommonCode CodeType = 'EmployeeType') for the multi-select. */
    loadMemberTypes(): void {
        this.masterBasicSetupService.getAllByType('EmployeeType').subscribe({
            next: (data: any[]) => {
                this.allMemberTypeOptions = (data ?? [])
                    .filter((c) => c.status !== false)
                    .map((c) => ({ label: c.codeValueEN || c.codeValueBN || String(c.codeId), value: c.codeId }));
            },
            error: () => { this.allMemberTypeOptions = []; }
        });
    }

    /** Parse comma-separated "1,2,3" into a number[] for the multi-select. */
    private parseMemberTypeIds(ids: string | null | undefined): number[] {
        if (!ids) return [];
        return ids.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    }

    get isEditMode(): boolean {
        return this.editDraftId != null;
    }

    /** Display list: employees in add mode, draft details in edit mode. */
    get displayList(): (EmployeeList | DraftPostingDetailDto)[] {
        if (this.isEditMode && this.editDraft?.details) {
            return this.editDraft.details;
        }
        // Show only employees whose member type the logged-in user may access.
        return this.list.filter((r) => this.isAccessibleMemberType(r.memberTypeId));
    }

    /** Save: create Draft New Posting (add) or update master (edit). */
    onSave(): void {
        if (this.isEditMode ? !this.canUpdate : !this.canInsert) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        // Validate date
        if (!this.draftPostingDate) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select a date.' });
            return;
        }
        const dateStr = this.formatDateForApi(this.draftPostingDate);
        if (!dateStr) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Invalid date format.' });
            return;
        }

        // Validate draft posting list no
        if (!this.draftPostingListNo?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please enter Draft Posting List No.' });
            return;
        }

        // Member Type is mandatory
        if (!this.selectedMemberTypeIds || this.selectedMemberTypeIds.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select at least one Member Type.' });
            return;
        }

        // Check duplicate posting list no (skip if editing the same record)
        const trimmedNo = this.draftPostingListNo.trim();
        const duplicate = this.draftMastersList.find(
            (m) => m.draftPostingNo?.toLowerCase() === trimmedNo.toLowerCase() && m.id !== this.editDraftId
        );
        if (duplicate) {
            this.messageService.add({ severity: 'warn', summary: 'Duplicate', detail: `Draft Posting List No "${trimmedNo}" already exists.` });
            return;
        }

        const employeeTypeIds = this.selectedMemberTypeIds.join(',');

        if (this.isEditMode && this.editDraftId) {
            this.saving = true;
            this.postingService.updateDraftNewPosting(this.editDraftId, trimmedNo, dateStr, this.editDraftStatus, employeeTypeIds).subscribe({
                next: (res: { statusCode?: number; description?: string }) => {
                    this.saving = false;
                    const ok = res?.statusCode === 200;
                    this.messageService.add({
                        severity: ok ? 'success' : 'warn',
                        summary: 'Update',
                        detail: res?.description ?? (ok ? 'Draft updated.' : 'Update failed.')
                    });
                    if (ok) {
                        this.onCancelEdit();
                        this.loadDraftMasters();
                    }
                },
                error: (err: { error?: { description?: string }; message?: string }) => {
                    this.saving = false;
                    this.messageService.add({ severity: 'error', summary: 'Update', detail: err?.error?.description ?? err?.message ?? 'Failed to update.' });
                }
            });
            return;
        }

        // Validate at least one employee selected (add mode only)
        const employeeIds = this.selectedRows?.map((r) => r.employeeID) ?? [];
        if (employeeIds.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select at least one employee from the table.' });
            return;
        }

        const createdBy = this.sharedService.getCurrentUser() ?? 'system';
        this.saving = true;
        this.postingService.saveDraftNewPosting(trimmedNo, dateStr, employeeIds, createdBy, employeeTypeIds).subscribe({
            next: (res: { statusCode?: number; description?: string }) => {
                this.saving = false;
                const ok = res?.statusCode === 200;
                this.messageService.add({
                    severity: ok ? 'success' : 'warn',
                    summary: 'Save',
                    detail: res?.description ?? (ok ? 'Draft New Posting saved.' : 'Save failed.')
                });
                if (ok) {
                    this.loadData();
                    this.loadDraftMasters();
                    this.selectedRows = [];
                    this.selectedMemberTypeIds = [];
                    this.draftPostingDate = new Date();
                }
            },
            error: (err: { error?: { description?: string }; message?: string }) => {
                this.saving = false;
                this.messageService.add({ severity: 'error', summary: 'Save', detail: err?.error?.description ?? err?.message ?? 'Failed to save.' });
            }
        });
    }

    loadDraftMasters(): void {
        this.loadingMasters = true;
        this.postingService.getDraftNewPostingMasters().subscribe({
            next: (data: DraftPostingMasterDto[]) => {
                this.draftMastersList = data ?? [];
                this.loadingMasters = false;
                if (!this.isEditMode) this.generateDraftPostingListNo();
            },
            error: (err: any) => {
                this.loadingMasters = false;
            }
        });
    }

    private generateDraftPostingListNo(): void {
        const now = new Date();
        const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

        let maxSeq = 0;
        for (const m of this.draftMastersList) {
            const no = m.draftPostingNo ?? '';
            if (!no.startsWith(datePrefix + '/')) continue;
            const parts = no.substring(datePrefix.length + 1).split('/');
            const seq = parseInt(parts[0], 10);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }

        const seq = String(maxSeq + 1).padStart(3, '0');
        const rand = String(Math.floor(1000 + Math.random() * 9000));
        this.draftPostingListNo = `${datePrefix}/${seq}/${rand}`;
    }

    formatDateForApi(d: Date | null): string | null {
        if (!d) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    loadData(): void {
        this.loading = true;
        this.employeeListService.getEmployeesByIsSendingNotesheetStatus(IsSendingNotesheetStatus.Draft).subscribe({
            next: (data) => {
                this.list = data ?? [];
                this.loading = false;
            },
            error: (err) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message ?? 'Failed to load draft list' });
                this.loading = false;
            }
        });
    }

    onAddAll(): void {
        const accessible = this.list.filter((r) => this.isAccessibleMemberType(r.memberTypeId));
        if (accessible.length === 0) {
            this.messageService.add({ severity: 'info', summary: 'Select All', detail: 'No employees available to select.' });
            return;
        }
        this.selectedRows = [...accessible];
        this.messageService.add({ severity: 'success', summary: 'Select All', detail: `${accessible.length} employee(s) selected.` });
    }

    onEditDraft(row: DraftPostingMasterDto): void {
        if (!this.canUpdate) return;
        this.loading = true;
        this.postingService.getDraftNewPostingById(row.id).subscribe({
            next: (data: DraftPostingMasterWithDetailsDto) => {
                this.editDraft = data;
                this.editDraftId = data.id;
                this.draftPostingListNo = data.draftPostingNo ?? '';
                this.draftPostingDate = data.draftPostingDate ? this.parseDateFromApi(data.draftPostingDate) : null;
                this.editDraftStatus = data.draftPostingStatus ?? '';
                this.selectedMemberTypeIds = this.parseMemberTypeIds(data.employeeTypeIds);
                this.loading = false;
            },
            error: (err: { error?: { description?: string }; message?: string }) => {
                this.loading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Edit',
                    detail: err?.error?.description ?? err?.message ?? 'Failed to load draft.'
                });
            }
        });
    }

    onCancelEdit(): void {
        this.editDraftId = null;
        this.editDraft = null;
        this.editDraftStatus = '';
        this.draftPostingDate = null;
        this.draftPostingListNo = '';
        this.selectedRows = [];
        this.selectedMemberTypeIds = [];
        this.loadData();
    }

    /** Parse API date string (yyyy-MM-dd or ISO) to Date for p-datepicker. */
    parseDateFromApi(value: string): Date | null {
        if (!value?.trim()) return null;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return String(value);
        }
    }

    getDraftPostingStatusLabel(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        const opt = this.draftPostingStatusOptions.find((o) => o.value === value);
        return opt?.label ?? value;
    }

    // ─── Employee Preview Modal ────────────────────────────
    showEmployeeModal = false;
    employeeModalTitle = '';
    employeeModalList: DraftPostingDetailDto[] = [];
    employeeModalLoading = false;
    /** Master being previewed + whether its notesheet exists (removal allowed only before notesheet). */
    employeeModalMasterId: number | null = null;
    employeeModalHasNoteSheet = false;
    /** Detail id currently being removed (for per-row button loading state). */
    removingMemberId: number | null = null;

    viewEmployees(row: DraftPostingMasterDto): void {
        if (!this.canView) return;
        this.employeeModalTitle = `Employees — ${row.draftPostingNo}`;
        this.employeeModalLoading = true;
        this.showEmployeeModal = true;
        this.employeeModalList = [];
        this.employeeModalMasterId = row.id;
        this.employeeModalHasNoteSheet = !!row.hasNoteSheet;

        this.postingService.getDraftNewPostingById(row.id).subscribe({
            next: (data: DraftPostingMasterWithDetailsDto) => {
                this.employeeModalList = data?.details ?? [];
                this.employeeModalLoading = false;
            },
            error: () => {
                this.employeeModalLoading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employees.' });
            }
        });
    }

    /** Ask for confirmation before removing a member from the draft. */
    removeMember(detail: DraftPostingDetailDto): void {
        if (this.employeeModalMasterId == null || this.employeeModalHasNoteSheet || !this.canDelete) return;
        this.confirmationService.confirm({
            header: 'Remove Member',
            message: `Are you sure you want to remove ${detail.name || 'this member'} from the list?`,
            icon: 'pi pi-exclamation-triangle',
            acceptButtonProps: { label: 'Remove', severity: 'danger' },
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            accept: () => this.doRemoveMember(detail)
        });
    }

    /** Remove a member from the draft (only before notesheet). The employee returns to the
     *  "Employees with draft status" top list. */
    private doRemoveMember(detail: DraftPostingDetailDto): void {
        if (this.employeeModalMasterId == null || this.employeeModalHasNoteSheet) return;
        const masterId = this.employeeModalMasterId;
        this.removingMemberId = detail.id;
        this.postingService.removeDraftMember(masterId, detail.id, false).subscribe({
            next: (res: { statusCode?: number; description?: string }) => {
                this.removingMemberId = null;
                const ok = res?.statusCode === 200;
                this.messageService.add({
                    severity: ok ? 'success' : 'warn',
                    summary: 'Remove',
                    detail: res?.description ?? (ok ? 'Member removed.' : 'Remove failed.')
                });
                if (ok) {
                    // Refresh the modal members, the selectable top list, and the saved drafts.
                    this.postingService.getDraftNewPostingById(masterId).subscribe({
                        next: (data: DraftPostingMasterWithDetailsDto) => {
                            this.employeeModalList = data?.details ?? [];
                            if (this.employeeModalList.length === 0) this.showEmployeeModal = false;
                        }
                    });
                    this.loadData();
                    this.loadDraftMasters();
                }
            },
            error: (err: { error?: { description?: string }; message?: string }) => {
                this.removingMemberId = null;
                this.messageService.add({ severity: 'error', summary: 'Remove', detail: err?.error?.description ?? err?.message ?? 'Failed to remove.' });
            }
        });
    }
}
