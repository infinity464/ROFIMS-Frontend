import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

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
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { forkJoin, from } from 'rxjs';
import { concatMap, toArray } from 'rxjs/operators';

import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { MovementInfoService } from '@/services/movement-info.service';
import { EmpService } from '@/services/emp-service';
import { PostingService } from '@/services/posting.service';
import { PendingPostingJoiningDto } from '@/models/posting.model';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { SharedService } from '@/shared/services/shared-service';
import { UserMenuService } from '@/services/user-menu.service';

import { MovementInfoModel } from '@/models/movement-info.model';
import { CommonCodeModel } from '@/models/common-code-model';
import {
    MovementType, MovementTypeOptions,
    MoveOrderType, MoveOrderTypeOptions,
    Article47LetterRecipientOptions,
    MOLetterRecipientOptions,
    MovementVehicleOptions,
    MovementPostOutTypeOptions
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
        FileReferencesFormComponent,
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
    private postingService = inject(PostingService);
    private identityMappingService = inject(IdentityUserMappingService);
    private sharedService = inject(SharedService);
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private userMenuService = inject(UserMenuService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    canInsert = true;
    canUpdate = true;
    canDelete = true;
    saving = false;

    form!: FormGroup;
    editingId: number | null = null;
    /** LetterNo loaded from the existing row during edit — preserved on update. */
    private editingLetterNo: string | null = null;
    /** PublicToken loaded from the existing row during edit — preserved on update;
     *  backend generates a fresh token on insert when this is null. */
    private editingPublicToken: string | null = null;

    selectedEmployees: MovementEmployeeRow[] = [];
    showAllEmployees = false;
    takeoverPerson: EmployeeBasicInfo | null = null;

    /** Attached-files state (multi-file uploader). */
    @ViewChild('filesForm') filesForm!: FileReferencesFormComponent;
    fileRows: FileRowData[] = [];
    onFilesChange(rows: FileRowData[]): void {
        this.fileRows = rows;
    }
    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err: any) => this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.error?.message || 'Failed to download file.'
            })
        });
    }

    // Add Reason dialog state
    showAddReasonDialog = false;
    newReasonNameEN = '';
    newReasonNameBN = '';
    isSavingReason = false;

    movementTypeOptions = MovementTypeOptions;
    moveOrderTypeOptions = MoveOrderTypeOptions;
    movementVehicleOptions = MovementVehicleOptions;
    postOutTypeOptions = MovementPostOutTypeOptions;
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

    /** True when opened from pending-posting-joining: Movement type + Order type
     *  are pre-filled and locked. */
    lockOrderFields = false;

    /** True when a searched member was found on a pending posting list: Movement
     *  type is locked to Permanent (Order type stays selectable). */
    lockMovementType = false;

    /** True when the destined unit is known from the redirect — the Destination
     *  section is hidden and each record's RAB unit comes from prefilledUnits. */
    hideDestination = false;

    /** employeeId → destined RAB unit id, handed over from pending-posting-joining. */
    prefilledUnits: Record<number, number> | null = null;

    /** employeeId → TOP-LEVEL RAB unit name for display. The ids in prefilledUnits
     *  can be different sub-units of the same RAB unit, so mixed-unit detection and
     *  the Transfer Unit column/banner go by this name when available. */
    prefilledUnitNames: Record<number, string> | null = null;

    /** employeeId → source references from the New-Posting flow:
     *  f = current (from) RAB unit, n = notesheet id, o = posting order id. */
    prefilledContext: Record<number, { f: number | null; n: number | null; o: number | null }> | null = null;

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

        // Edit mode: ?id=N in the URL → load that MovementInfo and patch the form.
        const idParam = this.route.snapshot.queryParamMap.get('id');
        const id = idParam ? Number(idParam) : NaN;
        if (Number.isFinite(id) && id > 0) {
            this.loadExistingMovement(id);
        } else {
            // Prefill mode: employees + order type handed over from another screen
            // (e.g. the pending-posting-joining "Movement" action).
            this.prefillFromQueryParams();
        }
    }

    /** Non-edit entry: preselect the Order type and hydrate any employees passed
     *  via ?moveOrderType=N&employeeIds=[..] query params. */
    private prefillFromQueryParams(): void {
        const qp = this.route.snapshot.queryParamMap;

        const orderTypeParam = qp.get('moveOrderType');
        const orderType = orderTypeParam ? Number(orderTypeParam) : NaN;
        if (Number.isFinite(orderType) && orderType > 0) {
            // Coming from pending-posting-joining: movement is always Permanent,
            // and both Movement type + Order type are locked to what was chosen there.
            this.form.patchValue({
                movementType: MovementType.Permanent,
                moveOrderType: orderType
            });
            this.lockOrderFields = true;
        }

        // Transfer destination is a known RAB unit, per member. Hide the
        // Destination section; each record's destined unit is stamped from the
        // map at submit time.
        this.prefilledUnits = this.parseUnitMap(qp.get('unitMap'));
        const namesParam = qp.get('unitNames');
        if (namesParam) {
            try {
                const obj = JSON.parse(namesParam);
                this.prefilledUnitNames = obj && typeof obj === 'object' ? obj : null;
            } catch {
                this.prefilledUnitNames = null;
            }
        }
        if (this.prefilledUnits) {
            this.hideDestination = true;
            // No single destined unit to validate — units are supplied per record.
            this.form.patchValue({ destinedUnitTarget: 'rab', destinedMotherUnitId: null });
            const motherCtrl = this.form.get('destinedMotherUnitId')!;
            const rabCtrl = this.form.get('destinedRABUnitId')!;
            motherCtrl.clearValidators();
            rabCtrl.clearValidators();
            motherCtrl.updateValueAndValidity({ emitEvent: false });
            rabCtrl.updateValueAndValidity({ emitEvent: false });
        }

        // Per-member source references (current RAB unit, notesheet, posting order).
        const ctxParam = qp.get('postingContext');
        if (ctxParam) {
            try {
                const obj = JSON.parse(ctxParam);
                this.prefilledContext = obj && typeof obj === 'object' ? obj : null;
            } catch {
                this.prefilledContext = null;
            }
        }

        const empIds = this.parseIntJsonArray(qp.get('employeeIds'));
        for (const empId of empIds) {
            this.hydrateEmployeeRow(empId);
        }
    }

    /** Load an existing MovementInfo row by id and patch every part of the form
     *  (scalar fields, dates, selected employees, takeover person, letter recipients,
     *  final approvers, destined-unit toggle). */
    private loadExistingMovement(id: number): void {
        this.editingId = id;
        this.movementService.getById(id).subscribe({
            next: (data) => {
                const row: any = Array.isArray(data) ? data[0] : data;
                if (!row || !row.movementId) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Not found',
                        detail: `Movement #${id} could not be loaded.`
                    });
                    this.editingId = null;
                    return;
                }
                this.patchFromMovement(row);
            },
            error: (err) => {
                console.error('Failed to load movement for edit', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load movement for edit.'
                });
                this.editingId = null;
            }
        });
    }

    private patchFromMovement(row: any): void {
        // Preserve the existing LetterNo so update doesn't wipe it.
        this.editingLetterNo = (row.letterNo ?? null) as string | null;
        // Preserve the existing PublicToken so the QR-code URL stays stable on update.
        this.editingPublicToken = (row.publicToken ?? null) as string | null;

        // Choose which destined unit is in use based on whichever id is populated.
        const target: 'mother' | 'rab' = row.destinedRABUnitId != null ? 'rab' : 'mother';

        this.form.patchValue({
            movementType: row.movementType ?? null,
            moveOrderType: row.moveOrderType ?? null,
            movementReasonId: row.movementReasonId ?? null,
            currentUnitId: row.currentUnitId ?? null,
            destinedUnitTarget: target,
            destinedMotherUnitId: row.destinedMotherUnitId ?? null,
            destinedRABUnitId: row.destinedRABUnitId ?? null,
            postOutStatusType: row.postOutStatusType ?? null,
            dateOfRelease: this.toDate(row.dateOfRelease),
            dateOfReduce: this.toDate(row.dateOfReduce),
            takeoverDate: this.toDate(row.takeoverDate),
            handoverDate: this.toDate(row.handoverDate),
            isJoiningLeave: !!row.isJoiningLeave,
            joiningLeaveFrom: this.toDate(row.joiningLeaveFrom),
            joiningLeaveTo: this.toDate(row.joiningLeaveTo),
            lastRationCertificate: row.lastRationCertificate ?? null,
            payAndAllowance:       row.payAndAllowance       ?? null,
            railwayWarrant:        row.railwayWarrant        ?? null,
            releaseTime:           row.releaseTime           ?? null,
            vehicle:               row.vehicle               ?? null,
            auth: row.auth ?? null,
            detailsInformation: row.detailsInformation ?? null,
            remarks: row.remarks ?? null,
            finalApproverIds: this.parseIntJsonArray(row.finalApproverIds),
            letterDate: this.toDate(row.letterDate) ?? new Date(),
            status: row.status ?? true
        });

        // Letter Recipients are stored as JSON array of strings.
        this.letterRecipientsList = this.parseStringJsonArray(row.letterRecipients);

        // Files — JSON array of { fileId, fileName } → seed the FileReferencesForm rows.
        this.fileRows = this.parseFileReferences(row.filesReferences);

        // Employees: rehydrate each row from EmployeeSearchInfo + EmpModel.
        const empIds = this.parseIntJsonArray(row.employeeIds);
        this.selectedEmployees = [];
        for (const empId of empIds) {
            this.hydrateEmployeeRow(empId);
        }

        // Takeover person if any.
        if (row.takeoverPersonEmpId) {
            this.hydrateTakeoverPerson(row.takeoverPersonEmpId);
        }
    }

    /** Case-insensitive property lookup — GetEmployeeSearchInfo serializes some
     *  fields (e.g. all-caps RABID) in a casing that doesn't match either camelCase
     *  or PascalCase spellings, so match on a lowercased key. */
    private pick(info: any, ...keys: string[]): any {
        if (!info) return undefined;
        const wanted = new Set(keys.map((k) => k.toLowerCase()));
        for (const key of Object.keys(info)) {
            if (wanted.has(key.toLowerCase())) return info[key];
        }
        return undefined;
    }

    private hydrateEmployeeRow(empId: number): void {
        this.empService.getEmployeeSearchInfo(empId).subscribe({
            next: (info: any) => {
                if (!info) return;
                if (this.selectedEmployees.some((e) => e.employeeID === empId)) return;
                this.selectedEmployees = [
                    ...this.selectedEmployees,
                    {
                        employeeID: empId,
                        rabid: this.pick(info, 'rabID', 'RABID') ?? '',
                        serviceId: this.pick(info, 'serviceId') ?? '',
                        fullNameEN: this.pick(info, 'fullNameEN') ?? '',
                        rankDisplay: this.pick(info, 'rank'),
                        corpsDisplay: this.pick(info, 'corps'),
                        tradeDisplay: this.pick(info, 'trade'),
                        motherOrganizationDisplay: this.pick(info, 'motherOrganization'),
                        memberTypeDisplay: this.pick(info, 'memberType'),
                        unit: this.pick(info, 'lastMotherUnitId') ?? null
                    }
                ];
                this.syncCurrentUnitFromEmployees();
            }
        });
    }

    private hydrateTakeoverPerson(empId: number): void {
        this.empService.getEmployeeSearchInfo(empId).subscribe({
            next: (info: any) => {
                if (!info) return;
                this.takeoverPerson = {
                    employeeID: empId,
                    rabid: this.pick(info, 'rabID', 'RABID') ?? '',
                    serviceId: this.pick(info, 'serviceId') ?? '',
                    fullNameEN: this.pick(info, 'fullNameEN') ?? '',
                    rankDisplay: this.pick(info, 'rank'),
                    corpsDisplay: this.pick(info, 'corps'),
                    tradeDisplay: this.pick(info, 'trade'),
                    motherOrganizationDisplay: this.pick(info, 'motherOrganization'),
                    memberTypeDisplay: this.pick(info, 'memberType'),
                    unit: this.pick(info, 'lastMotherUnitId') ?? null
                } as EmployeeBasicInfo;
            }
        });
    }

    /** Parse the employeeId → unitId map passed as a JSON query param. */
    private parseUnitMap(json: string | null | undefined): Record<number, number> | null {
        if (!json) return null;
        try {
            const obj = JSON.parse(json);
            if (!obj || typeof obj !== 'object') return null;
            const map: Record<number, number> = {};
            for (const [k, val] of Object.entries(obj)) {
                const empId = Number(k);
                const unitId = Number(val);
                if (Number.isInteger(empId) && Number.isInteger(unitId)) map[empId] = unitId;
            }
            return Object.keys(map).length ? map : null;
        } catch {
            return null;
        }
    }

    private parseIntJsonArray(json: string | null | undefined): number[] {
        if (!json) return [];
        try {
            const arr = JSON.parse(json);
            return Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : [];
        } catch {
            return [];
        }
    }

    private parseStringJsonArray(json: string | null | undefined): string[] {
        if (!json) return [];
        try {
            const arr = JSON.parse(json);
            return Array.isArray(arr)
                ? arr.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0)
                : [];
        } catch {
            return [];
        }
    }

    /** Parse a JSON array of { fileId, fileName } (any casing) into FileRowData rows
     *  consumable by the FileReferencesFormComponent. */
    private parseFileReferences(json: string | null | undefined): FileRowData[] {
        if (!json) return [];
        try {
            const arr = JSON.parse(json);
            if (!Array.isArray(arr)) return [];
            return arr
                .map((r: any) => {
                    const fileId = r?.fileId ?? r?.FileId;
                    const fileName = (r?.fileName ?? r?.FileName ?? '') as string;
                    if (fileId == null) return null;
                    return { displayName: fileName, file: null, fileId } as FileRowData;
                })
                .filter((row): row is FileRowData => row !== null);
        } catch {
            return [];
        }
    }

    private toDate(value: string | null | undefined): Date | null {
        if (!value) return null;
        // ISO yyyy-MM-dd or full ISO datetime — Date constructor handles both
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
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
            // Permanent + Mother Unit only: which present-status posted-out members get.
            postOutStatusType: [null],
            dateOfRelease: [null],
            dateOfReduce: [null],
            takeoverDate: [null],
            handoverDate: [null],
            isJoiningLeave: [false],
            joiningLeaveFrom: [null],
            joiningLeaveTo: [null],
            // MO-only fields (free text).
            lastRationCertificate: [null],
            payAndAllowance: [null],
            railwayWarrant: [null],
            // CC-only fields.
            releaseTime: [null],
            vehicle: [null],
            auth: [null],
            detailsInformation: [null],
            remarks: [null],
            finalApproverIds: [[] as number[]],
            // "Approval date" UI field — persisted to MovementInfo.letterDate. Defaults to today.
            letterDate: [new Date()],
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
                    label: r.codeValueBN || '',
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
                        const rank = m.rank ?? m.Rank ?? '';
                        const appointment = m.appointment ?? m.Appointment ?? '';
                        // Rank Name (Appointment) | SVC | RAB
                        let head = [rank, name].filter(Boolean).join(' ');
                        if (appointment) head = head ? `${head} (${appointment})` : `(${appointment})`;
                        const parts = [head, serviceId ? `SVC: ${serviceId}` : '', rabId ? `RAB: ${rabId}` : ''].filter(Boolean);
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

        // Check the pending-joining lists (New + Inter posting). A member found
        // there gets the pending-posting handover applied automatically; one who
        // already has an (un-received) movement is blocked.
        this.postingService.getPendingJoiningByEmployee(emp.employeeID).subscribe({
            next: (rows) => {
                const pending = (rows ?? [])[0] ?? null;
                if (pending) {
                    if (pending.movementId != null) {
                        this.messageService.add({
                            severity: 'warn',
                            summary: 'Movement already generated',
                            detail: `${emp.fullNameEN} already has a movement order for their pending posting (not yet received). Receive it or cancel it before creating another.`
                        });
                        return;
                    }
                    if (this.selectedEmployees.length > 0 && !this.prefilledUnits) {
                        this.messageService.add({
                            severity: 'warn',
                            summary: 'Cannot mix members',
                            detail: `${emp.fullNameEN} is on a pending posting list. Members from pending postings cannot be mixed with others in one movement.`
                        });
                        return;
                    }
                    this.addEmployeeToList(emp);
                    this.applyPendingHandover(emp.employeeID, pending);
                } else {
                    if (this.prefilledUnits && !this.lockOrderFields) {
                        this.messageService.add({
                            severity: 'warn',
                            summary: 'Cannot mix members',
                            detail: `${emp.fullNameEN} is not on a pending posting list. Members from pending postings cannot be mixed with others in one movement.`
                        });
                        return;
                    }
                    this.addEmployeeToList(emp);
                }
            },
            // Lookup failure must not block manual entry — behave as before.
            error: () => this.addEmployeeToList(emp)
        });
    }

    /** Plain add of a searched employee to the personnel list. */
    private addEmployeeToList(emp: EmployeeBasicInfo): void {
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
                const motherUnitId = this.pick(info, 'lastMotherUnitId') ?? null;
                const row = this.selectedEmployees.find((e) => e.employeeID === emp.employeeID);
                if (row) {
                    row.unit = motherUnitId;
                    this.syncCurrentUnitFromEmployees();
                }
            }
        });
    }

    /** The searched member sits on a pending posting list: lock Movement type to
     *  Permanent, hide the Destination section, and stamp the pending row's
     *  transfer unit / current unit / notesheet / posting order onto the record —
     *  identical to arriving via the pending page's Movement button. */
    private applyPendingHandover(employeeId: number, pending: PendingPostingJoiningDto): void {
        this.prefilledUnits = { ...(this.prefilledUnits ?? {}) };
        if (pending.transferRabUnitId != null) {
            this.prefilledUnits[employeeId] = pending.transferRabUnitId;
        }
        if (pending.transferRabUnitName) {
            this.prefilledUnitNames = { ...(this.prefilledUnitNames ?? {}) };
            this.prefilledUnitNames[employeeId] = pending.transferRabUnitName;
        }
        this.prefilledContext = { ...(this.prefilledContext ?? {}) };
        this.prefilledContext[employeeId] = {
            f: pending.fromRabUnitId ?? null,
            n: pending.noteSheetId ?? null,
            o: pending.postingOrderMasterId ?? null
        };

        this.hideDestination = true;
        this.lockMovementType = true;
        this.form.patchValue({
            movementType: MovementType.Permanent,
            destinedUnitTarget: 'rab',
            destinedMotherUnitId: null
        });
        this.clearDestinationValidators();

        this.messageService.add({
            severity: 'info',
            summary: 'Pending posting member',
            detail: `${pending.fullNameEN || 'Member'} is on the pending ${pending.postingType === 'InterPosting' ? 'inter-' : ''}posting list — destination set to ${pending.transferRabUnitName || 'the posting\'s transfer unit'}.`
        });
    }

    /** Units are supplied per record — no single destined unit to validate. */
    private clearDestinationValidators(): void {
        const motherCtrl = this.form.get('destinedMotherUnitId')!;
        const rabCtrl = this.form.get('destinedRABUnitId')!;
        motherCtrl.clearValidators();
        rabCtrl.clearValidators();
        motherCtrl.updateValueAndValidity({ emitEvent: false });
        rabCtrl.updateValueAndValidity({ emitEvent: false });
    }

    removeEmployee(row: MovementEmployeeRow) {
        this.selectedEmployees = this.selectedEmployees.filter((e) => e.employeeID !== row.employeeID);
        this.syncCurrentUnitFromEmployees();

        // Drop the removed member's pending handover; when the last pending-sourced
        // member is gone (search flow only — not the redirect), restore the normal
        // Movement-type + Destination controls.
        if (this.prefilledUnits) delete this.prefilledUnits[row.employeeID];
        if (this.prefilledUnitNames) delete this.prefilledUnitNames[row.employeeID];
        if (this.prefilledContext) delete this.prefilledContext[row.employeeID];
        if (this.lockMovementType && !this.lockOrderFields
            && Object.keys(this.prefilledContext ?? {}).length === 0) {
            this.lockMovementType = false;
            this.hideDestination = false;
            this.prefilledUnits = null;
            this.prefilledUnitNames = null;
            this.prefilledContext = null;
            this.onDestinedUnitTargetChange(this.form.get('destinedUnitTarget')!.value);
        }
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
        const bn = (this.newReasonNameBN || '').trim();
        if (!bn) return;

        // Bangla-only flow: backend CommonCode row requires an EN value, so mirror BN into EN.
        const en = bn;
        const currentUser = this.sharedService.getCurrentUser();
        const now = this.sharedService.getCurrentDateTime();

        const payload: any = {
            orgId: 0,
            codeId: 0,
            codeType: 'MovementReason',
            codeValueEN: en,
            codeValueBN: bn,
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
                            label: r.codeValueBN || '',
                            value: r.codeId
                        }));
                        // Auto-select the row we just inserted, matched on the BN value the user typed.
                        const matchRow = (rows || []).find((r) => r.codeValueBN === bn);
                        if (matchRow) {
                            this.form.patchValue({ movementReasonId: matchRow.codeId });
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

    /** True when selected members are being transferred to different RAB units.
     *  In that case each member's unit is shown as a table column instead of the
     *  single-unit banner. */
    get hasMixedTransferUnits(): boolean {
        if (!this.prefilledUnits) return false;
        // Compare by top-level unit NAME when the sender supplied one — members can
        // point at different sub-units of the same RAB unit and still be one unit.
        if (this.prefilledUnitNames && Object.keys(this.prefilledUnitNames).length > 0) {
            return new Set(Object.values(this.prefilledUnitNames)).size > 1;
        }
        return new Set(Object.values(this.prefilledUnits)).size > 1;
    }

    /** Single destined RAB unit label for the banner (everyone shares one unit). */
    get destinedRABUnitLabel(): string {
        if (!this.prefilledUnits) return '';
        if (this.prefilledUnitNames) {
            const names = [...new Set(Object.values(this.prefilledUnitNames))];
            if (names[0]) return names[0];
        }
        const unitIds = [...new Set(Object.values(this.prefilledUnits))];
        return this.rabUnitOptions.find((o) => o.value === unitIds[0])?.label ?? '';
    }

    /** Transfer RAB unit label for a specific employee (per-member column). */
    transferUnitLabel(employeeId: number): string {
        const name = this.prefilledUnitNames?.[employeeId];
        if (name) return name;
        const unitId = this.prefilledUnits?.[employeeId];
        if (unitId == null) return '—';
        return this.rabUnitOptions.find((o) => o.value === unitId)?.label ?? '—';
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
    get isMO(): boolean {
        return this.form?.get('moveOrderType')!.value === MoveOrderType.MO;
    }
    get isCC(): boolean {
        return this.form?.get('moveOrderType')!.value === MoveOrderType.CC;
    }
    /** Show Handover-of-charge field — Permanent + Article 47 (Handover). */
    get showHandover(): boolean {
        return this.isPermanent && this.isArticle47Handover;
    }
    /** Show Takeover-of-charge field + Takeover Person — Permanent + Article 47 (Takeover). */
    get showTakeover(): boolean {
        return this.isPermanent && this.isArticle47Takeover;
    }
    /** Show the Letter Recipients picker for MO and either Article 47 variant. */
    get showLetterRecipients(): boolean {
        const v = this.form?.get('moveOrderType')!.value;
        return v === MoveOrderType.MO
            || v === MoveOrderType.Article47Handover
            || v === MoveOrderType.Article47Takeover;
    }
    get showDateOfReduce(): boolean {
        return this.isPermanent;
    }
    /** Show the post-out status picker (RTU / Regular Posting Out) — Permanent + Mother Unit. */
    get showPostOutType(): boolean {
        return this.isPermanent && this.form?.get('destinedUnitTarget')!.value === 'mother';
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
                // Pre-fill with the right enum's labels based on MoveOrderType.
                const v = this.form.get('moveOrderType')!.value;
                const source = v === MoveOrderType.MO
                    ? MOLetterRecipientOptions
                    : Article47LetterRecipientOptions;
                this.letterRecipientsList = source
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
        if (this.showPostOutType && !this.form.get('postOutStatusType')!.value) {
            this.messageService.add({
                severity: 'error',
                summary: 'Validation',
                detail: 'Please select a post-out status (RTU or Regular Posting Out).'
            });
            return;
        }
        // Pending-posting members + CC: one combined record stores ONE transfer unit /
        // posting order / notesheet — all members must share them (same rule the
        // pending pages enforce before redirecting).
        if (this.isCC && this.prefilledUnits && this.selectedEmployees.length > 1) {
            const ids = this.selectedEmployees.map((e) => e.employeeID);
            const units = new Set(ids.map((id) => this.prefilledUnits![id] ?? null));
            if (units.size > 1) {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Different Transfer To',
                    detail: 'For a CC order, all selected members must have the same Transfer To unit.'
                });
                return;
            }
            const orders = new Set(ids.map((id) => this.prefilledContext?.[id]?.o ?? null));
            if (orders.size > 1) {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Different Posting Order',
                    detail: 'For a CC order, all selected members must belong to the same Posting Order.'
                });
                return;
            }
            const noteSheets = new Set(ids.map((id) => this.prefilledContext?.[id]?.n ?? null));
            if (noteSheets.size > 1) {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Different NoteSheet',
                    detail: 'For a CC order, all selected members must belong to the same NoteSheet.'
                });
                return;
            }
        }


        const finalApproverIds: number[] = (this.form.get('finalApproverIds')?.value as number[] | null) ?? [];

        const v = this.form.value;
        const currentUser = this.sharedService.getCurrentUser();
        const now = this.sharedService.getCurrentDateTime();

        // ── File upload step ──────────────────────────────────────────
        // New rows have a File but no fileId yet; existing rows already have fileId.
        const newFileRows: FileRowData[] = this.filesForm?.getFilesToUpload() ?? [];
        const existingRefs: any[] = this.filesForm?.getExistingFileReferences() ?? [];

        const buildPayload = (filesJson: string | null, employeeIds: number[]): MovementInfoModel => {
            // When redirected from pending-posting-joining, each record's destined
            // RAB unit comes from that member's transfer unit; otherwise use the form.
            const destinedRABUnitId = this.prefilledUnits
                ? (this.prefilledUnits[employeeIds[0]] ?? null)
                : (v.destinedRABUnitId ?? null);
            // Per-member source refs from the New-Posting flow (current RAB unit,
            // notesheet id, posting-order id). Fall back to the form's currentUnitId.
            const ctx = this.prefilledContext?.[employeeIds[0]] ?? null;
            const currentUnitId = ctx ? (ctx.f ?? null) : (v.currentUnitId ?? null);
            const noteSheetId = ctx?.n ?? null;
            const officeOrderId = ctx?.o ?? null;
            return {
            movementId: this.editingId ?? 0,
            // On update keep the previously assigned LetterNo; on insert send null so
            // InsertMovementInfoHandler can mint a fresh one from MovementLetterNumberConfig.
            letterNo: this.editingId ? this.editingLetterNo : null,
            publicToken: this.editingId ? this.editingPublicToken : null,
            letterDate: this.toIsoDate(v.letterDate),
            employeeIds: JSON.stringify(employeeIds),
            finalApproverIds: finalApproverIds.length > 0 ? JSON.stringify(finalApproverIds) : null,
            letterRecipients: this.serialiseLetterRecipients(),
            movementType: v.movementType,
            moveOrderType: v.moveOrderType,
            movementReasonId: v.movementReasonId ?? null,
            currentUnitId: currentUnitId,
            destinedMotherUnitId: this.prefilledUnits ? null : (v.destinedMotherUnitId ?? null),
            destinedRABUnitId: destinedRABUnitId,
            noteSheetId: noteSheetId,
            officeOrderId: officeOrderId,
            // Only meaningful for Permanent + Mother Unit; null otherwise.
            postOutStatusType: this.showPostOutType ? (v.postOutStatusType ?? null) : null,
            dateOfRelease: this.toIsoDate(v.dateOfRelease),
            dateOfReduce: this.toIsoDate(v.dateOfReduce),
            takeoverDate: this.toIsoDate(v.takeoverDate),
            handoverDate: this.toIsoDate(v.handoverDate),
            takeoverPersonEmpId: this.takeoverPerson?.employeeID ?? null,
            isJoiningLeave: !!v.isJoiningLeave,
            joiningLeaveFrom: this.toIsoDate(v.joiningLeaveFrom),
            joiningLeaveTo: this.toIsoDate(v.joiningLeaveTo),
            // MO-only — persist only when moveOrderType is MO; otherwise null.
            lastRationCertificate: this.isMO ? (v.lastRationCertificate ?? null) : null,
            payAndAllowance:       this.isMO ? (v.payAndAllowance ?? null)       : null,
            railwayWarrant:        this.isMO ? (v.railwayWarrant ?? null)        : null,
            // CC-only — persist only when moveOrderType is CC; otherwise null.
            releaseTime:           this.isCC ? (v.releaseTime ?? null)           : null,
            vehicle:               this.isCC ? (v.vehicle ?? null)                : null,
            auth: v.auth ?? null,
            detailsInformation: v.detailsInformation ?? null,
            remarks: v.remarks ?? null,
            filesReferences: filesJson,
            status: v.status ?? true,
            createdBy: currentUser,
            createdDate: now,
            lastUpdatedBy: currentUser,
            lastupdate: now
            };
        };

        const proceed = (uploaded: { fileId: number; fileName: string }[]) => {
            const refs = [
                ...existingRefs.map((r: any) => ({ fileId: r.FileId ?? r.fileId, fileName: r.fileName })),
                ...uploaded
            ];
            const filesJson = refs.length ? JSON.stringify(refs) : null;
            const allIds = this.selectedEmployees.map((e) => e.employeeID);

            // CC is one combined order for everyone; MO and Article 47 are individual
            // orders, so on insert we create one record per selected employee.
            // Editing always updates the single existing record.
            const splitPerEmployee = !this.editingId && (this.isMO || this.isArticle47Variant);
            const groups: number[][] = splitPerEmployee ? allIds.map((id) => [id]) : [allIds];

            const orderType = v.moveOrderType;

            // Run the saves SEQUENTIALLY (concatMap), not in parallel. Each insert
            // mints its LetterNo by reading+incrementing the shared number config, so
            // parallel saves would race and produce duplicate numbers. Sequencing
            // guarantees each movement gets the next number (increment by 1).
            from(groups)
                .pipe(
                    concatMap((ids) => {
                        const payload = buildPayload(filesJson, ids);
                        return this.editingId
                            ? this.movementService.update(payload)
                            : this.movementService.save(payload);
                    }),
                    toArray()
                )
                .subscribe({
                next: (responses: any[]) => {
                    const n = groups.length;
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Saved',
                        detail: n > 1 ? `${n} movements saved successfully.` : 'Movement saved successfully.'
                    });
                    // Open each saved movement's preview in a new tab (insert only).
                    if (!this.editingId) {
                        const ids = responses
                            .map((r) => r?.data?.movementId ?? r?.Data?.MovementId)
                            .filter((id: any): id is number => id != null);
                        this.openPreviewTabs(orderType, ids);
                    }
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
        };

        const startSave = () => {
            this.saving = true;
            if (newFileRows.length > 0) {
                forkJoin(newFileRows.map((r) => this.empService.uploadEmployeeFile(r.file!))).subscribe({
                    next: (results: any[]) => proceed(results as { fileId: number; fileName: string }[]),
                    error: () => {
                        this.saving = false;
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Upload',
                            detail: 'File upload failed.'
                        });
                    }
                });
            } else {
                proceed([]);
            }
        };

        // Direct Permanent movement to a RAB unit (not sourced from a pending
        // posting): saving updates the members' RAB Service History IMMEDIATELY —
        // confirm before proceeding.
        const isDirectPermanentRabMove =
            !this.editingId &&
            this.isPermanent &&
            !this.prefilledUnits &&
            this.form.get('destinedUnitTarget')!.value === 'rab' &&
            v.destinedRABUnitId != null;

        if (isDirectPermanentRabMove) {
            this.confirmationService.confirm({
                header: 'Service History Will Be Updated',
                message: 'Saving this Permanent movement will immediately update the RAB Service History.',
                icon: 'pi pi-exclamation-triangle',
                acceptButtonProps: { label: 'Yes, Save', severity: 'success' },
                rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
                accept: () => startSave()
            });
            return;
        }

        startSave();
    }

    /** Open the movement preview page for each saved movement in a new browser tab. */
    private openPreviewTabs(orderType: number | null, movementIds: number[]): void {
        const path = this.previewPathFor(orderType);
        if (!path) return;
        for (const id of movementIds) {
            window.open(`${path}?id=${id}`, '_blank');
        }
    }

    /** Preview route for a given MoveOrderType (null if none maps). */
    private previewPathFor(orderType: number | null): string | null {
        switch (orderType) {
            case MoveOrderType.CC:                return '/movement-preview/cc';
            case MoveOrderType.MO:                return '/movement-preview/mo';
            case MoveOrderType.Article47Handover: return '/movement-preview/article-47-handover';
            case MoveOrderType.Article47Takeover: return '/movement-preview/article-47-takeover';
            default:                              return null;
        }
    }

    resetForm() {
        this.editingId = null;
        this.editingLetterNo = null;
        this.editingPublicToken = null;
        this.selectedEmployees = [];
        this.takeoverPerson = null;
        this.letterRecipientsList = [];
        this.fileRows = [];
        // Clear any pending-posting handover state (redirect or search sourced)
        // and restore the normal Destination controls.
        this.lockOrderFields = false;
        this.lockMovementType = false;
        this.hideDestination = false;
        this.prefilledUnits = null;
        this.prefilledContext = null;
        this.onDestinedUnitTargetChange('mother');
        this.form.reset({
            movementType: null,
            moveOrderType: null,
            movementReasonId: null,
            currentUnitId: null,
            destinedUnitTarget: 'mother',
            destinedMotherUnitId: null,
            destinedRABUnitId: null,
            postOutStatusType: null,
            dateOfRelease: null,
            dateOfReduce: null,
            takeoverDate: null,
            handoverDate: null,
            isJoiningLeave: false,
            joiningLeaveFrom: null,
            joiningLeaveTo: null,
            lastRationCertificate: null,
            payAndAllowance: null,
            railwayWarrant: null,
            releaseTime: null,
            vehicle: null,
            auth: null,
            detailsInformation: null,
            remarks: null,
            finalApproverIds: [],
            letterDate: new Date(),
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
