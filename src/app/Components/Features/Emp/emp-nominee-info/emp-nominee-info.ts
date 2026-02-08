import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';

import { EmpService } from '@/services/emp-service';
import { FamilyInfoService } from '@/services/family-info-service';
import { NomineeInfoService } from '@/services/nominee-info-service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';

export interface FamilyMemberOption {
    employeeId: number;
    fmid: number;
    relation: number | null;
    relationLabel: string;
    nameEN: string | null;
    nameBN: string | null;
}

@Component({
    selector: 'app-emp-nominee-info',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        ButtonModule,
        Fluid,
        TooltipModule,
        TableModule,
        DialogModule,
        InputNumberModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent
    ],
    templateUrl: './emp-nominee-info.html',
    styleUrl: './emp-nominee-info.scss'
})
export class EmpNomineeInfo implements OnInit {
    @ViewChild('fileReferencesForm') fileReferencesForm!: any; // FileReferencesFormComponent

    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly: boolean = false;

    nomineeForm!: FormGroup;
    relationOptions: { label: string; value: number }[] = [];

    /** File references (Supporting Documents) – shown for first nominee in list. */
    fileRows: FileRowData[] = [];
    /** Per-nominee FilesReferences JSON from load (fmid -> json string); used on save for non-first nominees. */
    private nomineeFilesByFmid: Map<number, string> = new Map();

    displayAddMemberDialog: boolean = false;
    familyMembersList: FamilyMemberOption[] = [];
    selectedFamilyMembers: FamilyMemberOption[] = [];
    isLoadingFamilyMembers: boolean = false;

