import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '@/Core/Environments/environment';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { EmpService } from '@/services/emp-service';
import { LeaveApplicationService, LeaveApplicationModel, LeaveApplicationDetailModel, LeaveApplicationRecommenderModel } from '@/services/leave-application.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { UserMenuService } from '@/services/user-menu.service';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { MultiSelectModule } from 'primeng/multiselect';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { FluidModule } from 'primeng/fluid';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, take } from 'rxjs';
import { RouterModule } from '@angular/router';

interface ApproverOption { label: string; value: number; }

@Component({
    selector: 'app-leave-application-apply',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        InputTextModule,
        ButtonModule,
        SelectModule,
        DatePickerModule, FlexibleDateDirective,
        CheckboxModule,
        MultiSelectModule,
        TextareaModule,
        ToastModule,
        FluidModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent,
        RouterModule
    ],
    providers: [MessageService],
    templateUrl: './leave-application-apply.component.html',
    styleUrl: './leave-application-apply.component.scss'
})
export class LeaveApplicationApplyComponent implements OnInit {
    @ViewChild('fileReferencesForm') fileReferencesForm?: FileReferencesFormComponent;

    title = 'ApplyLeave';
    form!: FormGroup;
    applyForSelf = true;
    applicantInfo: EmployeeBasicInfo | null = null;
    applicantEmployeeId: number | null = null;
    leaveTypeOptions: { label: string; value: number }[] = [];
    approverOptions: ApproverOption[] = [];
    processTypeOptions = [
        { label: 'Automatic', value: 'automatic' },
        { label: 'Manual', value: 'manual' }
    ];
    manualDecisionOptions = [
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' }
    ];
    hasReliever = false;
    relieverInfo: EmployeeBasicInfo | null = null;
    isSaving = false;
    editId: number | null = null;
    editMode = false;
    currentUserEmployeeId: number | null = null;
    canInsert = true;
    canUpdate = true;
    canDelete = true;
    fileRows: FileRowData[] = [];

    private api = `${environment.apis.core}/EmployeeInfo`;

    constructor(
        private fb: FormBuilder,
        private http: HttpClient,
        private sharedService: SharedService,
        private empService: EmpService,
        private leaveAppService: LeaveApplicationService,
        private masterBasicSetup: MasterBasicSetupService,
        private identityMappingService: IdentityUserMappingService,
        private messageService: MessageService,
        private router: Router,
        private route: ActivatedRoute,
        private _userMenuService: UserMenuService
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadLeaveTypes();
        this.loadApproverOptions();
        this.route.queryParams.pipe(take(1)).subscribe((params) => {
            const id = params['id'];
            if (id != null && id !== '') {
                const numId = Number(id);
                if (!isNaN(numId) && numId > 0) {
                    this.editId = numId;
                    this.editMode = true;
                    this.loadForEdit(numId);
                }
            }
        });
        if (this.applyForSelf) this.loadCurrentUserAsApplicant();
    }

    private initForm(): void {
        this.form = this.fb.group({
            applicantEmployeeId: [null as number | null, Validators.required],
            appliedByEmployeeId: [null as number | null],
            processType: [null as string | null, Validators.required],
            manualDecision: [null as string | null],
            relieverEmployeeId: [null as number | null],
            addressDuringLeave: [''],
            remarks: [''],
            finalApproverId: [null as number | null],
            leaveDetails: this.fb.array([this.createLeaveDetailRow()], this.overlapValidator()),
            recommenderIds: [[] as number[]]
        });
        this.form.get('processType')!.valueChanges.subscribe((val) => {
            if (val === 'manual') {
                // Manual mode: decision is mandatory, the approval-flow fields are not used.
                // Clear them so they don't leak into the submit payload or sit stale in the UI.
                this.form.get('manualDecision')!.setValidators(Validators.required);
                this.form.get('finalApproverId')!.clearValidators();
                this.form.patchValue({ finalApproverId: null, recommenderIds: [] }, { emitEvent: false });
            } else {
                this.form.get('manualDecision')!.clearValidators();
                this.form.get('manualDecision')!.setValue(null);
                this.form.get('finalApproverId')!.setValidators(Validators.required);
            }
            this.form.get('manualDecision')!.updateValueAndValidity();
            this.form.get('finalApproverId')!.updateValueAndValidity();
        });
    }

