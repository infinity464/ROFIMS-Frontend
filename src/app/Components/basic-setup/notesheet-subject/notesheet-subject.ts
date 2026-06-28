import { Component, inject, OnInit } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FormConfig } from '../shared/models/formConfig';
import { TableConfig } from '../shared/models/dataTableConfig';
import { DynamicFormComponent } from '../shared/componets/dynamic-form-component/dynamic-form';
import { DataTable } from '../shared/componets/data-table/data-table';
import { Fluid } from 'primeng/fluid';
import { Select } from 'primeng/select';
import { NoteSheetSubjectModel, NoteSheetSubjectService } from '../shared/services/NoteSheetSubjectService';

@Component({
    selector: 'app-notesheet-subject',
    imports: [DynamicFormComponent, DataTable, Fluid, Select, FormsModule],
    templateUrl: './notesheet-subject.html',
    styleUrl: './notesheet-subject.scss'
})
export class NoteSheetSubject implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    title = 'Note Sheet Subject';
    data: any[] = [];
    editingId: number | null = null;
    form!: FormGroup;

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue = '';
    isSubmitting = false;

    // Grid type filter ('' = all types)
    selectedFilterType = '';
    filterTypeOptions = [
        { label: 'All Types', value: '' },
        { label: 'General', value: 'General' },
        { label: 'New Posting', value: 'NewPosting' },
        { label: 'Inter Posting', value: 'InterPosting' }
    ];

    private typeLabels: Record<string, string> = {
        General: 'General',
        NewPosting: 'New Posting',
        InterPosting: 'Inter Posting'
    };

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'noteSheetType',
                label: 'Note Sheet Type',
                type: 'select',
                required: true,
                options: [
                    { label: 'General', value: 'General' },
                    { label: 'New Posting', value: 'NewPosting' },
                    { label: 'Inter Posting', value: 'InterPosting' }
                ]
            },
            { name: 'subjectEN', label: 'Subject (English)', type: 'text', required: true },
            { name: 'subjectBN', label: 'Subject (Bangla)', type: 'text', required: true },
            {
                name: 'status',
                label: 'Status',
                type: 'select',
                required: true,
                default: true,
                options: [
                    { label: 'Active', value: true },
                    { label: 'Inactive', value: false }
                ]
            }
        ]
    };

    tableConfig: TableConfig = {
        tableColumns: [
            { field: 'noteSheetTypeLabel', header: 'Note Sheet Type' },
            { field: 'subjectEN', header: 'Subject (EN)' },
            { field: 'subjectBN', header: 'Subject (BN)' },
            { field: 'status', header: 'Status', type: 'boolean', trueLabel: 'Active', falseLabel: 'Inactive' },
            { field: 'id', header: 'ID', hidden: true }
        ]
    };

    constructor(
        private service: NoteSheetSubjectService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private fb: FormBuilder
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.initForm();
        this.load({ first: this.first, rows: this.rows });
    }

    initForm() {
        this.form = this.fb.group({
            id: [0],
            noteSheetType: [null, Validators.required],
            subjectEN: ['', Validators.required],
            subjectBN: ['', Validators.required],
            status: [true, Validators.required]
        });
    }

    load(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        this.service.getPaged(this.selectedFilterType, this.searchValue, pageNo, pageSize).subscribe({
            next: (res) => {
                this.data = (res.datalist ?? []).map((r: NoteSheetSubjectModel) => ({
                    ...r,
                    noteSheetTypeLabel: this.typeLabels[r.noteSheetType] ?? r.noteSheetType
                }));
                this.totalRecords = res.pages?.rows ?? 0;
                this.rows = pageSize;
                this.loading = false;
            },
            error: (err) => {
                this.loading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load data'
                });
            }
        });
    }

    onFilterTypeChange() {
        this.first = 0;
        this.load({ first: 0, rows: this.rows });
    }

    onSearch(keyword: string) {
        this.searchValue = keyword;
        this.first = 0;
        this.load({ first: 0, rows: this.rows });
    }

    submit(_data: any) {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const isEdit = !!this.editingId;
        this.isSubmitting = true;

        const value = this.form.value;
        const payload: Partial<NoteSheetSubjectModel> = {
            id: this.editingId ?? 0,
            noteSheetType: value.noteSheetType,
            subjectEN: value.subjectEN,
            subjectBN: value.subjectBN,
            status: value.status
        };

        const call = isEdit ? this.service.update(payload) : this.service.create(payload);
        call.subscribe({
            next: (res: any) => {
                if (res && typeof res.statusCode === 'number' && res.statusCode !== 200) {
                    this.isSubmitting = false;
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Warning',
                        detail: res.description || 'Operation failed'
                    });
                    return;
                }
                this.resetForm();
                this.load({ first: this.first, rows: this.rows });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: isEdit ? 'Note Sheet Subject updated successfully' : 'Note Sheet Subject created successfully'
                });
            },
            error: (err) => {
                this.isSubmitting = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Operation failed'
                });
            }
        });
    }

    update(row: any) {
        this.editingId = row.id;
        this.form.patchValue({
            id: row.id,
            noteSheetType: row.noteSheetType,
            subjectEN: row.subjectEN,
            subjectBN: row.subjectBN,
            status: row.status
        });
    }

    delete(row: any, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this record?',
            header: 'Delete Confirmation',
            icon: 'pi pi-info-circle',
            rejectLabel: 'Cancel',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.service.delete(row.id).subscribe({
                    next: () => {
                        this.load({ first: this.first, rows: this.rows });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'Note Sheet Subject deleted successfully'
                        });
                    },
                    error: (err) => {
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: err?.error?.message || 'Failed to delete'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.isSubmitting = false;
        this.editingId = null;
        this.form.reset({
            id: 0,
            noteSheetType: null,
            subjectEN: '',
            subjectBN: '',
            status: true
        });
    }
}
