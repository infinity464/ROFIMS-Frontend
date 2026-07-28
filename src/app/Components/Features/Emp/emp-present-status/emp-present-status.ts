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

import { UserMenuService } from '@/services/user-menu.service';
import { SharedService } from '@/shared/services/shared-service';
import { EmpService } from '@/services/emp-service';
import { PresentStatusInfoService } from '@/services/present-status-info.service';
import { CommonCodeService } from '@/services/common-code-service';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';
import { PresentStatusType, PresentStatusTypeOptions, PostingStatus } from '@/models/enums';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

@Component({
    selector: 'app-emp-present-status',
    standalone: true,
    imports: [
        CommonModule, FormsModule, ReactiveFormsModule,
        InputTextModule, ButtonModule, Fluid, SelectModule,
        DatePickerModule, FlexibleDateDirective, TextareaModule,
        CheckboxModule, TooltipModule, TableModule, DialogModule,
        ConfirmDialogModule, ToastModule,
        EmployeeSearchComponent, FileReferencesFormComponent
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './emp-present-status.html',
    styleUrl: './emp-present-status.scss'
})
export class EmpPresentStatus implements OnInit {
    canInsert = true;
    canUpdate = true;

    @ViewChild('fileReferencesForm') fileReferencesForm!: any;
    @ViewChild('bfaFileReferencesForm') bfaFileReferencesForm!: any;

    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    employeePostingStatus: string | null = null;

    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    recordList: any[] = [];
    isLoading = false;

    // Add/Edit dialog
    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    editingRecordId: number | null = null;
    /** Profile Shift value of the record as ORIGINALLY saved (used to lock editing of a
     *  record that has already moved the employee to Ex Member). */
    private editingProfileShiftOriginal = false;
    presentStatusForm!: FormGroup;
    fileRows: FileRowData[] = [];
    selectedStatusType: string | null = null;

    // View dialog
    displayViewDialog = false;
    viewRecord: any = null;
    viewFileRows: { fileName: string; fileId?: number }[] = [];

    // Back From Arrested dialog
    displayBfaDialog = false;
    bfaForm!: FormGroup;
    bfaEditMode = false;
    bfaEditingRecordId: number | null = null;
    bfaLinkedArrestedId: number | null = null;
    bfaLinkedArrestedLabel = '';
    bfaStatusType: string = PresentStatusType.BackFromArrested;
    bfaSaving = false;
    bfaFileRows: FileRowData[] = [];

    PresentStatusType = PresentStatusType;

    private readonly singleInstanceStatusTypes: string[] = [
        PresentStatusType.OnDuty,
        PresentStatusType.RegularPostingOut,
        PresentStatusType.RTUOnDisciplineIssue,
        PresentStatusType.Deceased
    ];

    statusTypes = PresentStatusTypeOptions;
    transferredUnits: any[] = [];
    motherOrgUnits: any[] = [];
    absentTypes: any[] = [];

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private empService: EmpService,
        private presentStatusService: PresentStatusInfoService,
        private commonCodeService: CommonCodeService,
        private organizationService: OrganizationService,
        private userMenuService: UserMenuService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private sharedService: SharedService
    ) {}

    /** Logged-in user for CreatedBy / LastUpdatedBy. Falls back to 'system' only when nobody is signed in. */
    private get auditUser(): string {
        return this.sharedService.getCurrentUser() ?? 'system';
    }

    ngOnInit(): void {
        const perms = this.userMenuService.getPermissionsByRoute(this.router.url);
        this.canInsert = perms.canInsert;
        this.canUpdate = perms.canUpdate;

        this.initializeForm();
        this.initBfaForm();
        this.loadDropdownData();
        this.checkRouteParams();
    }

    // ========== Initialization ==========

    private initializeForm(): void {
        this.presentStatusForm = this.fb.group({
            presentStatusType: [null],
            rpoDate: [null], transferredUnit: [null], dateOfRelease: [null], dateOfReduceFromRabStrength: [null], rpoProfileShift: [false],
            rtuDate: [null], rtuTransferredUnit: [null], rtuCause: [''], rtuProfileShift: [false],
            deceasedDate: [null], deceasedPlace: [''], deceasedReason: [''], deceasedProfileShift: [false],
            absentDate: [null], absentType: [null], incidentAbsentReport: [''], absentCourtOfInquiryReport: [''], absentProfileShift: [false],
            arrestedDate: [null], incidentDetails: [''], arrestedCourtOfInquiryReport: [''], arrestedProfileShift: [false]
        });

        this.presentStatusForm.get('presentStatusType')?.valueChanges.subscribe((value) => {
            this.selectedStatusType = value;
            this.updateValidators(value);
            this.applyDeceasedRules(value);
        });
    }

    private initBfaForm(): void {
        this.bfaForm = this.fb.group({
            backFromArrestedDate: [null, Validators.required],
            backFromArrestedReason: [''],
            courtOrderReference: ['']
        });
    }

    private applyDeceasedRules(statusType: string | null): void {
        const shiftCtrl = this.presentStatusForm.get('deceasedProfileShift');
        if (statusType === PresentStatusType.Deceased) {
            shiftCtrl?.setValue(true, { emitEvent: false });
            shiftCtrl?.disable({ emitEvent: false });
        } else {
            shiftCtrl?.enable({ emitEvent: false });
        }
    }

    private updateValidators(statusType: string | null): void {
        const fieldsToReset = [
            'rpoDate', 'transferredUnit',
            'rtuDate', 'rtuTransferredUnit',
            'deceasedDate', 'deceasedPlace',
            'absentDate', 'absentType',
            'arrestedDate'
        ];

        fieldsToReset.forEach(field => {
            this.presentStatusForm.get(field)?.clearValidators();
            this.presentStatusForm.get(field)?.updateValueAndValidity({ emitEvent: false });
        });

        const setRequired = (...fields: string[]) =>
            fields.forEach(f => this.presentStatusForm.get(f)?.setValidators(Validators.required));

        if (statusType === PresentStatusType.RegularPostingOut) setRequired('rpoDate', 'transferredUnit');
        else if (statusType === PresentStatusType.RTUOnDisciplineIssue) setRequired('rtuDate', 'rtuTransferredUnit');
        else if (statusType === PresentStatusType.Deceased) setRequired('deceasedDate', 'deceasedPlace');
        else if (statusType === PresentStatusType.Absent) setRequired('absentDate', 'absentType');
        else if (statusType === PresentStatusType.Arrested) setRequired('arrestedDate');

        fieldsToReset.forEach(field => {
            this.presentStatusForm.get(field)?.updateValueAndValidity({ emitEvent: false });
        });
    }

    // ========== Computed Properties ==========

    get hasDeceasedRecord(): boolean {
        return this.recordList.some(r => r.presentStatusType === PresentStatusType.Deceased);
    }

    get canAddStatus(): boolean {
        return this.employeePostingStatus === PostingStatus.Servings;
    }

    get currentActiveStatusType(): string | null {
        return this.recordList.find(r => r.isActive)?.presentStatusType ?? null;
    }

    get isUpdateDisabled(): boolean {
        if (!this.isEditMode) return false;
        // Profile-shift lock applies ONLY to Regular Posting Out and RTU (On Discipline Issue).
        const st = this.selectedStatusType ?? '';
        if (st !== PresentStatusType.RegularPostingOut && st !== PresentStatusType.RTUOnDisciplineIssue) return false;
        // Lock editing only for a record that was ALREADY saved with Profile Shift ticked
        // (the employee is already on the Ex Member list). Ticking Profile Shift now — to
        // perform the shift — must keep Update enabled so it can be saved.
        return this.editingProfileShiftOriginal;
    }

    get bfaDialogHeader(): string {
        const label = this.bfaStatusType === PresentStatusType.BackFromAbsent ? 'Back From Absent' : 'Back From Arrested';
        return this.bfaEditMode ? `Edit ${label}` : label;
    }

    get bfaSourceLabel(): string {
        return this.bfaStatusType === PresentStatusType.BackFromAbsent ? 'Absent' : 'Arrested';
    }

    // ========== Route & Employee ==========

    checkRouteParams(): void {
        this.route.queryParams.subscribe((params) => {
            const employeeId = params['id'];
            if (employeeId) {
                this.mode = params['mode'] === 'edit' ? 'edit' : 'view';
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
                    this.employeePostingStatus = employee.PostingStatus ?? employee.postingStatus ?? null;
                    this.loadEmployeeOrgUnits(this.selectedEmployeeId!);
                    this.loadRecordList();
                }
            },
            error: (err) => this.showError(err?.error?.message || 'Failed to load employee data')
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

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.loadPostingStatus(employee.employeeID);
        this.loadEmployeeOrgUnits(employee.employeeID);
        this.loadRecordList();
    }

    onEmployeeSearchReset(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.employeePostingStatus = null;
        this.recordList = [];
        this.motherOrgUnits = [];
        this.transferredUnits = [];
    }

    // ========== Data Loading ==========

    private loadPostingStatus(employeeId: number): void {
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (emp: any) => (this.employeePostingStatus = emp?.PostingStatus ?? emp?.postingStatus ?? null),
            error: () => (this.employeePostingStatus = null)
        });
    }

    loadDropdownData(): void {
        this.commonCodeService.getAllActiveCommonCodesType('AbsentType').subscribe({
            next: (data) => (this.absentTypes = data.map(d => ({ label: d.codeValueEN, value: d.codeId }))),
            error: (err) => console.error('Failed to load absent types', err)
        });
    }

    loadEmployeeOrgUnits(employeeId: number): void {
        this.organizationService.getOrgUnitsByEmployeeId(employeeId).subscribe({
            next: (data: any[]) => {
                const units = (data || []).map((d: any) => ({ label: d.orgNameEN ?? d.OrgNameEN, value: d.orgId ?? d.OrgId }));
                this.motherOrgUnits = units;
                this.transferredUnits = units;
            },
            error: (err) => console.error('Failed to load employee mother-org units', err)
        });
    }

    loadRecordList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;

        this.presentStatusService.getAllByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data: any[]) => {
                this.recordList = data.map(d => ({
                    presentStatusID: d.PresentStatusID ?? d.presentStatusID,
                    employeeID: d.EmployeeID ?? d.employeeID,
                    presentStatusType: d.PresentStatusType ?? d.presentStatusType,
                    dated: d.Dated ?? d.dated,
                    profileShift: d.ProfileShift ?? d.profileShift ?? false,
                    transferredUnitID: d.TransferredUnitID ?? d.transferredUnitID,
                    motherOrgTransferredUnitID: d.MotherOrgTransferredUnitID ?? d.motherOrgTransferredUnitID,
                    dateOfRelease: d.DateOfRelease ?? d.dateOfRelease,
                    reduceFromRABStrength: d.ReduceFromRABStrength ?? d.reduceFromRABStrength,
                    rtuCause: d.RTUCause ?? d.rtuCause,
                    absentTypeID: d.AbsentTypeID ?? d.absentTypeID,
                    absentReport: d.AbsentReport ?? d.absentReport,
                    inquiryReport: d.InquiryReport ?? d.inquiryReport,
                    incidentDetails: d.IncidentDetails ?? d.incidentDetails,
                    deceasedPlace: d.DeceasedPlace ?? d.deceasedPlace,
                    deceasedReason: d.DeceasedReason ?? d.deceasedReason,
                    arrestedPresentStatusID: d.ArrestedPresentStatusID ?? d.arrestedPresentStatusID,
                    backFromArrestedReason: d.BackFromArrestedReason ?? d.backFromArrestedReason,
                    backFromArrestedDate: d.BackFromArrestedDate ?? d.backFromArrestedDate,
                    courtOrderReference: d.CourtOrderReference ?? d.courtOrderReference,
                    absentPresentStatusID: d.AbsentPresentStatusID ?? d.absentPresentStatusID,
                    backFromAbsentReason: d.BackFromAbsentReason ?? d.backFromAbsentReason,
                    backFromAbsentDate: d.BackFromAbsentDate ?? d.backFromAbsentDate,
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

    // ========== Add/Edit Dialog ==========

    openAddDialog(): void {
        if (!this.canAddStatus) {
            this.showWarn('Not Allowed', 'Only presently serving employees can have a present status added.');
            return;
        }
        this.isEditMode = false;
        this.editingRecordId = null;
        this.editingProfileShiftOriginal = false;
        this.presentStatusForm.reset({
            presentStatusType: PresentStatusType.OnDuty,
            rpoProfileShift: false, rtuProfileShift: false,
            deceasedProfileShift: false, absentProfileShift: false, arrestedProfileShift: false
        });
        this.selectedStatusType = PresentStatusType.OnDuty;
        this.fileRows = [];
        this.displayDialog = true;
    }

    openEditDialog(record: any): void {
        if (!record.isActive) {
            this.showWarn('Not Allowed', 'Inactive status records cannot be edited.');
            return;
        }

        if (record.presentStatusType === PresentStatusType.BackFromArrested || record.presentStatusType === PresentStatusType.BackFromAbsent) {
            this.openEditBackFrom(record);
            return;
        }

        this.isEditMode = true;
        this.editingRecordId = record.presentStatusID;
        this.editingProfileShiftOriginal = !!record.profileShift;
        this.selectedStatusType = record.presentStatusType;

        const st = record.presentStatusType;
        const dated = record.dated ? new Date(record.dated) : null;

        const formValues: any = {
            presentStatusType: st,
            rpoDate: null, transferredUnit: null, dateOfRelease: null, dateOfReduceFromRabStrength: null, rpoProfileShift: false,
            rtuDate: null, rtuTransferredUnit: null, rtuCause: '', rtuProfileShift: false,
            deceasedDate: null, deceasedPlace: '', deceasedReason: '', deceasedProfileShift: false,
            absentDate: null, absentType: null, incidentAbsentReport: '', absentCourtOfInquiryReport: '', absentProfileShift: false,
            arrestedDate: null, incidentDetails: '', arrestedCourtOfInquiryReport: '', arrestedProfileShift: false
        };

        if (st === PresentStatusType.RegularPostingOut) {
            formValues.rpoDate = dated;
            formValues.transferredUnit = record.motherOrgTransferredUnitID ?? record.transferredUnitID;
            formValues.dateOfRelease = record.dateOfRelease ? new Date(record.dateOfRelease) : null;
            formValues.dateOfReduceFromRabStrength = record.reduceFromRABStrength ? new Date(record.reduceFromRABStrength) : null;
            formValues.rpoProfileShift = record.profileShift;
        } else if (st === PresentStatusType.RTUOnDisciplineIssue) {
            formValues.rtuDate = dated;
            formValues.rtuTransferredUnit = record.motherOrgTransferredUnitID ?? record.transferredUnitID;
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
        this.fileRows = this.parseFileRefs(record.supportingDocFilesReferences);
        this.displayDialog = true;
    }

    closeDialog(): void {
        this.displayDialog = false;
    }

    // ========== View Dialog ==========

    openViewDialog(record: any): void {
        this.viewRecord = record;
        this.viewFileRows = this.parseFileRefs(record.supportingDocFilesReferences)
            .map(r => ({ fileName: r.displayName || '', fileId: r.fileId }));
        this.displayViewDialog = true;
    }

    // ========== Save (Add/Edit Dialog) ==========

    saveRecord(): void {
        if (!this.selectedEmployeeId) return;

        this.presentStatusForm.markAllAsTouched();
        if (this.presentStatusForm.invalid) {
            this.showWarn('Validation', 'Please fill all required fields.');
            return;
        }

        const selectedType = this.presentStatusForm.get('presentStatusType')?.value;

        if (this.singleInstanceStatusTypes.includes(selectedType)) {
            const duplicate = this.recordList.some(
                r => r.presentStatusType === selectedType && r.presentStatusID !== this.editingRecordId
            );
            if (duplicate) {
                this.showWarn('Duplicate Not Allowed', `A "${this.getStatusLabel(selectedType)}" record already exists for this employee.`);
                return;
            }
        }

        if (!this.isEditMode && selectedType === this.currentActiveStatusType) {
            this.showWarn('Same Status Not Allowed', `This employee's current status is already "${this.getStatusLabel(selectedType)}". The same status cannot be added again.`);
            return;
        }

        if (selectedType === PresentStatusType.Deceased) {
            this.confirmationService.confirm({
                header: 'Confirm Deceased Status',
                message: 'Adding a "Deceased" status will automatically move this employee to the Ex Member list. This action cannot be reverted. Do you want to continue?',
                icon: 'pi pi-exclamation-triangle',
                acceptButtonProps: { label: 'Yes, Continue', severity: 'danger' },
                rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
                accept: () => this.proceedSave()
            });
            return;
        }

        if (this.isProfileShiftChecked(selectedType)) {
            this.confirmationService.confirm({
                header: 'Confirm Profile Shift',
                message: 'The "Profile Shift (Present to Ex Member)" option is ticked. Saving will move this employee to the Ex Member list and this action cannot be reverted. Do you want to continue?',
                icon: 'pi pi-exclamation-triangle',
                acceptButtonProps: { label: 'Yes, Continue', severity: 'danger' },
                rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
                accept: () => this.proceedSave()
            });
            return;
        }

        this.proceedSave();
    }

    private proceedSave(): void {
        this.isSaving = true;
        this.saveWithFiles(this.fileReferencesForm, (filesJson) => {
            const payload = this.buildPayload(filesJson);
            const save$ = this.isEditMode ? this.presentStatusService.update(payload) : this.presentStatusService.save(payload);
            save$.subscribe({
                next: () => {
                    this.isSaving = false;
                    this.displayDialog = false;
                    this.showSuccess(this.isEditMode ? 'Record updated successfully!' : 'Record saved successfully!');
                    this.loadRecordList();
                },
                error: (err) => {
                    this.isSaving = false;
                    this.showError(err?.error?.message || err?.error?.Description || 'Failed to save record');
                }
            });
        }, () => this.isSaving = false);
    }

    private buildPayload(filesReferencesJson?: string | null): any {
        const f = this.presentStatusForm.getRawValue();
        const st = f.presentStatusType;

        let dated = this.toDateStr(new Date())!;
        if (st === PresentStatusType.RegularPostingOut) dated = this.toDateStr(f.rpoDate) || dated;
        else if (st === PresentStatusType.RTUOnDisciplineIssue) dated = this.toDateStr(f.rtuDate) || dated;
        else if (st === PresentStatusType.Deceased) dated = this.toDateStr(f.deceasedDate) || dated;
        else if (st === PresentStatusType.Absent) dated = this.toDateStr(f.absentDate) || dated;
        else if (st === PresentStatusType.Arrested) dated = this.toDateStr(f.arrestedDate) || dated;

        let profileShift = false;
        if (st === PresentStatusType.RegularPostingOut) profileShift = !!f.rpoProfileShift;
        else if (st === PresentStatusType.RTUOnDisciplineIssue) profileShift = !!f.rtuProfileShift;
        else if (st === PresentStatusType.Deceased) profileShift = !!f.deceasedProfileShift;
        else if (st === PresentStatusType.Absent) profileShift = !!f.absentProfileShift;
        else if (st === PresentStatusType.Arrested) profileShift = !!f.arrestedProfileShift;

        let motherOrgTransferredUnitID: number | null = null;
        if (st === PresentStatusType.RegularPostingOut) motherOrgTransferredUnitID = f.transferredUnit;
        else if (st === PresentStatusType.RTUOnDisciplineIssue) motherOrgTransferredUnitID = f.rtuTransferredUnit;

        let inquiryReport: string | null = null;
        if (st === PresentStatusType.Absent) inquiryReport = f.absentCourtOfInquiryReport;
        else if (st === PresentStatusType.Arrested) inquiryReport = f.arrestedCourtOfInquiryReport;

        const payload: any = {
            EmployeeID: this.selectedEmployeeId,
            PresentStatusType: st,
            Dated: dated,
            ProfileShift: profileShift,
            TransferredUnitID: null,
            MotherOrgTransferredUnitID: motherOrgTransferredUnitID,
            DateOfRelease: this.toDateStr(f.dateOfRelease),
            ReduceFromRABStrength: this.toDateStr(f.dateOfReduceFromRabStrength),
            RTUCause: f.rtuCause || null,
            AbsentTypeID: f.absentType || null,
            AbsentReport: f.incidentAbsentReport || null,
            InquiryReport: inquiryReport,
            IncidentDetails: f.incidentDetails || null,
            DeceasedPlace: f.deceasedPlace || null,
            DeceasedReason: f.deceasedReason || null,
            ArrestedPresentStatusID: null,
            BackFromArrestedReason: null,
            BackFromArrestedDate: null,
            CourtOrderReference: null,
            AbsentPresentStatusID: null,
            BackFromAbsentReason: null,
            BackFromAbsentDate: null,
            SupportingDocFilesReferences: filesReferencesJson ?? null,
            IsActive: true,
            ...this.auditFields()
        };

        if (this.isEditMode && this.editingRecordId) {
            payload.PresentStatusID = this.editingRecordId;
        }
        return payload;
    }

    // ========== Back From Arrested Dialog ==========

    openBackFromArrestedDialog(record: any): void {
        this.openBackFromDialog(record, PresentStatusType.BackFromArrested, 'Arrested');
    }

    openBackFromAbsentDialog(record: any): void {
        this.openBackFromDialog(record, PresentStatusType.BackFromAbsent, 'Absent');
    }

    private openBackFromDialog(sourceRecord: any, backFromType: string, sourceLabel: string): void {
        if (!this.canAddStatus) {
            this.showWarn('Not Allowed', 'Only presently serving employees can have a present status added.');
            return;
        }
        this.bfaEditMode = false;
        this.bfaEditingRecordId = null;
        this.bfaStatusType = backFromType;
        this.bfaLinkedArrestedId = sourceRecord.presentStatusID;
        this.bfaLinkedArrestedLabel = `${sourceLabel} — ${this.formatDate(sourceRecord.dated)}`;
        this.bfaForm.reset({ backFromArrestedDate: null, backFromArrestedReason: '', courtOrderReference: '' });
        this.bfaFileRows = [];
        this.displayBfaDialog = true;
    }

    private openEditBackFrom(record: any): void {
        const isArrested = record.presentStatusType === PresentStatusType.BackFromArrested;
        const sourceType = isArrested ? PresentStatusType.Arrested : PresentStatusType.Absent;
        const sourceLabel = isArrested ? 'Arrested' : 'Absent';

        const linkedId = isArrested ? record.arrestedPresentStatusID : record.absentPresentStatusID;

        this.bfaEditMode = true;
        this.bfaEditingRecordId = record.presentStatusID;
        this.bfaStatusType = record.presentStatusType;
        this.bfaLinkedArrestedId = linkedId;

        const linked = this.recordList.find(r => r.presentStatusID === linkedId && r.presentStatusType === sourceType);
        this.bfaLinkedArrestedLabel = linked
            ? `${sourceLabel} — ${this.formatDate(linked.dated)}`
            : (linkedId ? `${sourceLabel} Record #${linkedId}` : 'N/A');

        const reason = isArrested ? (record.backFromArrestedReason || '') : (record.backFromAbsentReason || '');

        this.bfaForm.patchValue({
            backFromArrestedDate: record.dated ? new Date(record.dated) : null,
            backFromArrestedReason: reason,
            courtOrderReference: isArrested ? (record.courtOrderReference || '') : ''
        });
        this.bfaFileRows = this.parseFileRefs(record.supportingDocFilesReferences);
        this.displayBfaDialog = true;
    }

    saveBfa(): void {
        if (!this.selectedEmployeeId) return;
        this.bfaForm.markAllAsTouched();
        if (this.bfaForm.invalid) {
            this.showWarn('Validation', 'Please fill all required fields.');
            return;
        }

        if (!this.bfaEditMode) {
            const label = this.bfaStatusType === PresentStatusType.BackFromAbsent ? 'Back From Absent' : 'Back From Arrested';
            this.confirmationService.confirm({
                header: `Confirm ${label}`,
                message: 'This employee will be shown as "On Duty" after saving. Are you sure you want to continue?',
                icon: 'pi pi-exclamation-triangle',
                acceptButtonProps: { label: 'Yes, Continue', severity: 'success' },
                rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
                accept: () => this.proceedBfaSave()
            });
            return;
        }

        this.proceedBfaSave();
    }

    private proceedBfaSave(): void {
        this.bfaSaving = true;

        this.saveWithFiles(this.bfaFileReferencesForm, (filesJson) => {
            const payload = this.buildBfaPayload(filesJson);
            const save$ = this.bfaEditMode ? this.presentStatusService.update(payload) : this.presentStatusService.save(payload);
            save$.subscribe({
                next: () => {
                    if (this.bfaEditMode) {
                        this.bfaSaving = false;
                        this.displayBfaDialog = false;
                        this.showSuccess('Record updated successfully!');
                        this.loadRecordList();
                        return;
                    }
                    this.reactivateOnDuty();
                },
                error: (err) => {
                    this.bfaSaving = false;
                    this.showError(err?.error?.message || err?.error?.Description || 'Failed to save record');
                }
            });
        }, () => this.bfaSaving = false);
    }

    private buildBfaPayload(filesReferencesJson?: string | null): any {
        const f = this.bfaForm.value;
        const dated = this.toDateStr(f.backFromArrestedDate) || this.toDateStr(new Date());
        const isArrested = this.bfaStatusType === PresentStatusType.BackFromArrested;

        const payload: any = {
            EmployeeID: this.selectedEmployeeId,
            PresentStatusType: this.bfaStatusType,
            Dated: dated,
            ProfileShift: false,
            TransferredUnitID: null,
            MotherOrgTransferredUnitID: null,
            DateOfRelease: null,
            ReduceFromRABStrength: null,
            RTUCause: null,
            AbsentTypeID: null,
            AbsentReport: null,
            InquiryReport: null,
            IncidentDetails: null,
            DeceasedPlace: null,
            DeceasedReason: null,
            ArrestedPresentStatusID: isArrested ? this.bfaLinkedArrestedId : null,
            BackFromArrestedReason: isArrested ? (f.backFromArrestedReason || null) : null,
            BackFromArrestedDate: isArrested ? this.toDateStr(f.backFromArrestedDate) : null,
            CourtOrderReference: isArrested ? (f.courtOrderReference || null) : null,
            AbsentPresentStatusID: !isArrested ? this.bfaLinkedArrestedId : null,
            BackFromAbsentReason: !isArrested ? (f.backFromArrestedReason || null) : null,
            BackFromAbsentDate: !isArrested ? this.toDateStr(f.backFromArrestedDate) : null,
            SupportingDocFilesReferences: filesReferencesJson ?? null,
            IsActive: false,
            ...this.auditFields()
        };

        if (this.bfaEditMode && this.bfaEditingRecordId) {
            payload.PresentStatusID = this.bfaEditingRecordId;
        }
        return payload;
    }

    private reactivateOnDuty(): void {
        const onDutyRecord = this.recordList.find(
            r => r.presentStatusType === PresentStatusType.OnDuty && !r.isActive
        );
        const bfaLabel = this.bfaStatusType === PresentStatusType.BackFromAbsent ? 'Back From Absent' : 'Back From Arrested';
        if (!onDutyRecord) {
            this.bfaSaving = false;
            this.displayBfaDialog = false;
            this.showWarn('Partial Success', `${bfaLabel} saved but no inactive On Duty record found to reactivate.`);
            this.loadRecordList();
            return;
        }

        const payload: any = {
            PresentStatusID: onDutyRecord.presentStatusID,
            EmployeeID: this.selectedEmployeeId,
            PresentStatusType: PresentStatusType.OnDuty,
            Dated: onDutyRecord.dated,
            ProfileShift: onDutyRecord.profileShift || false,
            TransferredUnitID: onDutyRecord.transferredUnitID || null,
            MotherOrgTransferredUnitID: onDutyRecord.motherOrgTransferredUnitID || null,
            DateOfRelease: onDutyRecord.dateOfRelease || null,
            ReduceFromRABStrength: onDutyRecord.reduceFromRABStrength || null,
            RTUCause: onDutyRecord.rtuCause || null,
            AbsentTypeID: onDutyRecord.absentTypeID || null,
            AbsentReport: onDutyRecord.absentReport || null,
            InquiryReport: onDutyRecord.inquiryReport || null,
            IncidentDetails: onDutyRecord.incidentDetails || null,
            DeceasedPlace: null,
            DeceasedReason: null,
            ArrestedPresentStatusID: null,
            BackFromArrestedReason: null,
            BackFromArrestedDate: null,
            CourtOrderReference: null,
            AbsentPresentStatusID: null,
            BackFromAbsentReason: null,
            BackFromAbsentDate: null,
            SupportingDocFilesReferences: onDutyRecord.supportingDocFilesReferences || null,
            IsActive: true,
            ...this.auditFields()
        };

        this.presentStatusService.update(payload).subscribe({
            next: () => {
                this.bfaSaving = false;
                this.displayBfaDialog = false;
                this.showSuccess(`${bfaLabel} saved and On Duty status reactivated.`);
                this.loadRecordList();
            },
            error: () => {
                this.bfaSaving = false;
                this.displayBfaDialog = false;
                this.showWarn('Partial Success', `${bfaLabel} saved but failed to reactivate On Duty status.`);
                this.loadRecordList();
            }
        });
    }

    // ========== File Handlers ==========

    onFileRowsChange(rows: FileRowData[]): void {
        if (Array.isArray(rows)) this.fileRows = rows;
    }

    onBfaFileRowsChange(rows: FileRowData[]): void {
        if (Array.isArray(rows)) this.bfaFileRows = rows;
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err) => this.showError(err?.error?.message || 'Failed to download file')
        });
    }

    // ========== Helpers ==========

    hasBackFromRecord(record: any): boolean {
        if (record.presentStatusType === PresentStatusType.Arrested) {
            return this.recordList.some(r => r.presentStatusType === PresentStatusType.BackFromArrested && r.arrestedPresentStatusID === record.presentStatusID);
        }
        if (record.presentStatusType === PresentStatusType.Absent) {
            return this.recordList.some(r => r.presentStatusType === PresentStatusType.BackFromAbsent && r.absentPresentStatusID === record.presentStatusID);
        }
        return false;
    }

    getStatusLabel(value: string): string {
        if (value === PresentStatusType.BackFromArrested) return 'Back From Arrested';
        if (value === PresentStatusType.BackFromAbsent) return 'Back From Absent';
        return PresentStatusTypeOptions.find(o => o.value === value)?.label ?? value ?? 'N/A';
    }

    getStatusIcon(type: string): string {
        const icons: Record<string, string> = {
            [PresentStatusType.OnDuty]: 'pi-check-circle',
            [PresentStatusType.RegularPostingOut]: 'pi-sign-out',
            [PresentStatusType.RTUOnDisciplineIssue]: 'pi-replay',
            [PresentStatusType.Deceased]: 'pi-info-circle',
            [PresentStatusType.Absent]: 'pi-user-minus',
            [PresentStatusType.Arrested]: 'pi-lock',
            [PresentStatusType.BackFromArrested]: 'pi-unlock',
            [PresentStatusType.BackFromAbsent]: 'pi-user-plus'
        };
        return icons[type] ?? 'pi-flag';
    }

    getUnitLabel(value: number | null | undefined): string {
        if (value == null) return 'N/A';
        return (this.motherOrgUnits.find(o => o.value === value) ?? this.transferredUnits.find(o => o.value === value))?.label ?? String(value);
    }

    getAbsentTypeLabel(value: number | null | undefined): string {
        if (value == null) return 'N/A';
        return this.absentTypes.find(o => o.value === value)?.label ?? String(value);
    }

    formatDate(dateStr: string | null): string {
        if (!dateStr) return 'N/A';
        try { return new Date(dateStr).toLocaleDateString('en-GB'); }
        catch { return dateStr; }
    }

    // ========== Private Utilities ==========

    private isProfileShiftChecked(statusType: string | null): boolean {
        const f = this.presentStatusForm.getRawValue();
        switch (statusType) {
            case PresentStatusType.RegularPostingOut: return !!f.rpoProfileShift;
            case PresentStatusType.RTUOnDisciplineIssue: return !!f.rtuProfileShift;
            case PresentStatusType.Deceased: return !!f.deceasedProfileShift;
            case PresentStatusType.Absent: return !!f.absentProfileShift;
            case PresentStatusType.Arrested: return !!f.arrestedProfileShift;
            default: return false;
        }
    }

    private toDateStr(val: any): string | null {
        if (!val) return null;
        const d = new Date(val);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    private auditFields(): any {
        const now = new Date().toISOString();
        return { CreatedBy: this.auditUser, CreatedDate: now, LastUpdatedBy: this.auditUser, Lastupdate: now };
    }

    private parseFileRefs(refsJson: string | null | undefined): FileRowData[] {
        if (!refsJson || typeof refsJson !== 'string') return [];
        try {
            const refs = JSON.parse(refsJson) as { FileId?: number; fileName?: string }[];
            return Array.isArray(refs) ? refs.map(r => ({ displayName: r.fileName || '', file: null, fileId: r.FileId })) : [];
        } catch { return []; }
    }

    private saveWithFiles(
        fileForm: any,
        onSave: (filesJson: string | null) => void,
        onError: () => void
    ): void {
        const existingRefs = fileForm?.getExistingFileReferences() || [];
        const filesToUpload = fileForm?.getFilesToUpload() || [];

        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
            );
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const arr = Array.isArray(results) ? results : [];
                    const newRefs = (arr as { fileId: number; fileName: string }[]).map(r => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs = [...existingRefs.map((r: any) => ({ FileId: r.FileId, fileName: r.fileName })), ...newRefs];
                    onSave(allRefs.length > 0 ? JSON.stringify(allRefs) : null);
                },
                error: (err) => {
                    onError();
                    this.showError(err?.error?.message || 'Failed to upload files');
                }
            });
            return;
        }
        onSave(existingRefs.length > 0 ? JSON.stringify(existingRefs) : null);
    }

    private showSuccess(detail: string): void {
        this.messageService.add({ severity: 'success', summary: 'Success', detail });
    }

    private showWarn(summary: string, detail: string): void {
        this.messageService.add({ severity: 'warn', summary, detail });
    }

    private showError(detail: string): void {
        this.messageService.add({ severity: 'error', summary: 'Error', detail });
    }
}
