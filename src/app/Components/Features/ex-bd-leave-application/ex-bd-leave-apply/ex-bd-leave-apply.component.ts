import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';
import { FluidModule } from 'primeng/fluid';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { TextareaModule } from 'primeng/textarea';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { EmpService } from '@/services/emp-service';
import { buildUploadOwnerTag } from '@/shared/utils/upload-file-name.util';
import { FamilyInfoService, FamilyInfoModel } from '@/services/family-info-service';
import { SharedService } from '@/shared/services/shared-service';
import { ExBdLeaveApplicationService, DestinationCountryItem, FamilyMemberItem, FileReferenceItem } from '@/services/ex-bd-leave-application.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { ExBdLeaveStatus } from '@/models/enums';
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-ex-bd-leave-apply',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        FluidModule,
        InputTextModule,
        ButtonModule,
        SelectModule,
        MultiSelectModule,
        DatePickerModule,
        FlexibleDateDirective,
        ToastModule,
        TextareaModule,
        DialogModule,
        TooltipModule,
        FileReferencesFormComponent,
        EmployeeSearchComponent
    ],
    templateUrl: './ex-bd-leave-apply.component.html',
    styleUrl: './ex-bd-leave-apply.component.scss',
    providers: [MessageService]
})
export class ExBdLeaveApplyComponent implements OnInit {
    private fb = inject(FormBuilder);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private messageService = inject(MessageService);
    private masterService = inject(MasterBasicSetupService);
    private empService = inject(EmpService);
    private familyInfoService = inject(FamilyInfoService);
    private sharedService = inject(SharedService);
    private exBdLeaveService = inject(ExBdLeaveApplicationService);
    private servingMembersService = inject(ServingMembersService);

    @ViewChild(EmployeeSearchComponent) employeeSearchRef!: EmployeeSearchComponent;

    form!: FormGroup;
    isSubmitting = false;
    editMode = false;
    editId = 0;
    editEmployeeId: number | null = null;
    editApplicantDisplay = '';

    // Selected applicant from employee search
    selectedApplicant: EmployeeBasicInfo | null = null;

    // Dropdown options
    visitTypeOptions: { label: string; value: number }[] = [];
    countryOptions: { label: string; value: number }[] = [];
    familyMemberOptions: { label: string; value: number; fmid: number; employeeId: number; relationLabel?: string }[] = [];

    // Selected countries (multiple)
    selectedCountries: DestinationCountryItem[] = [];

    // File upload
    fileRows: FileRowData[] = [];

    // Add Visit Type dialog
    showVisitTypeDialog = false;
    isSavingVisitType = false;
    newVisitType: Partial<CommonCode> = { codeValueEN: '', codeValueBN: '' };

    ngOnInit(): void {
        this.initForm();
        this.loadDropdowns();
        this.setupDateCalculation();

        const idParam = this.route.snapshot.paramMap.get('id');
        if (idParam) {
            this.editMode = true;
            this.editId = +idParam;
            this.loadForEdit(this.editId);
        }
    }

    private initForm(): void {
        this.form = this.fb.group({
            applicationDate: [new Date(), Validators.required],
            applicantEmployeeId: [null, Validators.required],
            visitTypeId: [null, Validators.required],
            destinationCountryIds: [[] as number[]],
            fromDate: [null, Validators.required],
            toDate: [null, Validators.required],
            totalDays: [{ value: 0, disabled: true }],
            familyMemberIds: [[] as number[]],
            remarks: ['']
        });
    }

    private loadDropdowns(): void {
        forkJoin({
            visitTypes: this.masterService.getAllByType('VisitType'),
            countries: this.masterService.getAllByType('Country')
        }).subscribe({
            next: ({ visitTypes, countries }) => {
                this.visitTypeOptions = (visitTypes as CommonCode[])
                    .filter((c: CommonCode) => c.status)
                    .map((c: CommonCode) => ({ label: c.codeValueEN, value: c.codeId }));

                this.countryOptions = (countries as CommonCode[])
                    .filter((c: CommonCode) => c.status)
                    .map((c: CommonCode) => ({ label: c.codeValueEN, value: c.codeId }));
            }
        });
    }

    private setupDateCalculation(): void {
        this.form.get('fromDate')?.valueChanges.subscribe(() => this.calculateTotalDays());
        this.form.get('toDate')?.valueChanges.subscribe(() => this.calculateTotalDays());
    }

    private calculateTotalDays(): void {
        const from = this.form.get('fromDate')?.value;
        const to = this.form.get('toDate')?.value;
        if (from && to) {
            const fromDate = new Date(from);
            const toDate = new Date(to);
            const diffTime = toDate.getTime() - fromDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
            this.form.get('totalDays')?.setValue(diffDays > 0 ? diffDays : 0);
        } else {
            this.form.get('totalDays')?.setValue(0);
        }
    }

