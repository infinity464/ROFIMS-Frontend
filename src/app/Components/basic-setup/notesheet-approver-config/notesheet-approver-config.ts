import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { NoteSheetApproverConfigModel } from '../shared/models/notesheet-approver-config';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { InputText } from 'primeng/inputtext';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { Select } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/Core/Environments/environment';
import { ApproverRoleType, NoteSheetTypeOptions } from '@/models/enums';

@Component({
    selector: 'app-notesheet-approver-config',
    imports: [ReactiveFormsModule, TableModule, InputText, Fluid, ButtonModule, IconField, InputIcon, Select, MultiSelectModule],
    templateUrl: './notesheet-approver-config.html',
    styleUrl: './notesheet-approver-config.scss'
})
export class NoteSheetApproverConfigComponent implements OnInit {
    isSubmitting = false;
    isEditMode = false;
    editingConfigId = 0;
    configForm!: FormGroup;

    configs: NoteSheetApproverConfigModel[] = [];
    filteredConfigs: NoteSheetApproverConfigModel[] = [];

    readonly ApproverRoleType = ApproverRoleType;
    noteSheetTypeOptions = NoteSheetTypeOptions;

    employeeOptions: { label: string; value: number }[] = [];
    currentUser: string = '';

    // Pagination
    first = 0;
    rows = 10;
    totalRecords = 0;

    // Search
    searchValue = '';

    constructor(
        private fb: FormBuilder,
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private sharedService: SharedService,
        private http: HttpClient
    ) {}

    ngOnInit(): void {
        this.currentUser = this.sharedService.getCurrentUser();
        this.initForm();
        this.getAll();
        this.loadEmployees();
    }

    initForm() {
        this.configForm = this.fb.group({
            configId: [0],
            noteSheetType: [null, Validators.required],
            initiatorIds: [[] as number[]],
            recommenderIds: [[] as number[]],
            finalApproverIds: [[] as number[]]
        });
    }

    loadEmployees() {
        this.http.get<any[]>(`${environment.apis.core}/EmployeeInfo/GetAll`).subscribe({
            next: (list) => {
                this.employeeOptions = (Array.isArray(list) ? list : []).map((e: any) => {
                    const name = e.fullNameEN || e.FullNameEN || '';
                    const rabId = e.rabid || e.Rabid || e.RABID || '';
                    const serviceId = e.serviceId || e.ServiceId || '';
                    const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                    return {
                        label: parts.join(' | ') || `ID ${e.employeeID ?? e.EmployeeID}`,
                        value: e.employeeID ?? e.EmployeeID
                    };
                });
            }
        });
    }

    getAll() {
        this.masterBasicSetupService.getAllNoteSheetApproverConfig().subscribe({
            next: (res: NoteSheetApproverConfigModel[]) => {
                this.configs = res;
                this.filteredConfigs = [...res];
                this.totalRecords = res.length;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to fetch NoteSheet Approver Config data'
                });
            }
        });
    }

    getDetailCountByRole(row: NoteSheetApproverConfigModel, roleType: string): number {
        if (!row.details) return 0;
        return row.details.filter(d => d.roleType === roleType).length;
    }

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = target.value.toLowerCase().trim();

        if (this.searchValue) {
            this.filteredConfigs = this.configs.filter((c) => {
                return c.noteSheetType.toLowerCase().includes(this.searchValue);
            });
        } else {
            this.filteredConfigs = [...this.configs];
        }

        this.totalRecords = this.filteredConfigs.length;
        this.first = 0;
    }

    onSubmit() {
        if (this.isSubmitting) return;

        if (this.configForm.invalid) {
            this.configForm.markAllAsTouched();
            return;
        }

        if (this.isEditMode) {
            this.update();
        } else {
            this.create();
        }
    }

    private buildDetails(formVal: any): any[] {
        const details: any[] = [];
        for (const id of (formVal.initiatorIds ?? [])) {
            details.push({ detailId: 0, configId: 0, roleType: ApproverRoleType.Initiator, employeeId: id });
        }
        for (const id of (formVal.recommenderIds ?? [])) {
            details.push({ detailId: 0, configId: 0, roleType: ApproverRoleType.Recommender, employeeId: id });
        }
        for (const id of (formVal.finalApproverIds ?? [])) {
            details.push({ detailId: 0, configId: 0, roleType: ApproverRoleType.FinalApprover, employeeId: id });
        }
        return details;
    }

    create() {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const formVal = this.configForm.getRawValue();

        const payload: any = {
            configId: 0,
            noteSheetType: formVal.noteSheetType,
            status: true,
            details: this.buildDetails(formVal),
            createdBy: this.currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.createNoteSheetApproverConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'NoteSheet Approver Config created successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create NoteSheet Approver Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    update() {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();
        const existing = this.configs.find(c => c.configId === this.editingConfigId);
        const formVal = this.configForm.getRawValue();

        const payload: any = {
            ...existing,
            details: this.buildDetails(formVal),
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.updateNoteSheetApproverConfig(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'NoteSheet Approver Config updated successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update NoteSheet Approver Config'
                });
                this.isSubmitting = false;
            }
        });
    }

    onEdit(row: NoteSheetApproverConfigModel) {
        this.isEditMode = true;
        this.editingConfigId = row.configId;
        const details = row.details ?? [];
        this.configForm.patchValue({
            configId: row.configId,
            noteSheetType: row.noteSheetType,
            initiatorIds: details.filter(d => d.roleType === ApproverRoleType.Initiator).map(d => d.employeeId),
            recommenderIds: details.filter(d => d.roleType === ApproverRoleType.Recommender).map(d => d.employeeId),
            finalApproverIds: details.filter(d => d.roleType === ApproverRoleType.FinalApprover).map(d => d.employeeId)
        });
        this.configForm.get('noteSheetType')?.disable();
    }

    onDelete(row: NoteSheetApproverConfigModel) {
        if (!confirm(`Are you sure you want to delete the config for "${row.noteSheetType}"?`)) {
            return;
        }

        this.masterBasicSetupService.deleteNoteSheetApproverConfig(row.configId).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'NoteSheet Approver Config deleted successfully'
                });
                this.getAll();
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to delete NoteSheet Approver Config'
                });
            }
        });
    }

    onReset() {
        this.configForm.reset({
            configId: 0,
            noteSheetType: null,
            initiatorIds: [],
            recommenderIds: [],
            finalApproverIds: []
        });
        this.configForm.get('noteSheetType')?.enable();
        this.isEditMode = false;
        this.editingConfigId = 0;
        this.isSubmitting = false;
    }
}