    /** Builds an empty leave-detail row FormGroup. */
    private createLeaveDetailRow(initial?: Partial<{ leaveTypeId: number; fromDate: Date; toDate: Date }>): FormGroup {
        return this.fb.group({
            leaveTypeId: [initial?.leaveTypeId ?? null, Validators.required],
            fromDate: [initial?.fromDate ?? null, Validators.required],
            toDate: [initial?.toDate ?? null, Validators.required]
        });
    }

    /** Sorts rows by fromDate and flags any pair with overlapping ranges. */
    private overlapValidator(): ValidatorFn {
        return (control: AbstractControl): ValidationErrors | null => {
            const arr = control as FormArray;
            const rows = arr.controls
                .map((c, idx) => {
                    const v = c.value;
                    return v.fromDate && v.toDate
                        ? { idx, from: new Date(v.fromDate).getTime(), to: new Date(v.toDate).getTime() }
                        : null;
                })
                .filter((r): r is { idx: number; from: number; to: number } => r !== null)
                .sort((a, b) => a.from - b.from);
            for (let i = 1; i < rows.length; i++) {
                if (rows[i].from <= rows[i - 1].to) {
                    return { overlap: true };
                }
            }
            return null;
        };
    }

    get leaveDetails(): FormArray { return this.form.get('leaveDetails') as FormArray; }

    addLeaveDetailRow(): void {
        this.leaveDetails.push(this.createLeaveDetailRow());
    }

    removeLeaveDetailRow(index: number): void {
        if (this.leaveDetails.length <= 1) return; // keep at least one row
        this.leaveDetails.removeAt(index);
    }

    /** Inclusive day count for a row (returns null if either date is missing or invalid). */
    leaveDetailRowDays(index: number): number | null {
        const row = this.leaveDetails.at(index)?.value;
        if (!row?.fromDate || !row?.toDate) return null;
        const from = new Date(row.fromDate);
        const to = new Date(row.toDate);
        if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return null;
        return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    /** Total days across all valid leave-detail rows. */
    get totalDays(): number {
        let sum = 0;
        for (let i = 0; i < this.leaveDetails.length; i++) {
            const d = this.leaveDetailRowDays(i);
            if (d != null) sum += d;
        }
        return sum;
    }

    loadLeaveTypes(): void {
        this.masterBasicSetup.getAllByType('LeaveType').subscribe({
            next: (list) => {
                this.leaveTypeOptions = (Array.isArray(list) ? list : []).map((c: any) => ({
                    label: c.codeValueEN || c.CodeValueEN || String(c.codeId ?? c.CodeId),
                    value: c.codeId ?? c.CodeId
                }));
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load leave types' })
        });
    }

    loadApproverOptions(): void {
        this.http.get<any[]>(`${this.api}/GetAll`).subscribe({
            next: (list) => {
                const arr = Array.isArray(list) ? list : [];
                this.approverOptions = arr.map((e: any) => ({
                    label: `${e.fullNameEN || e.FullNameEN || ''} (${e.rabid || e.Rabid || e.employeeID || e.EmployeeID})`,
                    value: e.employeeID ?? e.EmployeeID
                }));
                const userId = this.sharedService.getCurrentUserId?.();
                if (userId) {
                    this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
                        next: (empId) => { if (empId) this.currentUserEmployeeId = empId; }
                    });
                }
            },
            error: (_err: any) => {}
        });
    }

