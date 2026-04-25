import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import {
    DynamicSearchService,
    SearchCategory,
    SearchFieldDefinition,
    DynamicSearchCriterion,
    DynamicSearchRequest
} from '@/services/dynamic-search.service';
import { UserMenuService } from '@/services/user-menu.service';

interface CriterionValue {
    fieldKey: string;
    textValue: string;
    idValue: number | null;
    stringIdValue: string;
    dateFrom: Date | null;
    dateTo: Date | null;
}

@Component({
    selector: 'app-dynamic-search',
    standalone: true,
    imports: [
        CommonModule, FormsModule, RouterModule,
        TableModule, ButtonModule, InputTextModule,
        SelectModule, MultiSelectModule, DatePickerModule,
        Toast
    ],
    providers: [MessageService],
    templateUrl: './dynamic-search.html',
    styleUrls: ['./dynamic-search.scss', '../../../Components/Features/employee-reports/report-theme.scss']
})
export class DynamicSearchComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    // Category
    categoryOptions = [
        { label: 'Employee', value: 'Employee' as SearchCategory },
        { label: 'Office Management', value: 'OfficeManagement' as SearchCategory }
    ];
    selectedCategory: SearchCategory = 'Employee';

    // Employee posting status filter
    memberStatusOptions = [
        { label: 'Presently Serving', value: 'Servings' },
        { label: 'Ex Member', value: 'ExMember' },
        { label: 'Supernumerary', value: 'Supernumerary' },
        { label: 'Pending for Joining', value: 'Pending' },
        { label: 'All', value: '' }
    ];
    selectedMemberStatus: string = 'Servings';

    // Fields
    availableFields: SearchFieldDefinition[] = [];
    selectedFields: SearchFieldDefinition[] = [];
    criteriaValues: Map<string, CriterionValue> = new Map();

    // Results
    results: any[] = [];
    loading = false;
    totalRecords = 0;
    first = 0;
    rows = 10;

    // Track whether user has performed a search (prevents onLazyLoad from firing before first search)
    private hasSearched = false;

    // Filter panel
    filterOpen = true;

    constructor(
        private searchService: DynamicSearchService,
        private messageService: MessageService,
        private _router: Router,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadFields();
    }

    onCategoryChange(): void {
        this.selectedFields = [];
        this.criteriaValues.clear();
        this.results = [];
        this.totalRecords = 0;
        this.first = 0;
        this.selectedMemberStatus = 'Servings';
        this.loadFields();
    }

    private loadFields(): void {
        this.searchService.getSearchFields(this.selectedCategory).subscribe({
            next: (fields) => {
                this.availableFields = fields;
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load search fields.' });
            }
        });
    }

    onFieldsChange(): void {
        // Initialize criterion values for newly selected fields
        for (const field of this.selectedFields) {
            if (!this.criteriaValues.has(field.fieldKey)) {
                this.criteriaValues.set(field.fieldKey, {
                    fieldKey: field.fieldKey,
                    textValue: '',
                    idValue: null,
                    stringIdValue: '',
                    dateFrom: null,
                    dateTo: null
                });
            }
        }
        // Remove deselected fields
        const selectedKeys = new Set(this.selectedFields.map(f => f.fieldKey));
        for (const key of this.criteriaValues.keys()) {
            if (!selectedKeys.has(key)) {
                this.criteriaValues.delete(key);
            }
        }
    }

    getCriterionValue(fieldKey: string): CriterionValue {
        return this.criteriaValues.get(fieldKey)!;
    }

    getFieldOptions(field: SearchFieldDefinition): { label: string; value: any }[] {
        return (field.options || []).map(o => ({ label: o.label, value: o.value }));
    }

    search(): void {
        this.first = 0;
        this.hasSearched = true;
        this.loadResults();
    }

    clearFilter(): void {
        this.selectedFields = [];
        this.criteriaValues.clear();
        this.results = [];
        this.totalRecords = 0;
        this.first = 0;
        this.hasSearched = false;
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        if (!this.hasSearched) return;
        this.first = event.first ?? 0;
        this.rows = event.rows ?? 10;
        this.loadResults();
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    private loadResults(): void {
        this.loading = true;

        const criteria: DynamicSearchCriterion[] = [];
        for (const field of this.selectedFields) {
            const cv = this.criteriaValues.get(field.fieldKey);
            if (!cv) continue;

            const criterion: DynamicSearchCriterion = { fieldKey: field.fieldKey };
            let hasValue = false;

            if (field.fieldType === 'Text' && cv.textValue?.trim()) {
                criterion.textValue = cv.textValue.trim();
                hasValue = true;
            } else if (field.fieldType === 'ExactId') {
                if (field.isStringId && cv.stringIdValue) {
                    criterion.stringIdValue = cv.stringIdValue;
                    hasValue = true;
                } else if (!field.isStringId && cv.idValue != null) {
                    criterion.idValue = cv.idValue;
                    hasValue = true;
                }
            } else if (field.fieldType === 'DateRange') {
                if (cv.dateFrom) {
                    criterion.dateFrom = this.formatDateOnly(cv.dateFrom);
                    hasValue = true;
                }
                if (cv.dateTo) {
                    criterion.dateTo = this.formatDateOnly(cv.dateTo);
                    hasValue = true;
                }
            }

            if (hasValue) {
                criteria.push(criterion);
            }
        }

        const request: DynamicSearchRequest = {
            category: this.selectedCategory,
            pagination: {
                page_no: Math.floor(this.first / this.rows) + 1,
                row_per_page: this.rows
            },
            criteria,
            postingStatusFilter: this.isEmployee && this.selectedMemberStatus
                ? this.selectedMemberStatus
                : null
        };

        this.searchService.search(request).subscribe({
            next: (response) => {
                this.results = response.datalist || [];
                this.totalRecords = response.pages?.rows || 0;
                this.loading = false;
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Search failed.' });
                this.loading = false;
            }
        });
    }

    private formatDateOnly(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    formatDate(dateStr: string | null): string {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return dateStr;
        }
    }

    // Field grouping for Employee category (visual sections)
    private readonly identifierKeys = new Set(['rabId', 'serviceId', 'nid']);
    private readonly personalKeys = new Set(['nameEnglish', 'nameBangla', 'mobileNo', 'email', 'dob', 'gender', 'bloodGroup', 'religion', 'maritalStatus']);
    private readonly serviceKeys = new Set(['rank', 'corps', 'trade', 'appointment', 'memberType', 'rabUnit', 'joiningDate', 'commissionDate', 'permanentDistrict']);

    get groupedFields(): { label: string; fields: SearchFieldDefinition[] }[] {
        if (this.selectedCategory !== 'Employee') {
            return this.selectedFields.length > 0
                ? [{ label: '', fields: this.selectedFields }]
                : [];
        }
        const groups: { label: string; fields: SearchFieldDefinition[] }[] = [];
        const ids = this.selectedFields.filter(f => this.identifierKeys.has(f.fieldKey));
        const personal = this.selectedFields.filter(f => this.personalKeys.has(f.fieldKey));
        const service = this.selectedFields.filter(f => this.serviceKeys.has(f.fieldKey));
        if (ids.length > 0) groups.push({ label: 'Identification', fields: ids });
        if (personal.length > 0) groups.push({ label: 'Personal Information', fields: personal });
        if (service.length > 0) groups.push({ label: 'Service Information', fields: service });
        return groups;
    }

    // Employee result columns
    get isEmployee(): boolean {
        return this.selectedCategory === 'Employee';
    }

    get isOffice(): boolean {
        return this.selectedCategory === 'OfficeManagement';
    }
}