    private loadForEdit(id: number): void {
        this.exBdLeaveService.getById(id).subscribe({
            next: (app: any) => {
                if (!app) return;

                const countryIds: number[] = app.destinationCountriesJson ? JSON.parse(app.destinationCountriesJson) : [];
                const familyIds: number[] = app.familyMembersJson ? JSON.parse(app.familyMembersJson) : [];
                const files: FileReferenceItem[] = app.filesReferencesJson ? JSON.parse(app.filesReferencesJson) : [];

                this.form.patchValue({
                    applicationDate: new Date(app.applicationDate),
                    applicantEmployeeId: app.applicantEmployeeId,
                    visitTypeId: app.visitTypeId,
                    destinationCountryIds: countryIds,
                    fromDate: new Date(app.fromDate),
                    toDate: new Date(app.toDate),
                    familyMemberIds: familyIds,
                    remarks: app.remarks
                });

                // Load employee info for display
                this.empService.getEmployeeById(app.applicantEmployeeId).subscribe({
                    next: (emp: any) => {
                        const sid = emp?.ServiceId || emp?.serviceId || '';
                        this.editApplicantDisplay = sid ? `Service ID: ${sid}` : `Employee ID: ${app.applicantEmployeeId}`;
                    }
                });

                // Load family members for the applicant (preserve selected IDs)
                this.loadFamilyMembers(app.applicantEmployeeId, true);

                // Set file rows
                this.fileRows = files.map(f => ({ fileId: f.fileId, displayName: f.fileName } as FileRowData));
            }
        });
    }