    /** FMIDs loaded from API for this employee (used to delete if removed from form). */
    private existingNomineeFmids: number[] = [];
    isSaving: boolean = false;

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private familyInfoService: FamilyInfoService,
        private nomineeInfoService: NomineeInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.buildNomineeForm();
        this.loadRelationOptions();
        this.checkRouteParams();
    }

    buildNomineeForm(): void {
        this.nomineeForm = this.fb.group({
            nominees: this.fb.array([]),
            auth: [''],
            remarks: ['']
        });
    }

    loadRelationOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Relationship').subscribe({
            next: (data) => {
                this.relationOptions = (data || []).map((item: any) => ({
                    label: item.codeValueEN || item.displayCodeValueEN || '',
                    value: item.codeId
                }));
            }
        });
    }

    get nominees(): FormArray {
        return this.nomineeForm.get('nominees') as FormArray;
    }

    createNomineeRow(ser: number, relationType?: string, nomineeName?: string, nominatedPercentage?: number | null, fmid?: number, createdDate?: string | null) {
        return this.fb.group({
            ser: [ser],
            fmid: [fmid ?? null],
            relationType: [{ value: relationType ?? 'Auto Set', disabled: true }],
            nomineeName: [{ value: nomineeName ?? 'Auto Set', disabled: true }],
            nominatedPercentage: [nominatedPercentage ?? null, [Validators.min(0), Validators.max(100)]],
            createdDate: [createdDate ?? null]
        });
    }

    addNomineeRow(relationType: string, nomineeName: string, fmid: number): void {
        const ser = this.nominees.length + 1;
        this.nominees.push(this.createNomineeRow(ser, relationType, nomineeName, null, fmid, null));
    }

    removeNominee(index: number): void {
        this.nominees.removeAt(index);
        this.nominees.controls.forEach((ctrl, i) => ctrl.get('ser')?.setValue(i + 1));
    }

    openAddMemberModal(): void {
        if (!this.selectedEmployeeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        this.displayAddMemberDialog = true;
        this.selectedFamilyMembers = [];
        this.loadFamilyMembersForModal();
    }

    loadFamilyMembersForModal(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoadingFamilyMembers = true;
        this.familyInfoService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (data: any[]) => {
                this.familyMembersList = (data || []).map(item => {
                    const relation = item.relation ?? item.Relation;
                    return {
                        employeeId: item.employeeId ?? item.EmployeeId,
                        fmid: item.fmid ?? item.FMID,
                        relation,
                        relationLabel: this.getRelationLabel(relation),
                        nameEN: item.nameEN ?? item.NameEN ?? '',
                        nameBN: item.nameBN ?? item.NameBN ?? ''
                    };
                });
                this.isLoadingFamilyMembers = false;
            },
            error: () => {
                this.isLoadingFamilyMembers = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load family members.' });
            }
        });
    }

    getRelationLabel(relationId: number | null): string {
        if (relationId == null) return 'N/A';
        const opt = this.relationOptions.find(o => o.value === relationId);
        return opt ? opt.label : 'N/A';
    }

    onAddSelectedMembers(): void {
        if (this.selectedFamilyMembers.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select at least one family member.' });
            return;
        }
        const alreadyAddedFmids = new Set(
            this.nominees.controls.map(c => c.get('fmid')?.value).filter((id): id is number => id != null)
        );
        let added = 0;
        for (const m of this.selectedFamilyMembers) {
            const name = (m.nameEN || m.nameBN || '').trim();
            if (name && !alreadyAddedFmids.has(m.fmid)) {
                this.addNomineeRow(m.relationLabel, name, m.fmid);
                alreadyAddedFmids.add(m.fmid);
                added++;
            }
        }
        this.displayAddMemberDialog = false;
        this.selectedFamilyMembers = [];
        if (added > 0) {
            this.messageService.add({ severity: 'success', summary: 'Done', detail: `${added} member(s) added as nominee.` });
        }
    }

    closeAddMemberModal(): void {
        this.displayAddMemberDialog = false;
        this.selectedFamilyMembers = [];
        this.familyMembersList = [];
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe(params => {
            const employeeId = params['id'];
            const mode = params['mode'];
            if (employeeId) {
                this.mode = mode === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(employeeId, 10));
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
                    this.loadNomineesForEmployee(this.selectedEmployeeId!);
                }
            },
            error: (err) => {
                console.error('Failed to load employee', err);
            }
        });
    }

    loadNomineesForEmployee(employeeId: number): void {
        this.nominees.clear();
        this.existingNomineeFmids = [];
        this.nomineeFilesByFmid.clear();
        this.fileRows = [];
        forkJoin({
            nominees: this.nomineeInfoService.getByEmployeeId(employeeId).pipe(catchError(() => of([]))),
            family: this.familyInfoService.getByEmployeeId(employeeId).pipe(catchError(() => of([])))
        }).subscribe({
            next: ({ nominees, family }) => {
                const nomineeList = Array.isArray(nominees) ? nominees : [];
                const familyList = Array.isArray(family) ? family : [];
                const familyByFmid = new Map<number, { relationLabel: string; name: string }>();
                for (const f of familyList) {
                    const item = f as any;
                    const fmid = item.fmid ?? item.FMID;
                    const relation = item.relation ?? item.Relation;
                    const name = (item.nameEN ?? item.NameEN ?? item.nameBN ?? item.NameBN ?? '').trim();
                    if (fmid != null && name) {
                        familyByFmid.set(fmid, { relationLabel: this.getRelationLabel(relation), name });
                    }
                }
                let ser = 1;
                let firstNomineeRefsJson: string | null = null;
                for (const n of nomineeList) {
                    const item = n as any;
                    const fmid = item.fmid ?? item.FMID;
                    const pct = item.sharePercent ?? item.SharePercent ?? null;
                    const createdDate = item.createdDate ?? item.CreatedDate ?? item.lastupdate ?? item.Lastupdate ?? null;
                    const createdDateStr = createdDate != null ? (typeof createdDate === 'string' ? createdDate : new Date(createdDate).toISOString()) : null;
                    const refsJson = item.filesReferences ?? item.FilesReferences ?? null;
                    if (refsJson && typeof refsJson === 'string') {
                        this.nomineeFilesByFmid.set(fmid, refsJson);
                    }
                    if (firstNomineeRefsJson === null) firstNomineeRefsJson = refsJson && typeof refsJson === 'string' ? refsJson : null;
                    this.existingNomineeFmids.push(fmid);
                    const info = familyByFmid.get(fmid);
                    this.nominees.push(this.createNomineeRow(
                        ser++,
                        info?.relationLabel ?? 'N/A',
                        info?.name ?? 'N/A',
                        pct != null ? Number(pct) : null,
                        fmid,
                        createdDateStr
                    ));
                }
                // Load file rows for first nominee (Supporting Documents section)
                if (firstNomineeRefsJson) {
                    try {
                        const refs = JSON.parse(firstNomineeRefsJson) as { FileId?: number; fileName?: string }[];
                        if (Array.isArray(refs)) {
                            this.fileRows = refs.map((r) => ({ displayName: r.fileName ?? '', file: null, fileId: r.FileId }));
                        }
                    } catch {
                        this.fileRows = [];
                    }
                }
            },
            error: () => {
                this.nominees.clear();
            }
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = false;
        this.loadNomineesForEmployee(employee.employeeID);
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
    }

    /** Discard changes and switch back to view mode; reload nominees from server. */
    cancelEdit(): void {
        if (!this.selectedEmployeeId) return;
        this.mode = 'view';
        this.isReadonly = true;
        this.loadNomineesForEmployee(this.selectedEmployeeId);
        this.messageService.add({ severity: 'info', summary: 'Cancelled', detail: 'Changes discarded.' });
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.nominees.clear();
        this.existingNomineeFmids = [];
        this.fileRows = [];
        this.nomineeFilesByFmid.clear();
    }

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) {
            this.fileRows = event;
        }
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        const fileId = Number(payload.fileId);
        if (!Number.isInteger(fileId) || fileId < 1) {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Invalid file reference' });
            return;
        }
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err) => {
                console.error('Download failed', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file' });
            }
        });
    }

    saveData(): void {
        if (this.nomineeForm.invalid) {
            this.nomineeForm.markAllAsTouched();
            return;
        }
        if (!this.selectedEmployeeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        const rows = this.nominees.controls;
        const currentFmids = new Set(rows.map(c => c.get('fmid')?.value).filter((id): id is number => id != null));
        const toDelete = this.existingNomineeFmids.filter(fmid => !currentFmids.has(fmid));
        const toSave = rows
            .map(c => ({ fmid: c.get('fmid')?.value as number | null, pct: c.get('nominatedPercentage')?.value as number | null }))
            .filter(r => r.fmid != null);

        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() ?? [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() ?? [];

        const now = new Date().toISOString();
        const deleteCalls = toDelete.map(fmid =>
            this.nomineeInfoService.delete(this.selectedEmployeeId!, fmid).pipe(catchError(() => of(null)))
        );

        const runSaves = (firstNomineeFilesRefsJson: string | null) => {
            const saveCalls = rows
                .filter(c => {
                    const fid = c.get('fmid')?.value;
                    return fid != null && toSave.some(r => r.fmid === fid);
                })
                .map((c, index) => {
                    const fmid = c.get('fmid')?.value as number;
                    const pct = c.get('nominatedPercentage')?.value as number | null;
                    const createdDate = c.get('createdDate')?.value as string | null;
                    const filesReferences = index === 0 ? firstNomineeFilesRefsJson : (this.nomineeFilesByFmid.get(fmid) ?? undefined);
                    return this.nomineeInfoService.saveUpdate({
                        employeeID: this.selectedEmployeeId!,
                        fmid,
                        sharePercent: pct ?? 0,
                        lastUpdatedBy: 'user',
                        createdDate: createdDate ?? now,
                        lastupdate: now,
                        statusDate: now,
                        filesReferences: filesReferences ?? undefined
                    }).pipe(catchError(() => of(null)));
                });
            const allCalls = [...deleteCalls, ...saveCalls];
            if (allCalls.length === 0) {
                this.messageService.add({ severity: 'info', summary: 'Info', detail: 'No nominee changes to save.' });
                return;
            }
            this.isSaving = true;
            forkJoin(allCalls).subscribe({
                next: () => {
                    this.isSaving = false;
                    this.existingNomineeFmids = toSave.map(r => r.fmid!);
                    this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Nominee information saved successfully.' });
                    this.loadNomineesForEmployee(this.selectedEmployeeId!);
                },
                error: () => {
                    this.isSaving = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save nominee information.' });
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
                    const firstNomineeFilesRefsJson = allRefs.length > 0 ? JSON.stringify(allRefs) : null;
                    runSaves(firstNomineeFilesRefsJson);
                },
                error: (err) => {
                    console.error('Error uploading files', err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload one or more files' });
                }
            });
            return;
        }

        const firstNomineeFilesRefsJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        runSaves(firstNomineeFilesRefsJson);
    }
}
