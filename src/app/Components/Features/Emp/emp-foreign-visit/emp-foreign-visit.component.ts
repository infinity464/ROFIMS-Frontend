import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { catchError, of, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { Fluid } from 'primeng/fluid';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';

import { EmpService } from '@/services/emp-service';
import { ForeignVisitInfoService, ForeignVisitInfoModel, ForeignVisitFamilyInfoModel } from '@/services/foreign-visit-info.service';
import { CommonCodeService } from '@/services/common-code-service';
import { FamilyInfoService, FamilyInfoModel } from '@/services/family-info-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';
import { CodeType } from '@/models/enums';

interface DropdownOption {
    label: string;
    value: number;
}

@Component({
    selector: 'app-emp-foreign-visit',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        ButtonModule,
        CheckboxModule,
        Fluid,
        TooltipModule,
        TableModule,
        SelectModule,
        MultiSelectModule,
        DialogModule,
        ConfirmDialogModule,
        DatePickerModule,
        ToastModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './emp-foreign-visit.component.html',
    styleUrl: './emp-foreign-visit.component.scss'
})
export class EmpForeignVisit implements OnInit, OnDestroy {
    @ViewChild('fileReferencesForm') fileReferencesForm!: any;

    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    visitList: ForeignVisitInfoModel[] = [];
    familyListForVisit: ForeignVisitFamilyInfoModel[] = [];
    familyMasterList: FamilyInfoModel[] = [];
    isLoading = false;
    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    visitForm!: FormGroup;

    subjectOptions: DropdownOption[] = [];
    purposeOfVisitOptions: DropdownOption[] = [];
    destinationCountryOptions: DropdownOption[] = [];
    familyOptions: DropdownOption[] = [];

    editingVisitId: number | null = null;
    selectedFamilyIdsForAdd: number[] = [];
    fileRows: FileRowData[] = [];
    /** Pending family FMIDs to add when saving a new visit (Add mode). */
    pendingFamilyIds: number[] = [];
    /** Pending family remarks mapping: familyId -> remarks */
    pendingFamilyRemarks: Map<number, string> = new Map();
    /** Family remarks mapping for edit mode: familyId -> remarks */
    familyRemarksMap: Map<number, string> = new Map();
    displayFamilyModal = false;
    private destroy$ = new Subject<void>();

    withFamilyYesNo = [{ label: 'Yes', value: true }, { label: 'No', value: false }];

    constructor(
        private empService: EmpService,
        private foreignVisitService: ForeignVisitInfoService,
        private commonCodeService: CommonCodeService,
        private familyInfoService: FamilyInfoService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router,
        private fb: FormBuilder
    ) {
        this.initForm();
    }

    ngOnInit(): void {
        this.loadDropdowns();
        this.checkRouteParams();
    }

    initForm(): void {
        this.visitForm = this.fb.group({
            subjectId: [null],
            visitId: [null],
            destinationCountryId: [null],
            fromDate: [null],
            toDate: [null],
            withFamily: [false],
            auth: [''],
            remarks: ['']
        });
        this.visitForm.valueChanges.subscribe(() => this.visitForm.updateValueAndValidity({ emitEvent: false }));

        // Load family members when user selects "With Family" = Yes
        this.visitForm.get('withFamily')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
            if (val === true && this.selectedEmployeeId) {
                this.loadFamilyMasterList();
            }
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    loadDropdowns(): void {
        const types = [
            { key: CodeType.SubjectType, target: 'subjectOptions' },
            { key: CodeType.VisitType, target: 'purposeOfVisitOptions' },
            { key: CodeType.Country, target: 'destinationCountryOptions' }
        ];
        types.forEach(({ key, target }) => {
            this.commonCodeService.getAllActiveCommonCodesType(key)
                .pipe(
                    catchError((error) => {
                        console.error(`Failed to load ${target}:`, error);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: `Failed to load ${target.replace(/Options$/, '')} options`
                        });
                        return of([]);
                    })
                )
                .subscribe({
                    next: (data: any) => {
                        const opts = (data || []).map((d: any) => ({
                            label: d.codeValueEN || d.displayCodeValueEN || String(d.codeId),
                            value: d.codeId
                        }));
                        (this as any)[target] = opts;
                    }
                });
        });
    }

    get totalDays(): number {
        const from = this.visitForm?.get('fromDate')?.value;
        const to = this.visitForm?.get('toDate')?.value;
        if (!from || !to) return 0;
        const a = new Date(from);
        const b = new Date(to);
        if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
        const diff = b.getTime() - a.getTime();
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    getTotalDaysForRow(row: ForeignVisitInfoModel): number | string {
        const from = row.fromDate;
        const to = row.toDate;
        if (!from || !to) return 'N/A';
        const a = new Date(from);
        const b = new Date(to);
        if (isNaN(a.getTime()) || isNaN(b.getTime())) return 'N/A';
        const diff = b.getTime() - a.getTime();
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe((params) => {
            if (params['id']) {
                this.mode = params['mode'] === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(params['id'], 10));
            }
        });
    }

    loadEmployeeById(employeeId: number): void {
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (e: any) => {
                if (e) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = e.employeeID || e.EmployeeID;
                    this.employeeBasicInfo = e;
                    this.loadVisitList();
                }
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load employee information'
                });
            }
        });
    }

    loadVisitList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.foreignVisitService.getVisitsByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data) => {
                this.visitList = (data || []).map((x: any) => ({
                    employeeId: x.employeeId ?? x.EmployeeId,
                    foreignVisitId: x.foreignVisitId ?? x.ForeignVisitId,
                    subjectId: x.subjectId ?? x.SubjectId ?? null,
                    destinationCountryId: x.destinationCountryId ?? x.DestinationCountryId ?? null,
                    visitId: x.visitId ?? x.VisitId ?? null,
                    fromDate: x.fromDate ?? x.FromDate ?? null,
                    toDate: x.toDate ?? x.ToDate ?? null,
                    withFamily: x.withFamily ?? x.WithFamily ?? null,
                    auth: x.auth ?? x.Auth ?? null,
                    remarks: x.remarks ?? x.Remarks ?? null,
                    fileName: x.fileName ?? x.FileName ?? null,
                    filesReferences: x.filesReferences ?? x.FilesReferences ?? null,
                    createdBy: x.createdBy ?? x.CreatedBy,
                    createdDate: x.createdDate ?? x.CreatedDate,
                    lastUpdatedBy: x.lastUpdatedBy ?? x.LastUpdatedBy,
                    lastupdate: x.lastupdate ?? x.Lastupdate
                }));
                this.isLoading = false;
            },
            error: () => {
                this.isLoading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load foreign visit records'
                });
            }
        });
    }

    loadFamilyMasterList(): void {
        console.log('🔍 loadFamilyMasterList called, selectedEmployeeId:', this.selectedEmployeeId);
        if (!this.selectedEmployeeId) {
            console.warn('⚠️ No selectedEmployeeId');
            return;
        }
        this.familyInfoService.getByEmployeeId(this.selectedEmployeeId)
            .pipe(
                catchError((error) => {
                    console.error('❌ Failed to load family members:', error);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to load family members'
                    });
                    return of([]);
                })
            )
            .subscribe({
                next: (data: any) => {
                    console.log('✅ API Response received:', data);
                    const list = Array.isArray(data) ? data : (data?.data && Array.isArray(data.data) ? data.data : []);
                    console.log('📋 Processed list:', list);
                    this.familyMasterList = list;
                    this.familyOptions = list.map((f: any) => {
                        const label = (f.nameEN || f.NameEN || '') + (f.nameBN || f.NameBN ? ' (' + (f.nameBN || f.NameBN) + ')' : '');
                        const value = f.fmid ?? f.FMID ?? 0;
                        console.log(`  → Mapped: ${label} (value: ${value})`);
                        return { label, value };
                    });
                    console.log('✨ Final familyOptions:', this.familyOptions);
                }
            });
    }

    loadFamilyForVisit(foreignVisitId: number): void {
        if (!this.selectedEmployeeId) return;
        this.foreignVisitService.getFamilyByEmployeeAndVisit(this.selectedEmployeeId, foreignVisitId)
            .pipe(
                catchError((error) => {
                    console.error('Failed to load family members for visit:', error);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to load family members for this visit'
                    });
                    return of([]);
                })
            )
            .subscribe({
                next: (data) => {
                    this.familyListForVisit = data || [];
                    // Populate remarks map with existing remarks for edit mode
                    if (this.isEditMode) {
                        this.familyRemarksMap.clear();
                        this.familyListForVisit.forEach((f) => {
                            if (f.remarks) {
                                this.familyRemarksMap.set(f.familyId, f.remarks);
                            }
                        });
                    }
                }
            });
    }

    parseFileRowsFromReferences(refsJson: string | null | undefined): FileRowData[] {
        if (!refsJson || typeof refsJson !== 'string') return [];
        try {
            const refs = JSON.parse(refsJson) as { FileId?: number; fileName?: string }[];
            if (!Array.isArray(refs)) return [];
            return refs.map((r) => ({ displayName: r.fileName ?? '', file: null, fileId: r.FileId }));
        } catch {
            return [];
        }
    }

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) this.fileRows = event;
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

    getOptionLabel(options: DropdownOption[], value: number | null): string {
        if (value == null) return 'N/A';
        const o = options.find((x) => x.value === value);
        return o ? o.label : 'N/A';
    }

    getFamilyName(familyId: number): string {
        const f = this.familyMasterList.find((x: any) => (x.fmid ?? x.FMID) === familyId);
        return f ? ((f as any).nameEN || (f as any).NameEN || '') : String(familyId);
    }

    /** Family list to display: saved for this visit (Edit) or pending (Add). */
    get displayedFamilyList(): { familyId: number; foreignVisitFamilyId?: number; isPending: boolean }[] {
        if (this.isEditMode && this.editingVisitId != null) {
            return this.familyListForVisit.map((f) => ({
                familyId: f.familyId,
                foreignVisitFamilyId: f.foreignVisitFamilyId,
                isPending: false
            }));
        }
        return this.pendingFamilyIds.map((id) => ({ familyId: id, isPending: true }));
    }

    formatDate(d: string | Date | null): string {
        if (!d) return 'N/A';
        try {
            const date = new Date(d as string);
            return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
        } catch {
            return 'N/A';
        }
    }

    openAddDialog(): void {
        console.log('📂 openAddDialog called, isReadonly:', this.isReadonly);
        this.loadFamilyMasterList();
        this.isEditMode = false;
        this.isReadonly = false; // Allow editing in add mode
        this.editingVisitId = null;
        this.familyListForVisit = [];
        this.pendingFamilyIds = [];
        this.pendingFamilyRemarks.clear();
        this.familyRemarksMap.clear();
        this.selectedFamilyIdsForAdd = [];
        this.fileRows = [];
        this.visitForm.reset({
            subjectId: null,
            visitId: null,
            destinationCountryId: null,
            fromDate: null,
            toDate: null,
            withFamily: false,
            auth: '',
            remarks: ''
        });
        this.displayDialog = true;
        console.log('✅ Dialog opened, isReadonly:', this.isReadonly);
    }

    openEditDialog(row: ForeignVisitInfoModel): void {
        this.loadFamilyMasterList();
        this.isEditMode = true;
        this.isReadonly = false; // Allow editing in edit mode
        this.editingVisitId = row.foreignVisitId;
        this.selectedFamilyIdsForAdd = [];
        this.pendingFamilyRemarks.clear();
        this.familyRemarksMap.clear();
        this.loadFamilyForVisit(row.foreignVisitId);
        const from = row.fromDate ? new Date(row.fromDate) : null;
        const to = row.toDate ? new Date(row.toDate) : null;
        this.fileRows = this.parseFileRowsFromReferences(row.filesReferences);
        this.visitForm.patchValue({
            subjectId: row.subjectId,
            visitId: row.visitId,
            destinationCountryId: row.destinationCountryId,
            fromDate: from,
            toDate: to,
            withFamily: row.withFamily ?? false,
            auth: row.auth ?? '',
            remarks: row.remarks ?? ''
        });
        this.displayDialog = true;
    }

    saveVisit(): void {
        if (!this.selectedEmployeeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected' });
            return;
        }
        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const v = this.visitForm.value;
            const toDateStr = (d: Date | null): string | null => {
                if (!d) return null;
                const x = new Date(d);
                return isNaN(x.getTime()) ? null : x.toISOString();
            };
            const payload: Partial<ForeignVisitInfoModel> = {
                employeeId: this.selectedEmployeeId!,
                foreignVisitId: this.isEditMode ? (this.editingVisitId ?? 0) : 0,
                subjectId: v.subjectId ?? null,
                destinationCountryId: v.destinationCountryId ?? null,
                visitId: v.visitId ?? null,
                fromDate: toDateStr(v.fromDate),
                toDate: toDateStr(v.toDate),
                withFamily: v.withFamily ?? false,
                auth: (v.auth && String(v.auth).trim()) || null,
                remarks: (v.remarks && String(v.remarks).trim()) || null,
                fileName: null,
                filesReferences: filesReferencesJson ?? undefined,
                createdBy: 'system',
                lastUpdatedBy: 'system'
            };

            this.isSaving = true;
            const req = this.isEditMode
                ? this.foreignVisitService.updateVisit(payload)
                : this.foreignVisitService.saveVisit(payload);

            req.subscribe({
            next: (res: any) => {
                const entity = res?.data ?? res?.Data ?? res;
                const newVisitId = entity?.foreignVisitId ?? entity?.ForeignVisitId ?? (Array.isArray(entity) ? entity[0]?.foreignVisitId ?? entity[0]?.ForeignVisitId : null);
                if (!this.isEditMode && this.pendingFamilyIds.length > 0 && this.selectedEmployeeId && newVisitId != null) {
                    this.addPendingFamilyMembers(newVisitId);
                } else {
                    if (!this.isEditMode && this.pendingFamilyIds.length > 0 && newVisitId == null) {
                        this.messageService.add({
                            severity: 'warn',
                            summary: 'Visit saved',
                            detail: 'Please edit the visit to add family members.'
                        });
                    } else {
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: this.isEditMode ? 'Foreign visit updated.' : 'Foreign visit added.'
                        });
                    }
                    this.displayDialog = false;
                    this.loadVisitList();
                    this.isSaving = false;
                }
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save foreign visit' });
                this.isSaving = false;
            }
        });
        };

        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
            );
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map((r) => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs: { FileId: number; fileName: string }[] = [...existingRefs.map((r: { FileId: number; fileName: string }) => ({ FileId: r.FileId, fileName: r.fileName })), ...newRefs];
                    const filesReferencesJson = allRefs.length > 0 ? JSON.stringify(allRefs) : null;
                    doSave(filesReferencesJson);
                },
                error: (err) => {
                    console.error('Error uploading files', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload one or more files' });
                }
            });
            return;
        }
        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
    }

    private addPendingFamilyMembers(foreignVisitId: number): void {
        const ids = [...this.pendingFamilyIds];
        const remarksMap = new Map(this.pendingFamilyRemarks);
        this.pendingFamilyIds = [];
        this.pendingFamilyRemarks.clear();
        let completed = 0;
        const total = ids.length;
        const done = () => {
            completed++;
            if (completed >= total) {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Foreign visit and family members added.'
                });
                this.displayDialog = false;
                this.loadVisitList();
                this.isSaving = false;
            }
        };
        if (total === 0) {
            done();
            return;
        }
        ids.forEach((familyId) => {
            const remarks = remarksMap.get(familyId) || '';
            this.foreignVisitService
                .saveFamilyMember({
                    employeeId: this.selectedEmployeeId!,
                    foreignVisitId,
                    familyId,
                    remarks: remarks || null,
                    createdBy: 'system',
                    lastUpdatedBy: 'system'
                })
                .subscribe({
                    next: () => done(),
                    error: () => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add some family members' });
                        done();
                    }
                });
        });
    }

    confirmDelete(row: ForeignVisitInfoModel): void {
        this.confirmationService.confirm({
            message: 'Delete this foreign visit record?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deleteVisit(row)
        });
    }

    deleteVisit(row: ForeignVisitInfoModel): void {
        // First, delete all related family members
        this.foreignVisitService.getFamilyByEmployeeAndVisit(row.employeeId, row.foreignVisitId).subscribe({
            next: (familyMembers) => {
                let completed = 0;
                const total = familyMembers.length;

                if (total === 0) {
                    // No family members, proceed directly to delete visit
                    this.deleteVisitRecord(row);
                    return;
                }

                // Delete each family member
                familyMembers.forEach((family) => {
                    this.foreignVisitService.deleteFamilyMember(family.employeeId, family.foreignVisitFamilyId).subscribe({
                        next: () => {
                            completed++;
                            if (completed >= total) {
                                // All family members deleted, now delete the visit
                                this.deleteVisitRecord(row);
                            }
                        },
                        error: () => {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete family member' });
                        }
                    });
                });
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to retrieve family members' })
        });
    }

    private deleteVisitRecord(row: ForeignVisitInfoModel): void {
        this.foreignVisitService.deleteVisit(row.employeeId, row.foreignVisitId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Foreign visit deleted.' });
                this.loadVisitList();
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete visit' })
        });
    }

    openFamilyModal(): void {
        this.displayFamilyModal = true;
    }

    closeFamilyModal(): void {
        this.displayFamilyModal = false;
        this.selectedFamilyIdsForAdd = [];
    }

    confirmFamilySelection(): void {
        if (!this.selectedFamilyIdsForAdd?.length) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select at least one family member' });
            return;
        }

        const idsToAdd = this.selectedFamilyIdsForAdd.filter((id) => id != null);

        if (this.isEditMode && this.editingVisitId != null) {
            const alreadySet = new Set(this.familyListForVisit.map((f) => f.familyId));
            const newIds = idsToAdd.filter((id) => !alreadySet.has(id));
            if (newIds.length === 0) {
                this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Selected family member(s) already added' });
                this.closeFamilyModal();
                return;
            }
            let completed = 0;
            newIds.forEach((fid) => {
                const remarks = this.familyRemarksMap.get(fid) || '';
                this.foreignVisitService
                    .saveFamilyMember({
                        employeeId: this.selectedEmployeeId!,
                        foreignVisitId: this.editingVisitId!,
                        familyId: fid,
                        remarks: remarks || null,
                        createdBy: 'system',
                        lastUpdatedBy: 'system'
                    })
                    .subscribe({
                        next: () => {
                            completed++;
                            if (completed >= newIds.length) {
                                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Family member(s) added.' });
                                this.loadFamilyForVisit(this.editingVisitId!);
                                this.familyRemarksMap.clear();
                                this.closeFamilyModal();
                            }
                        },
                        error: () => {
                            completed++;
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add family member(s)' });
                            if (completed >= newIds.length) this.closeFamilyModal();
                        }
                    });
            });
        } else {
            const alreadySet = new Set(this.pendingFamilyIds);
            const newIds = idsToAdd.filter((id) => !alreadySet.has(id));
            newIds.forEach((id) => {
                const remarks = this.pendingFamilyRemarks.get(id) || '';
                if (remarks) this.pendingFamilyRemarks.set(id, remarks);
            });
            this.pendingFamilyIds = [...this.pendingFamilyIds, ...newIds];
            this.closeFamilyModal();
        }
    }

    addFamilyMember(): void {
        if (!this.selectedEmployeeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected' });
            return;
        }
        this.openFamilyModal();
    }

    getFamilyRemarks(familyId: number): string {
        return this.isEditMode ? (this.familyRemarksMap.get(familyId) || '') : (this.pendingFamilyRemarks.get(familyId) || '');
    }

    setFamilyRemarks(familyId: number, remarks: string): void {
        if (this.isEditMode) {
            if (remarks) this.familyRemarksMap.set(familyId, remarks);
            else this.familyRemarksMap.delete(familyId);
        } else {
            if (remarks) this.pendingFamilyRemarks.set(familyId, remarks);
            else this.pendingFamilyRemarks.delete(familyId);
        }
    }

    removeDisplayedFamilyMember(item: { familyId: number; foreignVisitFamilyId?: number; isPending: boolean }): void {
        if (item.isPending) {
            this.pendingFamilyIds = this.pendingFamilyIds.filter((id) => id !== item.familyId);
        } else if (item.foreignVisitFamilyId != null) {
            this.confirmationService.confirm({
                message: 'Remove this family member from the visit?',
                header: 'Confirm',
                icon: 'pi pi-exclamation-triangle',
                accept: () => {
                    const fm = this.familyListForVisit.find((f) => f.foreignVisitFamilyId === item.foreignVisitFamilyId);
                    if (fm) {
                        this.foreignVisitService.deleteFamilyMember(fm.employeeId, fm.foreignVisitFamilyId).subscribe({
                            next: () => {
                                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Family member removed.' });
                                this.loadFamilyForVisit(this.editingVisitId!);
                            },
                            error: () =>
                                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove' })
                        });
                    }
                }
            });
        }
    }


    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = true;
        this.loadVisitList();
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }
    goBack(): void {
        this.router.navigate(['/emp-list']);
    }
    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.visitList = [];
    }
}