    onApplicantFound(info: EmployeeBasicInfo): void {
        // Access control first: the searched applicant must be within the current user's
        // accessible org scope + member types. If not, deny with a message and clear the search.
        this.servingMembersService.checkMemberAccess(info.employeeID).subscribe({
            next: (res) => {
                if (res && res.accessible === false) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Access denied',
                        detail: res.reason || "You don't have permission to view this employee (outside your assigned units / member types).",
                        life: 8000
                    });
                    this.employeeSearchRef?.reset();
                    return;
                }
                this.proceedApplicantFound(info);
            },
            // Resilient: a transient check failure shouldn't block a legitimate selection.
            error: () => this.proceedApplicantFound(info)
        });
    }

    private proceedApplicantFound(info: EmployeeBasicInfo): void {
        // In edit mode, skip eligibility check — the active application is the one being edited
        if (this.editMode) {
            this.selectedApplicant = info;
            this.form.patchValue({ applicantEmployeeId: info.employeeID });
            return;
        }

        // Check eligibility (rules 1 & 2) immediately after employee search
        this.exBdLeaveService.checkEligibility(info.employeeID).subscribe({
            next: (res: any) => {
                // Eligible — proceed with selection
                this.selectedApplicant = info;
                this.form.patchValue({ applicantEmployeeId: info.employeeID });
                this.loadFamilyMembers(info.employeeID);
            },
            error: (err: any) => {
                // Backend returns 400 with description when not eligible
                const detail = err.error?.description || 'Employee is not eligible for Ex-BD leave.';
                this.messageService.add({
                    severity: 'error',
                    summary: 'Not Eligible',
                    detail,
                    life: 8000
                });
                // Clear the search component fields
                this.employeeSearchRef?.reset();
            }
        });
    }

    private loadFamilyMembers(employeeId: number, preserveSelection = false): void {
        this.familyMemberOptions = [];
        if (!preserveSelection) {
            this.form.get('familyMemberIds')?.setValue([]);
        }
        this.familyInfoService.getByEmployeeId(employeeId).subscribe({
            next: (list: any[]) => {
                this.familyMemberOptions = list.map((f: any) => ({
                    label: f.nameEN || f.NameEN || f.nameBN || f.NameBN || `Family #${f.fmid || f.FMID}`,
                    value: f.fmid || f.FMID,
                    fmid: f.fmid || f.FMID,
                    employeeId: f.employeeId || f.EmployeeId,
                    relationLabel: ''
                }));
            }
        });
    }

    onApplicantReset(): void {
        this.selectedApplicant = null;
        this.form.patchValue({ applicantEmployeeId: null });
        this.familyMemberOptions = [];
        this.form.get('familyMemberIds')?.setValue([]);
    }

    showAddVisitTypeDialog(): void {
        this.newVisitType = { codeValueEN: '', codeValueBN: '' };
        this.showVisitTypeDialog = true;
    }

    saveNewVisitType(): void {
        if (!this.newVisitType.codeValueEN?.trim()) return;

        this.isSavingVisitType = true;
        const data: any = {
            codeId: 0,
            codeType: 'VisitType',
            codeValueEN: this.newVisitType.codeValueEN!.trim(),
            codeValueBN: this.newVisitType.codeValueBN?.trim() || null,
            status: true,
            createdBy: this.sharedService.getCurrentUser(),
            createdDate: this.sharedService.getCurrentDateTime()
        };

        this.masterService.create(data).subscribe({
            next: () => {
                this.isSavingVisitType = false;
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Visit Type added successfully.' });
                this.showVisitTypeDialog = false;
                // Reload visit types and auto-select the new one
                this.masterService.getAllByType('VisitType').subscribe((visitTypes: any) => {
                    this.visitTypeOptions = (visitTypes as CommonCode[])
                        .filter((c: CommonCode) => c.status)
                        .map((c: CommonCode) => ({ label: c.codeValueEN, value: c.codeId }));
                    // Auto-select the newly added entry (highest codeId)
                    const newest = this.visitTypeOptions.reduce((max, opt) => opt.value > max.value ? opt : max, this.visitTypeOptions[0]);
                    if (newest) {
                        this.form.patchValue({ visitTypeId: newest.value });
                    }
                });
            },
            error: () => {
                this.isSavingVisitType = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'An error occurred while saving Visit Type.' });
            }
        });
    }

    onFileRowsChange(rows: FileRowData[]): void {
        this.fileRows = rows;
    }

    onDownloadFile(event: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(event.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, event.fileName || 'download'),
            error: (err: any) => {
                console.error('Download failed', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to download file'
                });
            }
        });
    }

    private formatDate(d: Date): string {
        if (!d) return '';
        const dt = new Date(d);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }

    submit(): void {
        // Guard against double submission while a save is already in flight.
        if (this.isSubmitting) return;
        if (this.form.invalid) {
            Object.values(this.form.controls).forEach(c => c.markAsTouched());
            return;
        }

        this.isSubmitting = true;
        const v = this.form.getRawValue();

        // In edit mode, skip eligibility check — the application already exists
        if (this.editMode) {
            this.performSave(v);
            return;
        }

        // Step 1: Check eligibility (with dates for rule 3) before saving
        this.exBdLeaveService.checkEligibility(
            v.applicantEmployeeId,
            this.formatDate(v.fromDate),
            this.formatDate(v.toDate)
        ).subscribe({
            next: () => {
                // All checks passed — proceed with save
                this.performSave(v);
            },
            error: (err: any) => {
                this.isSubmitting = false;
                const detail = err.error?.description || 'Employee is not eligible for this leave.';
                this.messageService.add({
                    severity: 'error',
                    summary: 'Eligibility Check Failed',
                    detail,
                    life: 8000
                });
            }
        });
    }

    /** Uploads any newly picked attachments, then saves. Rows already carrying a FileId are left alone. */
    private performSave(v: any): void {
        const pendingFiles = this.fileRows.filter((r) => r.file != null && r.fileId == null);

        if (pendingFiles.length === 0) {
            this.saveApplication(v);
            return;
        }

        const owner = buildUploadOwnerTag(this.selectedApplicant?.rabid, v.applicantEmployeeId ?? this.editEmployeeId);

        forkJoin(pendingFiles.map((r) => this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name, owner))).subscribe({
            next: (results) => {
                // Stamp each row with its FileId so it serialises below and is never uploaded twice.
                results.forEach((res, i) => {
                    pendingFiles[i].fileId = res.fileId;
                    pendingFiles[i].file = null;
                });
                this.saveApplication(v);
            },
            error: (err: any) => {
                this.isSubmitting = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to upload one or more files.'
                });
            }
        });
    }

    private saveApplication(v: any): void {
        // Build JSON arrays
        const countriesJson = JSON.stringify(v.destinationCountryIds || []);

        const familyJson = JSON.stringify(v.familyMemberIds || []);

        const filesJson = JSON.stringify(
            this.fileRows
                .filter(r => r.fileId)
                .map(r => ({ fileId: r.fileId!, fileName: r.displayName } as FileReferenceItem))
        );

        const payload: any = {
            exBdLeaveApplicationId: this.editMode ? this.editId : 0,
            applicationDate: this.formatDate(v.applicationDate),
            applicantEmployeeId: v.applicantEmployeeId,
            visitTypeId: v.visitTypeId,
            destinationCountriesJson: countriesJson,
            fromDate: this.formatDate(v.fromDate),
            toDate: this.formatDate(v.toDate),
            totalDays: v.totalDays,
            familyMembersJson: familyJson,
            filesReferencesJson: filesJson,
            applicationStatus: ExBdLeaveStatus.Processing,
            remarks: v.remarks || null,
            lastUpdatedBy: this.sharedService.getCurrentUser()
        };

        if (!this.editMode) {
            payload.createdBy = this.sharedService.getCurrentUser();
        }

        const action$ = this.editMode
            ? this.exBdLeaveService.update(payload)
            : this.exBdLeaveService.save(payload);

        action$.subscribe({
            next: (res: any) => {
                this.isSubmitting = false;
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: this.editMode ? 'Application updated successfully.' : 'Application saved successfully.' });
                    this.router.navigate(['/ex-bd-leave/list']);
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description || 'Failed to save.' });
                }
            },
            error: () => {
                this.isSubmitting = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'An error occurred while saving.' });
            }
        });
    }
}
