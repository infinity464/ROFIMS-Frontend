import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { SelectButtonModule } from 'primeng/selectbutton';
import { AvatarModule } from 'primeng/avatar';
import { DialogModule } from 'primeng/dialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';

import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { MovementInfoService } from '@/services/movement-info.service';
import { EmpService } from '@/services/emp-service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { SharedService } from '@/shared/services/shared-service';
import { UserMenuService } from '@/services/user-menu.service';

import { MovementInfoModel } from '@/models/movement-info.model';
import { CommonCodeModel } from '@/models/common-code-model';
import {
    MovementType, MovementTypeOptions,
    MoveOrderType, MoveOrderTypeOptions,
    Article47LetterRecipientOptions
} from '@/models/enums';

interface MovementEmployeeRow {
    employeeID: number;
    rabid: string;
    serviceId: string;
    fullNameEN: string;
    rankDisplay?: string;
    corpsDisplay?: string;
    tradeDisplay?: string;
    motherOrganizationDisplay?: string;
    memberTypeDisplay?: string;
    unit?: number | null;
}

@Component({
    selector: 'app-movement-info',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        SelectModule,
        DatePickerModule,
        TableModule,
        TooltipModule,
        SelectButtonModule,
        AvatarModule,
        DialogModule,
        MultiSelectModule,
        Toast,
        ConfirmDialog,
        EmployeeSearchComponent,
        RichEditorComponent,
        FlexibleDateDirective
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './movement-info.html',
    styleUrl: './movement-info.scss'
})
export class MovementInfoComponent implements OnInit {
    private fb = inject(FormBuilder);
    private movementService = inject(MovementInfoService);
    private commonCodeService = inject(CommonCodeService);
    private masterBasicSetup = inject(MasterBasicSetupService);
    private organizationService = inject(OrganizationService);
    private empService = inject(EmpService);
    private identityMappingService = inject(IdentityUserMappingService);
    private sharedService = inject(SharedService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private userMenuService = inject(UserMenuService);
    private router = inject(Router);

    canInsert = true;
    canUpdate = true;
    canDelete = true;
    saving = false;

    form!: FormGroup;
    editingId: number | null = null;

    selectedEmployees: MovementEmployeeRow[] = [];
    showAllEmployees = false;
    takeoverPerson: EmployeeBasicInfo | null = null;

    // Add Reason dialog state
    showAddReasonDialog = false;
    newReasonNameEN = '';
    newReasonNameBN = '';
    isSavingReason = false;

    movementTypeOptions = MovementTypeOptions;
    moveOrderTypeOptions = MoveOrderTypeOptions;
    movementReasonOptions: { label: string; value: number }[] = [];
    motherUnitOptions: { label: string; value: number }[] = [];
    rabUnitOptions: { label: string; value: number }[] = [];
    approverOptions: { label: string; value: number }[] = [];

    /** Free-form list of Article 47 letter recipients (one line each).
     *  Pre-populated with the enum labels on Article 47 selection; editable thereafter. */
    letterRecipientsList: string[] = [];
    joiningLeaveOptions = [
        { label: 'Yes', value: true },
        { label: 'No', value: false }
    ];
    destinedUnitOptions = [
        { label: 'Mother Unit', value: 'mother' },
        { label: 'RAB Unit', value: 'rab' }
    ];

    readonly MovementType = MovementType;
    readonly MoveOrderType = MoveOrderType;

    getInitials(name: string | null | undefined): string {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    private readonly _avatarPalette = [
        { bg: 'rgba(99,102,241,.18)',  fg: '#818cf8' }, // indigo
        { bg: 'rgba(34,197,94,.18)',   fg: '#4ade80' }, // green
        { bg: 'rgba(236,72,153,.18)',  fg: '#f472b6' }, // pink
        { bg: 'rgba(245,158,11,.18)',  fg: '#fbbf24' }, // amber
        { bg: 'rgba(14,165,233,.18)',  fg: '#38bdf8' }, // sky
        { bg: 'rgba(168,85,247,.18)',  fg: '#c084fc' }  // purple
    ];

    getAvatarStyle(employeeId: number): { background: string; color: string } {
        const c = this._avatarPalette[Math.abs(employeeId) % this._avatarPalette.length];
        return { background: c.bg, color: c.fg };
    }

    ngOnInit(): void {
        const _perms = this.userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.initForm();
        this.loadDropdowns();
    }

    private initForm() {
        this.form = this.fb.group({
            movementType: [null, Validators.required],
            moveOrderType: [null, Validators.required],
            movementReasonId: [null],
            currentUnitId: [null],
            destinedUnitTarget: ['mother'],
            destinedMotherUnitId: [null, Validators.required],
            destinedRABUnitId: [null],
            dateOfRelease: [null],
            dateOfReduce: [null],
            takeoverDate: [null],
            handoverDate: [null],
            isJoiningLeave: [false],
            joiningLeaveFrom: [null],
            joiningLeaveTo: [null],
            auth: [null],
            detailsInformation: [null],
            remarks: [null],
            finalApproverIds: [[] as number[]],
            status: [true]
        });

        // Reset conditional fields when their gating values change
        this.form.get('movementType')!.valueChanges.subscribe((v) => this.onMovementTypeChange(v));
        this.form.get('moveOrderType')!.valueChanges.subscribe(() => this.onMoveOrderTypeChange());
        this.form.get('isJoiningLeave')!.valueChanges.subscribe((v) => this.onIsJoiningLeaveChange(v));
        this.form.get('destinedUnitTarget')!.valueChanges.subscribe((v) => this.onDestinedUnitTargetChange(v));
    }

    private onDestinedUnitTargetChange(target: 'mother' | 'rab') {
        const motherCtrl = this.form.get('destinedMotherUnitId')!;
        const rabCtrl = this.form.get('destinedRABUnitId')!;
        if (target === 'mother') {
            motherCtrl.setValidators(Validators.required);
            rabCtrl.clearValidators();
            rabCtrl.setValue(null, { emitEvent: false });
        } else {
            rabCtrl.setValidators(Validators.required);
            motherCtrl.clearValidators();
            motherCtrl.setValue(null, { emitEvent: false });
        }
        motherCtrl.updateValueAndValidity({ emitEvent: false });
        rabCtrl.updateValueAndValidity({ emitEvent: false });
    }

    private loadDropdowns() {
        this.commonCodeService.getAllActiveCommonCodesType('MovementReason').subscribe({
            next: (rows: CommonCodeModel[]) => {
                this.movementReasonOptions = (rows || []).map((r) => ({
                    label: r.codeValueEN,
                    value: r.codeId
                }));
            }
        });

        this.organizationService.GetAllOrgUnit().subscribe({
            next: (rows) => {
                this.motherUnitOptions = (rows || []).map((r) => ({
                    label: r.orgNameEN,
                    value: r.orgId
                }));
            }
        });

        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (rows) => {
                this.rabUnitOptions = (rows || []).map((r) => ({
                    label: r.codeValueEN,
                    value: r.codeId
                }));
            }
        });

        // Final Approver options = employees who have an Identity user account
        // (mirrors the pattern in /leave-application/apply so the chosen approver
        // can actually log in and act on the movement).
        this.identityMappingService.getMappings().subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.approverOptions = arr
                    .map((m: any) => {
                        const empId = m.employeeId ?? m.EmployeeId;
                        if (!empId || empId <= 0) return null;
                        const name = m.employeeName ?? m.EmployeeName ?? '';
                        const rabId = m.rabID ?? m.RABID ?? '';
                        const serviceId = m.serviceId ?? m.ServiceId ?? '';
                        const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                        return {
                            label: parts.join(' | ') || `Employee #${empId}`,
                            value: empId as number
                        };
                    })
                    .filter((o): o is { label: string; value: number } => o !== null)
                    .sort((a, b) => a.label.localeCompare(b.label));
            }
        });
    }

    // ── Employee selection ────────────────────────────────────────────────
    onEmployeeSelected(emp: EmployeeBasicInfo | null) {
        if (!emp) return;
        if (this.selectedEmployees.some((e) => e.employeeID === emp.employeeID)) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Already added',
                detail: `${emp.fullNameEN} is already in the list.`
            });
            return;
        }
        // Article 47 (Handover or Takeover) permits only one employee on the letter.
        if (this.isArticle47Variant && this.selectedEmployees.length >= 1) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Only one employee allowed',
                detail: 'Article 47 movements support a single employee. Remove the current entry to add another.'
            });
            return;
        }
        this.selectedEmployees = [
            ...this.selectedEmployees,
            {
                employeeID: emp.employeeID,
                rabid: emp.rabid,
                serviceId: emp.serviceId,
                fullNameEN: emp.fullNameEN,
                rankDisplay: emp.rankDisplay,
                corpsDisplay: emp.corpsDisplay,
                tradeDisplay: emp.tradeDisplay,
                motherOrganizationDisplay: emp.motherOrganizationDisplay,
                memberTypeDisplay: emp.memberTypeDisplay,
                unit: null
            }
        ];
        this.syncCurrentUnitFromEmployees();

        // Fetch the employee's current Mother Unit (lastMotherUnitId) — same source as
        // /presently-serving-members — and store it on the row so currentUnitId stays in sync.
        this.empService.getEmployeeSearchInfo(emp.employeeID).subscribe({
            next: (info) => {
                if (!info) return;
                const motherUnitId =
                    (info as any).lastMotherUnitId ??
                    (info as any).LastMotherUnitId ??
                    null;
                const row = this.selectedEmployees.find((e) => e.employeeID === emp.employeeID);
                if (row) {
                    row.unit = motherUnitId;
                    this.syncCurrentUnitFromEmployees();
                }
            }
        });
    }

    removeEmployee(row: MovementEmployeeRow) {
        this.selectedEmployees = this.selectedEmployees.filter((e) => e.employeeID !== row.employeeID);
        this.syncCurrentUnitFromEmployees();
    }

    /** Current unit = first selected employee's RAB unit. Auto-syncs on add/remove. */
    private syncCurrentUnitFromEmployees() {
        const firstUnit = this.selectedEmployees[0]?.unit ?? null;
        this.form.patchValue({ currentUnitId: firstUnit }, { emitEvent: false });
    }

    onTakeoverPersonSelected(emp: EmployeeBasicInfo | null) {
        this.takeoverPerson = emp;
    }

    // ── Add Reason on the fly ─────────────────────────────────────────────
    openAddReasonDialog() {
        this.newReasonNameEN = '';
        this.newReasonNameBN = '';
        this.isSavingReason = false;
        this.showAddReasonDialog = true;
    }

    saveNewReason() {
        const en = (this.newReasonNameEN || '').trim();
        if (!en) return;

        const bn = (this.newReasonNameBN || '').trim();
        const currentUser = this.sharedService.getCurrentUser();
        const now = this.sharedService.getCurrentDateTime();

        const payload: any = {
            orgId: 0,
            codeId: 0,
            codeType: 'MovementReason',
            codeValueEN: en,
            codeValueBN: bn || null,
            commCode: null,
            displayCodeValueEN: null,
            displayCodeValueBN: null,
            status: true,
            parentCodeId: null,
            sortOrder: null,
            level: null,
            createdBy: currentUser,
            createdDate: now,
            lastUpdatedBy: currentUser,
            lastupdate: now
        };

        this.isSavingReason = true;
        this.masterBasicSetup.create(payload).subscribe({
            next: () => {
                this.commonCodeService.getAllActiveCommonCodesType('MovementReason').subscribe({
                    next: (rows: CommonCodeModel[]) => {
                        this.movementReasonOptions = (rows || []).map((r) => ({
                            label: r.codeValueEN,
                            value: r.codeId
                        }));
                        const match = this.movementReasonOptions.find((o) => o.label === en);
                        if (match) {
                            this.form.patchValue({ movementReasonId: match.value });
                        }
                        this.isSavingReason = false;
                        this.showAddReasonDialog = false;
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Saved',
                            detail: 'Movement reason added.'
                        });
                    },
                    error: () => {
                        this.isSavingReason = false;
                        this.showAddReasonDialog = false;
                    }
                });
            },
            error: (err) => {
                console.error('Save reason failed', err);
                this.isSavingReason = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to save movement reason.'
                });
            }
        });
    }

    // ── Conditional logic ─────────────────────────────────────────────────
    get isPermanent(): boolean {
        return this.form?.get('movementType')!.value === MovementType.Permanent;
    }
    get isArticle47Handover(): boolean {
        return this.form?.get('moveOrderType')!.value === MoveOrderType.Article47Handover;
    }
    get isArticle47Takeover(): boolean {
        return this.form?.get('moveOrderType')!.value === MoveOrderType.Article47Takeover;
    }
    get isArticle47Variant(): boolean {
        return this.isArticle47Handover || this.isArticle47Takeover;
    }
    /** Show Handover-of-charge field — Permanent + Article 47 (Handover). */
    get showHandover(): boolean {
        return this.isPermanent && this.isArticle47Handover;
    }
    /** Show Takeover-of-charge field + Takeover Person — Permanent + Article 47 (Takeover). */
    get showTakeover(): boolean {
        return this.isPermanent && this.isArticle47Takeover;
    }
    /** Show the Letter Recipients picker for any Article 47 variant. */
    get showLetterRecipients(): boolean {
        return this.isArticle47Handover || this.isArticle47Takeover;
    }
    get showDateOfReduce(): boolean {
        return this.isPermanent;
    }
    get showJoiningLeaveDates(): boolean {
        return !!this.form?.get('isJoiningLeave')!.value;
    }

    private onMovementTypeChange(_v: number | null) {
        if (!this.isPermanent) {
            this.form.patchValue({ dateOfReduce: null, takeoverDate: null, handoverDate: null });
            this.takeoverPerson = null;
        }
    }
    private onMoveOrderTypeChange() {
        if (!this.showHandover) {
            this.form.patchValue({ handoverDate: null });
        }
        if (!this.showTakeover) {
            this.form.patchValue({ takeoverDate: null });
            this.takeoverPerson = null;
        }
        // Article 47 supports only one employee — drop extras (keep the first) on switch in.
        if (this.isArticle47Variant && this.selectedEmployees.length > 1) {
            this.selectedEmployees = this.selectedEmployees.slice(0, 1);
            this.syncCurrentUnitFromEmployees();
            this.messageService.add({
                severity: 'info',
                summary: 'Trimmed to one employee',
                detail: 'Article 47 movements support a single employee. Extra entries were removed.'
            });
        }
        if (this.showLetterRecipients) {
            if (this.letterRecipientsList.length === 0) {
                // Pre-fill with the enum labels in sortOrder.
                this.letterRecipientsList = Article47LetterRecipientOptions
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((o) => o.label);
            }
        } else {
            this.letterRecipientsList = [];
        }
    }

    addLetterRecipient(): void {
        this.letterRecipientsList.push('');
    }

    removeLetterRecipient(index: number): void {
        if (index >= 0 && index < this.letterRecipientsList.length) {
            this.letterRecipientsList.splice(index, 1);
        }
    }

    /** Swap a recipient with its neighbour. direction = -1 (up) or +1 (down). */
    moveLetterRecipient(index: number, direction: -1 | 1): void {
        const target = index + direction;
        if (target < 0 || target >= this.letterRecipientsList.length) return;
        const list = this.letterRecipientsList;
        [list[index], list[target]] = [list[target], list[index]];
    }

    trackByIndex = (index: number): number => index;
    private onIsJoiningLeaveChange(v: boolean) {
        if (!v) {
            this.form.patchValue({ joiningLeaveFrom: null, joiningLeaveTo: null });
        }
    }

    // ── Submit ────────────────────────────────────────────────────────────
    submit() {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.messageService.add({
                severity: 'error',
                summary: 'Validation',
                detail: 'Please fill all required fields.'
            });
            return;
        }
        if (this.selectedEmployees.length === 0) {
            this.messageService.add({
                severity: 'error',
                summary: 'No employees',
                detail: 'Please add at least one employee.'
            });
            return;
        }
        if (this.showTakeover && !this.takeoverPerson) {
            this.messageService.add({
                severity: 'error',
                summary: 'Takeover Person',
                detail: 'Article 47 (Takeover) permanent movements require a Takeover Person.'
            });
            return;
        }

        const finalApproverIds: number[] = (this.form.get('finalApproverIds')?.value as number[] | null) ?? [];

        const v = this.form.value;
        const currentUser = this.sharedService.getCurrentUser();
        const now = this.sharedService.getCurrentDateTime();

        const payload: MovementInfoModel = {
            movementId: this.editingId ?? 0,
            letterNo: null,
            letterDate: null,
            employeeIds: JSON.stringify(this.selectedEmployees.map((e) => e.employeeID)),
            finalApproverIds: finalApproverIds.length > 0 ? JSON.stringify(finalApproverIds) : null,
            letterRecipients: this.serialiseLetterRecipients(),
            movementType: v.movementType,
            moveOrderType: v.moveOrderType,
            movementReasonId: v.movementReasonId ?? null,
            currentUnitId: v.currentUnitId ?? null,
            destinedMotherUnitId: v.destinedMotherUnitId ?? null,
            destinedRABUnitId: v.destinedRABUnitId ?? null,
            dateOfRelease: this.toIsoDate(v.dateOfRelease),
            dateOfReduce: this.toIsoDate(v.dateOfReduce),
            takeoverDate: this.toIsoDate(v.takeoverDate),
            handoverDate: this.toIsoDate(v.handoverDate),
            takeoverPersonEmpId: this.takeoverPerson?.employeeID ?? null,
            isJoiningLeave: !!v.isJoiningLeave,
            joiningLeaveFrom: this.toIsoDate(v.joiningLeaveFrom),
            joiningLeaveTo: this.toIsoDate(v.joiningLeaveTo),
            auth: v.auth ?? null,
            detailsInformation: v.detailsInformation ?? null,
            remarks: v.remarks ?? null,
            status: v.status ?? true,
            createdBy: currentUser,
            createdDate: now,
            lastUpdatedBy: currentUser,
            lastupdate: now
        };

        this.saving = true;
        const call$ = this.editingId
            ? this.movementService.update(payload)
            : this.movementService.save(payload);

        call$.subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Saved',
                    detail: 'Movement saved successfully.'
                });
                this.saving = false;
                this.resetForm();
            },
            error: (err) => {
                console.error('Movement save failed', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to save movement.'
                });
                this.saving = false;
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.selectedEmployees = [];
        this.takeoverPerson = null;
        this.letterRecipientsList = [];
        this.form.reset({
            movementType: null,
            moveOrderType: null,
            movementReasonId: null,
            currentUnitId: null,
            destinedUnitTarget: 'mother',
            destinedMotherUnitId: null,
            destinedRABUnitId: null,
            dateOfRelease: null,
            dateOfReduce: null,
            takeoverDate: null,
            handoverDate: null,
            isJoiningLeave: false,
            joiningLeaveFrom: null,
            joiningLeaveTo: null,
            auth: null,
            detailsInformation: null,
            remarks: null,
            finalApproverIds: [],
            status: true
        });
    }

    /** Serialise the letter-recipient list as a JSON array of trimmed, non-empty strings.
     *  Order in the array == print order in the generated letter. */
    private serialiseLetterRecipients(): string | null {
        if (!this.showLetterRecipients) return null;
        const lines = (this.letterRecipientsList || [])
            .map((s) => (s ?? '').trim())
            .filter((s) => s.length > 0);
        if (lines.length === 0) return null;
        return JSON.stringify(lines);
    }

    private toIsoDate(d: Date | string | null | undefined): string | null {
        if (!d) return null;
        if (typeof d === 'string') return d;
        const yyyy = d.getFullYear();
        const mm = `${d.getMonth() + 1}`.padStart(2, '0');
        const dd = `${d.getDate()}`.padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
}