    loadCurrentUserAsApplicant(): void {
        const userId = this.sharedService.getCurrentUserId?.();
        if (!userId) return;
        this.identityMappingService.getEmployeeIdForUser(userId).subscribe({
            next: (empId) => {
                if (!empId) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Employee ID not found',
                        detail: 'Your user account is not mapped to an employee. Please contact admin to set Identity User Mapping.'
                    });
                    return;
                }
                this.empService.getEmployeeById(empId).subscribe({
                    next: (emp: any) => {
                        if (!emp) return;
                        const id = emp.employeeID ?? emp.EmployeeID;
                        this.applicantEmployeeId = id;
                        this.applicantInfo = {
                            employeeID: id,
                            fullNameEN: emp.fullNameEN ?? emp.FullNameEN ?? '',
                            fullNameBN: emp.fullNameBN ?? emp.FullNameBN ?? '',
                            rabid: emp.rabid ?? emp.Rabid ?? '',
                            serviceId: emp.serviceId ?? emp.ServiceId ?? '',
                            rankDisplay: emp.rank ?? emp.Rank,
                            corpsDisplay: emp.corps ?? emp.Corps,
                            tradeDisplay: emp.trade ?? emp.Trade,
                            motherOrganizationDisplay: emp.motherOrganization ?? emp.MotherOrganization,
                            memberTypeDisplay: emp.memberType ?? emp.MemberType
                        };
                        this.form.patchValue({ applicantEmployeeId: id, appliedByEmployeeId: id });
                    },
                    error: (err: any) =>
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load employee details' })
                });
            },
            error: (err: any) =>
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to resolve employee mapping' })
        });
    }

    setApplyForSelf(forSelf: boolean): void {
        this.applyForSelf = forSelf;
        this.applicantInfo = null;
        this.applicantEmployeeId = null;
        this.form.patchValue({ applicantEmployeeId: null, appliedByEmployeeId: this.currentUserEmployeeId });
        if (this.applyForSelf) this.loadCurrentUserAsApplicant();
    }

    onApplicantSelected(info: EmployeeBasicInfo | null): void {
        this.applicantInfo = info;
        this.applicantEmployeeId = info?.employeeID ?? null;
        this.form.patchValue({
            applicantEmployeeId: this.applicantEmployeeId,
            appliedByEmployeeId: this.getAppliedByEmployeeId()
        });
    }

    onRelieverSelected(info: EmployeeBasicInfo | null): void {
        this.relieverInfo = info;
        this.form.patchValue({ relieverEmployeeId: info?.employeeID ?? null });
    }

    onRelieverCheckChange(): void {
        if (!this.hasReliever) {
            this.relieverInfo = null;
            this.form.patchValue({ relieverEmployeeId: null });
        }
    }

    onFileRowsChange(rows: FileRowData[]): void {
        this.fileRows = rows;
    }

    onDownloadFile(evt: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(evt.fileId).subscribe({
            next: (blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = evt.fileName || `file-${evt.fileId}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 100);
            },
            error: (err: any) =>
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file' })
        });
    }

    private getAppliedByEmployeeId(): number | null {
        if (this.applyForSelf && this.applicantEmployeeId) return this.applicantEmployeeId;
        const user = this.sharedService.getCurrentUser?.();
        if (!user) return null;
        return null;
    }

    loadForEdit(id: number): void {
        this.leaveAppService.getById(id).subscribe({
            next: (d) => {
                if (!d) {
                    this.messageService.add({ severity: 'warn', summary: 'Cannot edit', detail: 'Application not found.' });
                    return;
                }
                const editableStatuses = [0, 1, 3, 4]; // Draft, Draft, Approved(manual), Declined(manual)
                if (!editableStatuses.includes(d.leaveApplicationStatusId)) {
                    this.messageService.add({ severity: 'warn', summary: 'Cannot edit', detail: 'Only draft or manually processed applications can be edited.' });
                    return;
                }

                // Determine processType: trust backend value, fall back to status-derived for old rows.
                const savedStatus = d.leaveApplicationStatusId;
                const isManual = savedStatus === 3 || savedStatus === 4;
                const manualDecision = savedStatus === 3 ? 'approved' : savedStatus === 4 ? 'rejected' : null;
                const processType = d.processType || (isManual ? 'manual' : 'automatic');

                this.form.patchValue({
                    applicantEmployeeId: d.applicantEmployeeId ?? (d as any).ApplicantEmployeeId,
                    processType: processType,
                    manualDecision: manualDecision,
                    relieverEmployeeId: d.relieverEmployeeId ?? (d as any).RelieverEmployeeId ?? null,
                    addressDuringLeave: d.addressDuringLeave ?? (d as any).AddressDuringLeave ?? '',
                    remarks: d.remarks ?? (d as any).Remarks ?? '',
                    finalApproverId: d.finalApproverId ?? (d as any).FinalApproverId ?? null
                });

                // Rehydrate leave-detail rows from the response (or fall back to summary fields for legacy data).
                this.leaveDetails.clear();
                const detailRows = (d.leaveDetails && d.leaveDetails.length > 0)
                    ? d.leaveDetails.map((r) => ({
                        leaveTypeId: r.leaveTypeId,
                        fromDate: r.fromDate ? new Date(r.fromDate) : null,
                        toDate: r.toDate ? new Date(r.toDate) : null
                    }))
                    : [{
                        leaveTypeId: (d.leaveTypeId ?? null) as number | null,
                        fromDate: d.fromDate ? new Date(d.fromDate) : null,
                        toDate: d.toDate ? new Date(d.toDate) : null
                    }];
                detailRows.forEach((r: any) => this.leaveDetails.push(this.createLeaveDetailRow(r)));
                if (this.leaveDetails.length === 0) this.leaveDetails.push(this.createLeaveDetailRow());

                // Recommenders — preserve sequence order from the backend.
                const orderedRecommenderIds = (d.recommenders || [])
                    .slice()
                    .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0))
                    .map((r) => r.employeeId);
                this.form.patchValue({ recommenderIds: orderedRecommenderIds });

                // Attachments → file-references-form rows (existing fileId, no local file).
                this.fileRows = (d.attachments || []).map((a) => ({
                    displayName: a.fileName || `file-${a.fileId}`,
                    file: null,
                    fileId: a.fileId
                } as FileRowData));

                // Reliever info.
                this.applicantEmployeeId = d.applicantEmployeeId ?? (d as any).ApplicantEmployeeId;
                const relieverId = d.relieverEmployeeId ?? (d as any).RelieverEmployeeId;
                this.hasReliever = relieverId != null && relieverId !== 0;
                if (this.hasReliever && relieverId) {
                    this.empService.getEmployeeById(relieverId).subscribe({
                        next: (emp: any) => {
                            if (emp)
                                this.relieverInfo = {
                                    employeeID: emp.employeeID ?? emp.EmployeeID,
                                    fullNameEN: emp.fullNameEN ?? emp.FullNameEN ?? '',
                                    rabid: emp.rabid ?? emp.Rabid ?? '',
                                    serviceId: emp.serviceId ?? emp.ServiceId ?? '',
                                    rankDisplay: emp.rank ?? emp.Rank,
                                    corpsDisplay: emp.corps ?? emp.Corps,
                                    tradeDisplay: emp.trade ?? emp.Trade,
                                    motherOrganizationDisplay: emp.motherOrganization ?? emp.MotherOrganization,
                                    memberTypeDisplay: emp.memberType ?? emp.MemberType
                                };
                        }
                    });
                }
                this.empService.getEmployeeById(this.applicantEmployeeId!).subscribe({
                    next: (emp: any) => {
                        if (emp)
                            this.applicantInfo = {
                                employeeID: emp.employeeID ?? emp.EmployeeID,
                                fullNameEN: emp.fullNameEN ?? emp.FullNameEN ?? '',
                                rabid: emp.rabid ?? emp.Rabid ?? '',
                                serviceId: emp.serviceId ?? emp.ServiceId ?? '',
                                rankDisplay: emp.rank ?? emp.Rank,
                                corpsDisplay: emp.corps ?? emp.Corps,
                                tradeDisplay: emp.trade ?? emp.Trade,
                                motherOrganizationDisplay: emp.motherOrganization ?? emp.MotherOrganization,
                                memberTypeDisplay: emp.memberType ?? emp.MemberType
                            };
                    }
                });
            },
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load application' })
        });
    }

    submitForApproval(): void {
        if (this.editMode ? !this.canUpdate : !this.canInsert) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        if (!this.buildAndValidate()) return;
        const processType = this.form.get('processType')?.value;
        // Upload any pending files first, then submit with the resolved attachment fileIds.
        this.resolveAttachmentsThen((attachmentFileIds) => {
            if (processType === 'manual') {
                this.submitManual(attachmentFileIds);
            } else {
                this.submitAutomatic(attachmentFileIds);
            }
        });
    }

    /** Saves the current form as a Draft (status 1) without triggering the approval workflow. */
    saveDraft(): void {
        if (this.editMode ? !this.canUpdate : !this.canInsert) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to perform this action.' });
            return;
        }
        if (!this.buildAndValidate()) return;
        this.resolveAttachmentsThen((attachmentFileIds) => {
            const payload = this.buildPayload(1, attachmentFileIds);
            this.isSaving = true;
            const obs = this.editId
                ? this.leaveAppService.update({ ...payload, leaveApplicationId: this.editId })
                : this.leaveAppService.save(payload);
            obs.subscribe({
                next: (res) => {
                    this.isSaving = false;
                    const code = res.statusCode ?? res.StatusCode ?? 0;
                    const msg = res.description ?? res.Description ?? '';
                    if (code === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Draft Saved', detail: 'Your draft has been saved.' });
                        const data = res.data as any;
                        const id = data?.leaveApplicationId ?? data?.LeaveApplicationId ?? this.editId;
                        if (id && !this.editId) this.router.navigate(['/leave-application/apply'], { queryParams: { id } });
                    } else {
                        this.messageService.add({ severity: 'warn', summary: 'Save failed', detail: msg || 'Save failed.' });
                    }
                },
                error: (err: any) => {
                    this.isSaving = false;
                    const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to save draft';
                    this.messageService.add({ severity: 'error', summary: 'Error', detail });
                }
            });
        });
    }

    /** Discards changes and navigates back to the list. */
    cancel(): void {
        this.router.navigate(['/leave-application/list']);
    }

    /** Uploads any locally-selected files via EmpService, then invokes the callback with the full set of fileIds (existing + newly uploaded). */
    private resolveAttachmentsThen(cb: (attachmentFileIds: number[]) => void): void {
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const existingIds = existingRefs.map((r) => r.FileId);

        if (filesToUpload.length === 0) {
            cb(existingIds);
            return;
        }

        this.isSaving = true;
        const uploads = filesToUpload.map((r: FileRowData) =>
            this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
        );
        forkJoin(uploads).subscribe({
            next: (results: { fileId: number; fileName: string }[]) => {
                const newIds = (Array.isArray(results) ? results : []).map((r) => r.fileId);
                cb([...existingIds, ...newIds]);
            },
            error: (err: any) => {
                this.isSaving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload one or more files' });
            }
        });
    }

    private submitManual(attachmentFileIds: number[]): void {
        const decision = this.form.get('manualDecision')?.value;
        if (!decision) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Please select Approved or Rejected.' });
            return;
        }
        const statusId = decision === 'approved' ? 3 : 4;
        const payload = this.buildPayload(statusId, attachmentFileIds);
        this.isSaving = true;

        const obs = this.editId
            ? this.leaveAppService.update({ ...payload, leaveApplicationId: this.editId })
            : this.leaveAppService.save(payload);

        obs.subscribe({
            next: (res) => {
                this.isSaving = false;
                const code = res.statusCode ?? res.StatusCode ?? 0;
                const msg = res.description ?? res.Description ?? '';
                if (code === 200) {
                    const label = statusId === 3 ? 'Approved' : 'Rejected';
                    this.messageService.add({ severity: 'success', summary: label, detail: `Leave application saved as ${label}.` });
                    this.router.navigate(['/leave-application/list'], { queryParams: { section: statusId === 3 ? 'approved' : 'declined' } });
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Save failed', detail: msg || 'Save failed.' });
                }
            },
            error: (err: any) => {
                this.isSaving = false;
                const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to save';
                this.messageService.add({ severity: 'error', summary: 'Error', detail });
            }
        });
    }

    private submitAutomatic(attachmentFileIds: number[]): void {
        const finalApproverId = this.form.get('finalApproverId')?.value;
        if (!finalApproverId) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Please select Final Approver before submitting.' });
            return;
        }
        const payload = this.buildPayload(1, attachmentFileIds);
        this.isSaving = true;
        const doSubmit = (id: number) => {
            this.leaveAppService.submitForApproval(id).subscribe({
                next: (res) => {
                    this.isSaving = false;
                    const code = res.statusCode ?? res.StatusCode ?? 0;
                    const msg = res.description ?? res.Description ?? '';
                    if (code === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Submitted', detail: 'Leave application submitted for approval.' });
                        this.router.navigate(['/leave-application/pending-approval']);
                    } else {
                        this.messageService.add({ severity: 'warn', summary: 'Submit failed', detail: msg || 'Submit failed.' });
                    }
                },
                error: (err: any) => {
                    this.isSaving = false;
                    const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to submit';
                    this.messageService.add({ severity: 'error', summary: 'Error', detail });
                }
            });
        };
        if (this.editId) {
            this.leaveAppService.update({ ...payload, leaveApplicationId: this.editId }).subscribe({
                next: (res) => {
                    const code = res.statusCode ?? res.StatusCode ?? 0;
                    if (code === 200) {
                        doSubmit(this.editId!);
                    } else {
                        this.isSaving = false;
                        this.messageService.add({ severity: 'warn', summary: 'Save failed', detail: res.description ?? res.Description ?? '' });
                    }
                },
                error: (err: any) => {
                    this.isSaving = false;
                    const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to save';
                    this.messageService.add({ severity: 'error', summary: 'Error', detail });
                }
            });
        } else {
            this.leaveAppService.save(payload).subscribe({
                next: (res) => {
                    const code = res.statusCode ?? res.StatusCode ?? 0;
                    const data = res.data as any;
                    const id = data?.leaveApplicationId ?? data?.LeaveApplicationId;
                    if (code === 200 && id) {
                        doSubmit(id);
                    } else {
                        this.isSaving = false;
                        this.messageService.add({ severity: 'warn', summary: 'Submit failed', detail: res.description ?? res.Description ?? '' });
                    }
                },
                error: (err: any) => {
                    this.isSaving = false;
                    const detail = err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to submit';
                    this.messageService.add({ severity: 'error', summary: 'Error', detail });
                }
            });
        }
    }

    private buildAndValidate(): boolean {
        const applicantId = this.form.get('applicantEmployeeId')?.value
            ?? this.applicantEmployeeId
            ?? this.applicantInfo?.employeeID
            ?? null;
        if (applicantId != null && applicantId > 0) {
            this.form.patchValue({ applicantEmployeeId: applicantId });
        } else {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Please select an applicant.' });
            return false;
        }
        const user = this.sharedService.getCurrentUser?.();
        if (!user && !this.editId) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Current user not found.' });
            return false;
        }
        this.form.markAllAsTouched();

        // Surface specific row-level errors before the generic "Validation" message.
        for (let i = 0; i < this.leaveDetails.length; i++) {
            const row = this.leaveDetails.at(i).value;
            if (!row.fromDate || !row.toDate || !row.leaveTypeId) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: `Row ${i + 1}: please fill Leave Type, From Date, and To Date.` });
                return false;
            }
            if (new Date(row.toDate) < new Date(row.fromDate)) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: `Row ${i + 1}: To Date must be on or after From Date.` });
                return false;
            }
        }
        if (this.leaveDetails.errors?.['overlap']) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Leave date ranges cannot overlap.' });
            return false;
        }
        if (this.form.invalid) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please fill all required fields.' });
            return false;
        }
        return true;
    }

    private buildPayload(statusId: number, attachmentFileIds: number[]): Partial<LeaveApplicationModel> {
        const applicantId = this.form.get('applicantEmployeeId')?.value ?? this.applicantEmployeeId;
        const user = this.sharedService.getCurrentUser?.() ?? '';
        const appliedBy = this.currentUserEmployeeId ?? applicantId ?? this.form.get('appliedByEmployeeId')?.value;
        const isManualApproval = statusId === 3 || statusId === 4;
        // ApprovedDate / DeclinedDate on the backend are DateOnly — yyyy-MM-dd, not ISO datetime.
        const today = this.toIsoDate(new Date());

        const details: LeaveApplicationDetailModel[] = this.leaveDetails.controls
            .map((c, idx) => {
                const v = c.value;
                const from = v.fromDate ? new Date(v.fromDate) : null;
                const to = v.toDate ? new Date(v.toDate) : null;
                if (!from || !to || !v.leaveTypeId) return null;
                const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                return {
                    leaveTypeId: v.leaveTypeId,
                    fromDate: this.toIsoDate(from),
                    toDate: this.toIsoDate(to),
                    days,
                    sequenceNo: idx + 1
                } as LeaveApplicationDetailModel;
            })
            .filter((d): d is LeaveApplicationDetailModel => d !== null);

        // Summary fields (also computed server-side, but we set them so list views work even pre-DB-trip).
        const firstRow = details[0];
        const minFrom = details.reduce((min, d) => !min || d.fromDate < min ? d.fromDate : min, '' as string);
        const maxTo = details.reduce((max, d) => !max || d.toDate > max ? d.toDate : max, '' as string);

        const recommenderIds: number[] = (this.form.get('recommenderIds')?.value as number[] | null) ?? [];
        const recommenders: LeaveApplicationRecommenderModel[] = recommenderIds.map((employeeId, idx) => ({
            employeeId,
            sequenceNo: idx + 1,
            status: 1
        }));

        return {
            applicantEmployeeId: applicantId,
            appliedByEmployeeId: appliedBy ?? applicantId,
            processType: this.form.get('processType')?.value,
            leaveTypeId: firstRow?.leaveTypeId ?? null,
            fromDate: minFrom || null,
            toDate: maxTo || null,
            relieverEmployeeId: this.form.get('relieverEmployeeId')?.value ?? null,
            addressDuringLeave: this.form.get('addressDuringLeave')?.value ?? '',
            remarks: this.form.get('remarks')?.value ?? '',
            finalApproverId: this.form.get('finalApproverId')?.value ?? null,
            leaveApplicationStatusId: statusId,
            approvedByEmployeeId: isManualApproval && statusId === 3 ? (this.currentUserEmployeeId ?? appliedBy) : null,
            approvedDate: isManualApproval && statusId === 3 ? today : null,
            declinedByEmployeeId: isManualApproval && statusId === 4 ? (this.currentUserEmployeeId ?? appliedBy) : null,
            declinedDate: isManualApproval && statusId === 4 ? today : null,
            createdBy: user,
            lastUpdatedBy: user,
            leaveDetails: details,
            recommenders,
            attachments: attachmentFileIds.map((fileId) => ({ fileId }))
        };
    }

    private toIsoDate(d: Date): string {
        // yyyy-MM-dd in local time (matches the DateOnly contract on the backend).
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}
