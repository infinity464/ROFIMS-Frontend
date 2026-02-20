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
import { MultiSelectModule } from 'primeng/multiselect';
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
        MultiSelectModule,
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
    hasReliever = false;
    relieverInfo: EmployeeBasicInfo | null = null;
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
            fromDate: [null as Date | null, Validators.required],
            toDate: [null as Date | null, Validators.required],
            relieverEmployeeId: [null as number | null],
            addressDuringLeave: [''],
            remarks: [''],
            recommenderIds: [[] as number[]],
            finalApproverId: [null as number | null]
        });
    }

    loadLeaveTypes(): void {
        this.masterBasicSetup.getAllByType('LeaveType').subscribe({
            next: (list) => {
                this.leaveTypeOptions = (Array.isArray(list) ? list : []).map((c: any) => ({
                    label: c.codeValueEN || c.CodeValueEN || String(c.codeId ?? c.CodeId),
                    value: c.codeId ?? c.CodeId
                }));
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load leave types' })
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
            error: () => {}
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
                    error: () =>
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee details' })
                });
            },
            error: () =>
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to resolve employee mapping' })
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
                if (!d || (d.leaveApplicationStatusId !== 1 && d.leaveApplicationStatusId !== 0)) {
                    this.messageService.add({ severity: 'warn', summary: 'Cannot edit', detail: 'Only draft can be edited.' });
                    return;
                }
                const from = d.fromDate ? new Date(d.fromDate) : null;
                const to = d.toDate ? new Date(d.toDate) : null;
                let recommenderIds: number[] = [];
                try {
                    const j = d.recommenderIdsJson ?? (d as any).RecommenderIdsJson;
                    if (j && typeof j === 'string') {
                        const arr = JSON.parse(j);
                        recommenderIds = Array.isArray(arr) ? arr.map((r: any) => (typeof r === 'number' ? r : (r.employeeId ?? r.EmployeeId ?? 0))) : [];
                    }
                } catch {}
                this.form.patchValue({
                    applicantEmployeeId: d.applicantEmployeeId ?? (d as any).ApplicantEmployeeId,
                    leaveTypeId: d.leaveTypeId ?? (d as any).LeaveTypeId,
                    fromDate: from,
                    toDate: to,
                    relieverEmployeeId: d.relieverEmployeeId ?? (d as any).RelieverEmployeeId ?? null,
                    addressDuringLeave: d.addressDuringLeave ?? (d as any).AddressDuringLeave ?? '',
                    remarks: d.remarks ?? (d as any).Remarks ?? '',
                    recommenderIds,
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
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load application' })
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
            error: () => {
                this.isSaving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save draft' });
            }
        });
    }

    submitForApproval(): void {
        if (!this.buildAndValidate()) return;
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
                error: () => {
                    this.isSaving = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to submit' });
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
                error: () => {
                    this.isSaving = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save' });
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
                error: () => {
                    this.isSaving = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to submit' });
                }
            });
        }
    }

    private buildAndValidate(): boolean {
        const applicantId = this.form.get('applicantEmployeeId')?.value ?? this.applicantEmployeeId;
        if (!applicantId) {
            this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Select applicant (yourself or search by RAB ID/Service ID).' });
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
        const recommenderIds = (this.form.get('recommenderIds')?.value as number[]) ?? [];
        const recommenderIdsJson = JSON.stringify(recommenderIds);
        return {
            applicantEmployeeId: applicantId,
            appliedByEmployeeId: appliedBy ?? applicantId,
            leaveTypeId: this.form.get('leaveTypeId')?.value,
            fromDate: from ? from.toISOString().slice(0, 10) : '',
            toDate: to ? to.toISOString().slice(0, 10) : '',
            relieverEmployeeId: this.form.get('relieverEmployeeId')?.value ?? null,
            addressDuringLeave: this.form.get('addressDuringLeave')?.value ?? '',
            remarks: this.form.get('remarks')?.value ?? '',
            recommenderIdsJson,
            finalApproverId: this.form.get('finalApproverId')?.value ?? null,
            leaveApplicationStatusId: statusId,
            createdBy: user,
            lastUpdatedBy: user
        };
    }
}
