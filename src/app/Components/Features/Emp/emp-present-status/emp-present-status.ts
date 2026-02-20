import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';

import { EmpService } from '@/services/emp-service';
import { PresentStatusInfoService } from '@/services/present-status-info.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';
import { PresentStatusType, PresentStatusTypeOptions } from '@/models/enums';

@Component({
    selector: 'app-emp-present-status',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        ButtonModule,
        Fluid,
        SelectModule,
        DatePickerModule,
        TextareaModule,
        CheckboxModule,
        TooltipModule,
        TableModule,
        DialogModule,
        ConfirmDialogModule,
        ToastModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './emp-present-status.html',
    styleUrl: './emp-present-status.scss'
})
export class EmpPresentStatus implements OnInit {
    @ViewChild('fileReferencesForm') fileReferencesForm!: any;

    // Employee lookup
    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;

    // Mode
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly: boolean = false;

    // Table data
    recordList: any[] = [];
    isLoading: boolean = false;

    // Dialog
    displayDialog: boolean = false;
    isEditMode: boolean = false;
    isSaving: boolean = false;
    editingRecordId: number | null = null;

    // Form
    presentStatusForm!: FormGroup;
    fileRows: FileRowData[] = [];

    // Enum for template access
    PresentStatusType = PresentStatusType;

    // Selected status type (for conditional rendering in dialog)
    selectedStatusType: string | null = null;

