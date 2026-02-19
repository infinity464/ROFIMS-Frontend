import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TableConfig } from '../shared/models/dataTableConfig';
import { DataTable } from '../shared/componets/data-table/data-table';
import { FluidModule } from 'primeng/fluid';
import { SharedService } from '@/shared/services/shared-service';
import { NoteSheetTemplateModel } from '../shared/models/notesheet-template';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectButtonModule } from 'primeng/selectbutton';

@Component({
    selector: 'app-notesheet-template',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FluidModule,
        InputTextModule,
        TextareaModule,
        ButtonModule,
        CheckboxModule,
        SelectButtonModule,
        DataTable
    ],
    templateUrl: './notesheet-template.html',
    providers: [MessageService, ConfirmationService],
    styleUrl: './notesheet-template.scss'
})
export class NotesheetTemplateComponent {
    title = 'Notesheet Template';
    templateData: NoteSheetTemplateModel[] = [];
    editingId: number | null = null;
    form!: FormGroup;
    isSubmitting = false;
    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue = '';
    private _filteredData: NoteSheetTemplateModel[] = [];

    tableConfig: TableConfig = {
        tableColumns: [
            { field: 'noteSheetTemplateId', header: 'ID', hidden: true },
            { field: 'name', header: 'Name' },
            { field: 'mainTextEn', header: 'Main Text (EN)', type: 'text' },
            { field: 'mainTextBn', header: 'Main Text (BN)', type: 'text' },
            { field: 'remarks', header: 'Remarks', type: 'text' },
            { field: 'status', header: 'Status', type: 'boolean', trueLabel: 'Active', falseLabel: 'Inactive' },
            { field: 'isRelatedToEmployee', header: 'Related to Employee', type: 'boolean', trueLabel: 'Yes', falseLabel: 'No' }
        ]
    };

    constructor(
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private fb: FormBuilder,
        private sharedService: SharedService
    ) {
        this.form = this.fb.group({
            noteSheetTemplateId: [0],
            name: ['', Validators.required],
            mainTextEn: [''],
            mainTextBn: [''],
            remarks: [''],
            status: [true, Validators.required],
            isRelatedToEmployee: [false],
            selectedEmployeeJson: [''],
            approverChainJson: ['']
        });
    }

    ngOnInit(): void {
        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.masterBasicSetupService.getNoteSheetTemplates().subscribe({
            next: (res) => {
                const list = Array.isArray(res) ? res : [];
                this.templateData = list;
                this._filteredData = this.searchValue
                    ? list.filter((t) => [t.name, t.remarks, t.mainTextEn, t.mainTextBn].some((v) => (v || '').toLowerCase().includes(this.searchValue.toLowerCase())))
                    : list;
                this.totalRecords = this._filteredData.length;
                this.loading = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load notesheet templates' });
                this.loading = false;
            }
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
        const payload: NoteSheetTemplateModel = {
            ...this.form.value,
            createdBy: this.sharedService.getCurrentUser(),
            createdDate: this.sharedService.getCurrentDateTime(),
            lastUpdatedBy: this.sharedService.getCurrentUser(),
            lastupdate: this.sharedService.getCurrentDateTime()
        };
        if (!payload.isRelatedToEmployee) {
            payload.selectedEmployeeJson = null;
            payload.approverChainJson = null;
        }
        this.isSubmitting = true;
        const req = this.editingId
            ? this.masterBasicSetupService.updateNoteSheetTemplate(payload)
            : this.masterBasicSetupService.createNoteSheetTemplate(payload);
        req.subscribe({
            next: () => {
                this.resetForm();
                this.loadData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: this.editingId ? 'Template updated.' : 'Template created.' });
                this.isSubmitting = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Save failed.' });
                this.isSubmitting = false;
            }
        });
    }

    update(row: NoteSheetTemplateModel): void {
        this.editingId = row.noteSheetTemplateId;
        this.form.patchValue({
            noteSheetTemplateId: row.noteSheetTemplateId,
            name: row.name,
            mainTextEn: row.mainTextEn ?? '',
            mainTextBn: row.mainTextBn ?? '',
            remarks: row.remarks ?? '',
            status: row.status,
            isRelatedToEmployee: row.isRelatedToEmployee ?? false,
            selectedEmployeeJson: row.selectedEmployeeJson ?? '',
            approverChainJson: row.approverChainJson ?? ''
        });
    }

    delete(row: NoteSheetTemplateModel, event: Event): void {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Delete this notesheet template?',
            header: 'Delete',
            accept: () => {
                this.masterBasicSetupService.deleteNoteSheetTemplate(row.noteSheetTemplateId).subscribe({
                    next: () => {
                        this.loadData();
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Deleted.' });
                    },
                    error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Delete failed.' })
                });
            }
        });
    }

    resetForm(): void {
        this.editingId = null;
        this.form.reset({
            noteSheetTemplateId: 0,
            name: '',
            mainTextEn: '',
            mainTextBn: '',
            remarks: '',
            status: true,
            isRelatedToEmployee: false,
            selectedEmployeeJson: '',
            approverChainJson: ''
        });
    }

    onSearch(keyword: string): void {
        this.searchValue = keyword;
        this.first = 0;
        this._filteredData = this.searchValue
            ? this.templateData.filter((t) => [t.name, t.remarks, t.mainTextEn, t.mainTextBn].some((v) => (v || '').toLowerCase().includes(this.searchValue.toLowerCase())))
            : this.templateData;
        this.totalRecords = this._filteredData.length;
    }

    onLazyLoad(event: unknown): void {
        const e = event as { first?: number; rows?: number };
        this.first = e?.first ?? 0;
        this.rows = e?.rows ?? this.rows;
    }

    get isRelatedToEmployee(): boolean {
        return !!this.form.get('isRelatedToEmployee')?.value;
    }

    get tableData(): NoteSheetTemplateModel[] {
        return this._filteredData.slice(this.first, this.first + this.rows);
    }
}
