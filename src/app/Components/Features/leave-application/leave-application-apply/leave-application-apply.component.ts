import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '@/Core/Environments/environment';
import { SharedService } from '@/shared/services/shared-service';
import { EmpService } from '@/services/emp-service';
import { LeaveApplicationService, LeaveApplicationModel } from '@/services/leave-application.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { FluidModule } from 'primeng/fluid';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs/operators';
import { RouterModule } from '@angular/router';

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
        DatePickerModule,
        CheckboxModule,
        TextareaModule,
        ToastModule,
        FluidModule,
        EmployeeSearchComponent,
        RouterModule
    ],
    providers: [MessageService],
    templateUrl: './leave-application-apply.component.html',
    styleUrl: './leave-application-apply.component.scss'
})
export class LeaveApplicationApplyComponent implements OnInit {
    title = 'ApplyLeave';
    form!: FormGroup;
    applyForSelf = true;
    applicantInfo: EmployeeBasicInfo | null = null;
    applicantEmployeeId: number | null = null;
    leaveTypeOptions: { label: string; value: number }[] = [];
    approverOptions: { label: string; value: number }[] = [];
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
    totalDays: number | null = null;
    isSaving = false;
    editId: number | null = null;
    editMode = false;
    currentUserEmployeeId: number | null = null;

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
        private route: ActivatedRoute
    ) {
        this.initForm();
    }

    ngOnInit(): void {
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
            leaveTypeId: [null as number | null, Validators.required],
            processType: ['automatic' as string],
            manualDecision: [null as string | null],
            fromDate: [null as Date | null, Validators.required],
            toDate: [null as Date | null, Validators.required],
            relieverEmployeeId: [null as number | null],
            addressDuringLeave: [''],
            remarks: [''],
            finalApproverId: [null as number | null]
        });
        this.form.get('fromDate')!.valueChanges.subscribe(() => this.calculateTotalDays());
        this.form.get('toDate')!.valueChanges.subscribe(() => this.calculateTotalDays());
        this.form.get('processType')!.valueChanges.subscribe((val) => {
            if (val === 'manual') {
                this.form.get('manualDecision')!.setValidators(Validators.required);
                this.form.get('finalApproverId')!.clearValidators();
            } else {
                this.form.get('manualDecision')!.clearValidators();
                this.form.get('manualDecision')!.setValue(null);
                this.form.get('finalApproverId')!.setValidators(Validators.required);
            }
            this.form.get('manualDecision')!.updateValueAndValidity();
            this.form.get('finalApproverId')!.updateValueAndValidity();
        });
    }

    private calculateTotalDays(): void {
        const from = this.form.get('fromDate')?.value as Date | null;
        const to = this.form.get('toDate')?.value as Date | null;
        if (from && to && to >= from) {
            const diffMs = to.getTime() - from.getTime();
            this.totalDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
        } else {
            this.totalDays = null;
        }
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
            error: (err: any) => {}
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
                const from = d.fromDate ? new Date(d.fromDate) : null;
                const to = d.toDate ? new Date(d.toDate) : null;
                // Determine processType from saved status
                const savedStatus = d.leaveApplicationStatusId;
                const isManual = savedStatus === 3 || savedStatus === 4;
                const manualDecision = savedStatus === 3 ? 'approved' : savedStatus === 4 ? 'rejected' : null;

                this.form.patchValue({
                    applicantEmployeeId: d.applicantEmployeeId ?? (d as any).ApplicantEmployeeId,
                    leaveTypeId: d.leaveTypeId ?? (d as any).LeaveTypeId,
                    processType: isManual ? 'manual' : 'automatic',
                    manualDecision: manualDecision,
                    fromDate: from,
                    toDate: to,
                    relieverEmployeeId: d.relieverEmployeeId ?? (d as any).RelieverEmployeeId ?? null,
                    addressDuringLeave: d.addressDuringLeave ?? (d as any).AddressDuringLeave ?? '',
                    remarks: d.remarks ?? (d as any).Remarks ?? '',
                    finalApproverId: d.finalApproverId ?? (d as any).FinalApproverId ?? null
                });
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
                this.empService.getEmployeeById(this.applicantEmployeeId).subscribe({
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

    saveDraft(): void {
        if (!this.buildAndValidate()) return;
        const payload = this.buildPayload(1);
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
                    this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Draft saved.' });
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
    }

    submitForApproval(): void {
        if (!this.buildAndValidate()) return;
        const processType = this.form.get('processType')?.value;

        if (processType === 'manual') {
            this.submitManual();
        } else {
            this.submitAutomatic();
        }
    }

    private submitManual(): void {
        const decision = this.form.get('manualDecision')?.value;
        if (!decision) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Please select Approved or Rejected.' });
            return;
        }
        // Manual: status 3=Approved, 4=Declined — no notification
        const statusId = decision === 'approved' ? 3 : 4;
        const payload = this.buildPayload(statusId);
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

    private submitAutomatic(): void {
        const finalApproverId = this.form.get('finalApproverId')?.value;
        if (!finalApproverId) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Please select Final Approver before submitting.' });
            return;
        }
        const payload = this.buildPayload(1);
        this.isSaving = true;
        const doSubmit = (id: number) => {
            this.leaveAppService.submitForApproval(id).subscribe({
                next: (res) => {
                    this.isSaving = false;
                    const code = res.statusCode ?? res.StatusCode ?? 0;
                    const msg = res.description ?? res.Description ?? '';
                    if (code === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Submitted', detail: 'Leave application submitted for approval.' });
                        this.router.navigate(['/leave-application/list'], { queryParams: { section: 'pending' } });
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
            return false;
        }
        const user = this.sharedService.getCurrentUser?.();
        if (!user && !this.editId) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Current user not found.' });
            return false;
        }
        this.form.markAllAsTouched();
        if (this.form.invalid) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please fill required fields: Leave Type, From Date, To Date.' });
            return false;
        }
        const from = this.form.get('fromDate')?.value as Date | null;
        const to = this.form.get('toDate')?.value as Date | null;
        if (from && to && to < from) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'To Date must be on or after From Date.' });
            return false;
        }
        return true;
    }

    private buildPayload(statusId: number): Partial<LeaveApplicationModel> {
        const from = this.form.get('fromDate')?.value as Date | null;
        const to = this.form.get('toDate')?.value as Date | null;
        const applicantId = this.form.get('applicantEmployeeId')?.value ?? this.applicantEmployeeId;
        const user = this.sharedService.getCurrentUser?.() ?? '';
        const appliedBy = this.currentUserEmployeeId ?? applicantId ?? this.form.get('appliedByEmployeeId')?.value;
        const isManualApproval = statusId === 3 || statusId === 4;
        const now = new Date().toISOString();
        return {
            applicantEmployeeId: applicantId,
            appliedByEmployeeId: appliedBy ?? applicantId,
            leaveTypeId: this.form.get('leaveTypeId')?.value,
            fromDate: from ? from.toISOString().slice(0, 10) : '',
            toDate: to ? to.toISOString().slice(0, 10) : '',
            relieverEmployeeId: this.form.get('relieverEmployeeId')?.value ?? null,
            addressDuringLeave: this.form.get('addressDuringLeave')?.value ?? '',
            remarks: this.form.get('remarks')?.value ?? '',
            finalApproverId: this.form.get('finalApproverId')?.value ?? null,
            leaveApplicationStatusId: statusId,
            approvedByEmployeeId: isManualApproval && statusId === 3 ? (this.currentUserEmployeeId ?? appliedBy) : null,
            approvedDate: isManualApproval && statusId === 3 ? now : null,
            declinedByEmployeeId: isManualApproval && statusId === 4 ? (this.currentUserEmployeeId ?? appliedBy) : null,
            declinedDate: isManualApproval && statusId === 4 ? now : null,
            createdBy: user,
            lastUpdatedBy: user
        };
    }
}