    // Dropdown options
    statusTypes: any[] = PresentStatusTypeOptions;
    transferredUnits: any[] = [];
    absentTypes: any[] = [];

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private presentStatusService: PresentStatusInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.initializeForm();
        this.loadDropdownData();
        this.checkRouteParams();
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe((params) => {
            const employeeId = params['id'];
            const mode = params['mode'];

            if (employeeId) {
                this.mode = mode === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(employeeId, 10));
            } else {
                this.mode = 'search';
                this.isReadonly = false;
            }
        });
    }

    loadEmployeeById(employeeId: number): void {
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                if (employee) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = employee.employeeID || employee.EmployeeID;
                    this.employeeBasicInfo = employee;
                    this.loadRecordList();
                }
            },
            error: (err) => {
                console.error('Failed to load employee', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee data' });
            }
        });
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { id: this.selectedEmployeeId, mode: 'edit' },
            queryParamsHandling: 'merge'
        });
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    initializeForm(): void {
        this.presentStatusForm = this.fb.group({
            presentStatusType: [null],

            // Regular Posting Out
            rpoDate: [null],
            transferredUnit: [null],
            dateOfRelease: [null],
            dateOfReduceFromRabStrength: [null],
            rpoProfileShift: [false],

            // RTU on Discipline Issue
            rtuDate: [null],
            rtuTransferredUnit: [null],
            rtuCause: [''],
            rtuProfileShift: [false],

            // Deceased
            deceasedDate: [null],
            deceasedPlace: [''],
            deceasedReason: [''],
            deceasedProfileShift: [false],

            // Absent
            absentDate: [null],
            absentType: [null],
            incidentAbsentReport: [''],
            absentCourtOfInquiryReport: [''],
            absentProfileShift: [false],

            // Arrested
            arrestedDate: [null],
            incidentDetails: [''],
            arrestedCourtOfInquiryReport: [''],
            arrestedProfileShift: [false],

            // Common
            isActive: [true]
        });

        // Watch status type changes for conditional rendering & validation
        this.presentStatusForm.get('presentStatusType')?.valueChanges.subscribe((value) => {
            this.selectedStatusType = value;
            this.updateValidators(value);
        });
    }

    updateValidators(statusType: string | null): void {
        // Fields that can be required depending on status type
        const fieldsToReset = [
            'rpoDate', 'transferredUnit',
            'rtuDate', 'rtuTransferredUnit',
            'deceasedDate', 'deceasedPlace',
            'absentDate', 'absentType',
            'arrestedDate'
        ];

        // Clear all validators first
        fieldsToReset.forEach(field => {
            this.presentStatusForm.get(field)?.clearValidators();
            this.presentStatusForm.get(field)?.updateValueAndValidity({ emitEvent: false });
        });

        // Set required validators based on status type
        if (statusType === PresentStatusType.RegularPostingOut) {
            this.presentStatusForm.get('rpoDate')?.setValidators(Validators.required);
            this.presentStatusForm.get('transferredUnit')?.setValidators(Validators.required);
        } else if (statusType === PresentStatusType.RTUOnDisciplineIssue) {
            this.presentStatusForm.get('rtuDate')?.setValidators(Validators.required);
            this.presentStatusForm.get('rtuTransferredUnit')?.setValidators(Validators.required);
        } else if (statusType === PresentStatusType.Deceased) {
            this.presentStatusForm.get('deceasedDate')?.setValidators(Validators.required);
            this.presentStatusForm.get('deceasedPlace')?.setValidators(Validators.required);
        } else if (statusType === PresentStatusType.Absent) {
            this.presentStatusForm.get('absentDate')?.setValidators(Validators.required);
            this.presentStatusForm.get('absentType')?.setValidators(Validators.required);
        } else if (statusType === PresentStatusType.Arrested) {
            this.presentStatusForm.get('arrestedDate')?.setValidators(Validators.required);
        }

        // Update validity
        fieldsToReset.forEach(field => {
            this.presentStatusForm.get(field)?.updateValueAndValidity({ emitEvent: false });
        });
    }

    loadDropdownData(): void {
        // Load Absent Types
        this.commonCodeService.getAllActiveCommonCodesType('AbsentType').subscribe({
            next: (data) => (this.absentTypes = data.map((d) => ({ label: d.codeValueEN, value: d.codeValueEN }))),
            error: (err) => console.error('Failed to load absent types', err)
        });

        // Load RAB Units for Transferred Unit dropdown
        this.commonCodeService.getAllActiveCommonCodesType('RabUnit').subscribe({
            next: (data) => (this.transferredUnits = data.map((d) => ({ label: d.codeValueEN, value: d.codeId }))),
            error: (err) => console.error('Failed to load RAB units', err)
        });
    }

    // Handle employee search events
    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.loadRecordList();
    }

    onEmployeeSearchReset(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.recordList = [];
    }

    // ========== Table Data ==========

    loadRecordList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;

        this.presentStatusService.getAllByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data: any[]) => {
                this.recordList = data.map((d) => ({
                    presentStatusID: d.PresentStatusID ?? d.presentStatusID,
                    employeeID: d.EmployeeID ?? d.employeeID,
                    presentStatusType: d.PresentStatusType ?? d.presentStatusType,
                    dated: d.Dated ?? d.dated,
                    profileShift: d.ProfileShift ?? d.profileShift ?? false,
                    transferredUnitID: d.TransferredUnitID ?? d.transferredUnitID,
                    dateOfRelease: d.DateOfRelease ?? d.dateOfRelease,
                    reduceFromRABStrength: d.ReduceFromRABStrength ?? d.reduceFromRABStrength,
                    rtuCause: d.RTUCause ?? d.rtuCause,
                    absentTypeID: d.AbsentTypeID ?? d.absentTypeID,
                    absentReport: d.AbsentReport ?? d.absentReport,
                    inquiryReport: d.InquiryReport ?? d.inquiryReport,
                    incidentDetails: d.IncidentDetails ?? d.incidentDetails,
                    deceasedPlace: d.DeceasedPlace ?? d.deceasedPlace,
                    deceasedReason: d.DeceasedReason ?? d.deceasedReason,
                    supportingDocFilesReferences: d.SupportingDocFilesReferences ?? d.supportingDocFilesReferences,
                    isActive: d.IsActive ?? d.isActive
                }));
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Failed to load records', err);
                this.isLoading = false;
            }
        });
    }

    // ========== Dialog: Add / Edit ==========

    openAddDialog(): void {
        this.isEditMode = false;
        this.editingRecordId = null;
        this.presentStatusForm.reset({
            presentStatusType: PresentStatusType.OnDuty,
            rpoProfileShift: false,
            rtuProfileShift: false,
            deceasedProfileShift: false,
            absentProfileShift: false,
            arrestedProfileShift: false
        });
        this.selectedStatusType = PresentStatusType.OnDuty;
        this.fileRows = [];
        this.displayDialog = true;
    }

    openEditDialog(record: any): void {
        this.isEditMode = true;
        this.editingRecordId = record.presentStatusID;
        this.selectedStatusType = record.presentStatusType;

        const st = record.presentStatusType;
        const dated = record.dated ? new Date(record.dated) : null;

        const formValues: any = {
            presentStatusType: record.presentStatusType,
            // Reset all per-type fields first
            rpoDate: null, transferredUnit: null, dateOfRelease: null, dateOfReduceFromRabStrength: null, rpoProfileShift: false,
            rtuDate: null, rtuTransferredUnit: null, rtuCause: '', rtuProfileShift: false,
            deceasedDate: null, deceasedPlace: '', deceasedReason: '', deceasedProfileShift: false,
            absentDate: null, absentType: null, incidentAbsentReport: '', absentCourtOfInquiryReport: '', absentProfileShift: false,
            arrestedDate: null, incidentDetails: '', arrestedCourtOfInquiryReport: '', arrestedProfileShift: false,
            isActive: record.isActive ?? true
        };

        // Map backend unified fields to per-type form fields
        if (st === PresentStatusType.RegularPostingOut) {
            formValues.rpoDate = dated;
            formValues.transferredUnit = record.transferredUnitID;
            formValues.dateOfRelease = record.dateOfRelease ? new Date(record.dateOfRelease) : null;
            formValues.dateOfReduceFromRabStrength = record.reduceFromRABStrength ? new Date(record.reduceFromRABStrength) : null;
            formValues.rpoProfileShift = record.profileShift;
        } else if (st === PresentStatusType.RTUOnDisciplineIssue) {
            formValues.rtuDate = dated;
            formValues.rtuTransferredUnit = record.transferredUnitID;
            formValues.rtuCause = record.rtuCause || '';
            formValues.rtuProfileShift = record.profileShift;
        } else if (st === PresentStatusType.Deceased) {
            formValues.deceasedDate = dated;
            formValues.deceasedPlace = record.deceasedPlace || '';
            formValues.deceasedReason = record.deceasedReason || '';
            formValues.deceasedProfileShift = record.profileShift;
        } else if (st === PresentStatusType.Absent) {
            formValues.absentDate = dated;
            formValues.absentType = record.absentTypeID;
            formValues.incidentAbsentReport = record.absentReport || '';
            formValues.absentCourtOfInquiryReport = record.inquiryReport || '';
            formValues.absentProfileShift = record.profileShift;
        } else if (st === PresentStatusType.Arrested) {
            formValues.arrestedDate = dated;
            formValues.incidentDetails = record.incidentDetails || '';
            formValues.arrestedCourtOfInquiryReport = record.inquiryReport || '';
            formValues.arrestedProfileShift = record.profileShift;
        }

        this.presentStatusForm.patchValue(formValues);

        // Parse file references
        const refsJson = record.supportingDocFilesReferences;
        if (refsJson && typeof refsJson === 'string') {
            try {
                const refs = JSON.parse(refsJson) as { FileId?: number; fileName?: string }[];
                this.fileRows = Array.isArray(refs) ? refs.map((r) => ({ displayName: r.fileName || '', file: null, fileId: r.FileId })) : [];
            } catch {
                this.fileRows = [];
            }
        } else {
            this.fileRows = [];
        }

        this.displayDialog = true;
    }

    closeDialog(): void {
        this.displayDialog = false;
    }

    // ========== Save ==========

    saveRecord(): void {
        if (!this.selectedEmployeeId) return;

        // Mark all fields as touched to show validation errors
        this.presentStatusForm.markAllAsTouched();
        if (this.presentStatusForm.invalid) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please fill all required fields.' });
            return;
        }

        this.isSaving = true;

        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const payload = this.buildPayload(filesReferencesJson);
            const saveOrUpdate$ = this.isEditMode ? this.presentStatusService.update(payload) : this.presentStatusService.save(payload);

            saveOrUpdate$.subscribe({
                next: () => {
                    this.isSaving = false;
                    this.displayDialog = false;
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: this.isEditMode ? 'Record updated successfully!' : 'Record saved successfully!'
                    });
                    this.loadRecordList();
                },
                error: (err) => {
                    this.isSaving = false;
                    console.error('Failed to save/update', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save record' });
                }
            });
        };

        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) => this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name));
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map((r) => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs = [...existingRefs.map((r: { FileId: number; fileName: string }) => ({ FileId: r.FileId, fileName: r.fileName })), ...newRefs];
                    doSave(allRefs.length > 0 ? JSON.stringify(allRefs) : null);
                },
                error: (err) => {
                    this.isSaving = false;
                    console.error('Error uploading files', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload files' });
                }
            });
            return;
        }

        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
    }

    buildPayload(filesReferencesJson?: string | null): any {
        const f = this.presentStatusForm.getRawValue();
        const toDateStr = (val: any) => {
            if (!val) return null;
            const d = new Date(val);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const st = f.presentStatusType;

        // Pick the date field based on selected status type (Dated is non-nullable in backend)
        let dated: string | null = toDateStr(new Date()); // default to today
        if (st === PresentStatusType.RegularPostingOut) dated = toDateStr(f.rpoDate) || dated;
        else if (st === PresentStatusType.RTUOnDisciplineIssue) dated = toDateStr(f.rtuDate) || dated;
        else if (st === PresentStatusType.Deceased) dated = toDateStr(f.deceasedDate) || dated;
        else if (st === PresentStatusType.Absent) dated = toDateStr(f.absentDate) || dated;
        else if (st === PresentStatusType.Arrested) dated = toDateStr(f.arrestedDate) || dated;

        // Pick profile shift based on selected status type
        let profileShift = false;
        if (st === PresentStatusType.RegularPostingOut) profileShift = f.rpoProfileShift || false;
        else if (st === PresentStatusType.RTUOnDisciplineIssue) profileShift = f.rtuProfileShift || false;
        else if (st === PresentStatusType.Deceased) profileShift = f.deceasedProfileShift || false;
        else if (st === PresentStatusType.Absent) profileShift = f.absentProfileShift || false;
        else if (st === PresentStatusType.Arrested) profileShift = f.arrestedProfileShift || false;

        // Pick transferred unit ID
        let transferredUnitID: number | null = null;
        if (st === PresentStatusType.RegularPostingOut) transferredUnitID = f.transferredUnit;
        else if (st === PresentStatusType.RTUOnDisciplineIssue) transferredUnitID = f.rtuTransferredUnit;

        // Pick inquiry report
        let inquiryReport: string | null = null;
        if (st === PresentStatusType.Absent) inquiryReport = f.absentCourtOfInquiryReport;
        else if (st === PresentStatusType.Arrested) inquiryReport = f.arrestedCourtOfInquiryReport;

        const payload: any = {
            EmployeeID: this.selectedEmployeeId,
            PresentStatusType: f.presentStatusType,
            Dated: dated,
            ProfileShift: profileShift,
            TransferredUnitID: transferredUnitID,
            DateOfRelease: toDateStr(f.dateOfRelease),
            ReduceFromRABStrength: toDateStr(f.dateOfReduceFromRabStrength),
            RTUCause: f.rtuCause || null,
            AbsentTypeID: f.absentType || null,
            AbsentReport: f.incidentAbsentReport || null,
            InquiryReport: inquiryReport,
            IncidentDetails: f.incidentDetails || null,
            DeceasedPlace: f.deceasedPlace || null,
            DeceasedReason: f.deceasedReason || null,
            SupportingDocFilesReferences: filesReferencesJson ?? null,
            IsActive: f.isActive ?? true,
            CreatedBy: 'system',
            CreatedDate: new Date().toISOString(),
            LastUpdatedBy: 'system',
            Lastupdate: new Date().toISOString()
        };

        // Only include PresentStatusID for updates (identity column)
        if (this.isEditMode && this.editingRecordId) {
            payload.PresentStatusID = this.editingRecordId;
        }

        return payload;
    }

    // ========== Delete ==========

    deleteRecord(record: any, event: Event): void {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Are you sure you want to delete this record?',
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.presentStatusService.delete(record.presentStatusID, this.selectedEmployeeId!).subscribe({
                    next: () => {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Record deleted successfully' });
                        this.loadRecordList();
                    },
                    error: (err) => {
                        console.error('Failed to delete', err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete record' });
                    }
                });
            }
        });
    }

    // ========== File Handlers ==========

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) {
            this.fileRows = event;
        }
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err) => {
                console.error('Download failed', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file' });
            }
        });
    }

    // ========== Helpers ==========

    getStatusLabel(value: string): string {
        const option = PresentStatusTypeOptions.find((o) => o.value === value);
        return option ? option.label : value || 'N/A';
    }

    formatDate(dateStr: string | null): string {
        if (!dateStr) return 'N/A';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-GB');
        } catch {
            return dateStr;
        }
    }

    getRecordDate(record: any): string {
        return this.formatDate(record.dated);
    }

    getProfileShift(record: any): boolean {
        return record.profileShift || false;
    }
}
