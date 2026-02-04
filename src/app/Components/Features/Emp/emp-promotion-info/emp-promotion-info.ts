import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { FileUploadModule } from 'primeng/fileupload';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { EmpService } from '@/services/emp-service';
import { PromotionInfoService, PromotionInfoModel } from '@/services/promotion-info.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

export interface PromotionListRow extends PromotionInfoModel {
    documentPath?: string | null;
    documentFileName?: string | null;
    documentFile?: File | null;
}

@Component({
    selector: 'app-emp-promotion-info',
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
        SelectModule,
        DatePickerModule,
        FileUploadModule,
        DialogModule,
        ConfirmDialogModule,
        EmployeeSearchComponent
    ],
    providers: [ConfirmationService],
    templateUrl: './emp-promotion-info.html',
    styleUrl: './emp-promotion-info.scss'
})
export class EmpPromotionInfo implements OnInit {
    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    selectedOrgId: number | null = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    promotionList: PromotionListRow[] = [];
    isLoading = false;

    displayDialog = false;
    isEditMode = false;
    isSaving = false;
    promotionForm!: FormGroup;
    editingPromotionId: number | null = null;

    rankOptions: { label: string; value: number }[] = [];

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private promotionInfoService: PromotionInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.buildForm();
        this.loadRankOptions();
        this.checkRouteParams();
    }

    buildForm(): void {
        this.promotionForm = this.fb.group({
            promotionID: [null],
            previousRank: [null],
            promotedRank: [null],
            promotedDate: [null],
            fromDate: [null],
            toDate: [null],
            probationaryPeriod: [''],
            auth: [''],
            remarks: [''],
            documentFileName: [''],
            documentFile: [null as File | null],
            documentPath: [null as string | null]
        });
    }

    private mapCommonCodeToOption(item: any): { label: string; value: number } {
        const label = item?.codeValueEN ?? item?.CodeValueEN ?? item?.displayCodeValueEN ?? item?.DisplayCodeValueEN ?? String(item?.codeId ?? item?.CodeId ?? '');
        const value = item?.codeId ?? item?.CodeId ?? 0;
        return { label, value };
    }

    loadRankOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Rank').pipe(catchError(() => of([] as any[]))).subscribe({
            next: (list: any[]) => {
                this.rankOptions = (Array.isArray(list) ? list : []).map((item: any) => this.mapCommonCodeToOption(item));
            }
        });
    }

    loadRankOptionsByOrg(orgId: number | null): void {
        if (orgId == null) return;
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').pipe(catchError(() => of([] as any[]))).subscribe({
            next: (list: any[]) => {
                const arr = Array.isArray(list) ? list : [];
                if (arr.length > 0) this.rankOptions = arr.map((item: any) => this.mapCommonCodeToOption(item));
            }
        });
    }

    toDateOnly(d: Date | string | null): string | null {
        if (d == null) return null;
        if (typeof d === 'string') {
            const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return d.substring(0, 10);
            const parsed = new Date(d);
            return isNaN(parsed.getTime()) ? null : parsed.toISOString().substring(0, 10);
        }
        if (d instanceof Date) return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
        return null;
    }

    private toDateForPicker(d: Date | string | null): Date | null {
        if (d == null) return null;
        if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? null : parsed;
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
                    this.selectedOrgId = employee.orgId ?? employee.OrgId ?? employee.lastMotherUnit ?? employee.LastMotherUnit ?? null;
                    this.loadRankOptionsByOrg(this.selectedOrgId);
                    this.loadPromotionList();
                }
            },
            error: err => console.error('Failed to load employee', err)
        });
    }

    loadPromotionList(): void {
        if (!this.selectedEmployeeId) return;
        this.isLoading = true;
        this.promotionInfoService.getByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (list: any[]) => {
                const arr = Array.isArray(list) ? list : [];
                this.promotionList = arr
                    .filter((item: any) => (item.employeeID ?? item.EmployeeID) === this.selectedEmployeeId)
                    .map((item: any) => {
                        const docPath = (item as any).documentPath ?? (item as any).DocumentPath ?? null;
                        const docName = docPath ? (docPath.split(/[/\\]/).pop() ?? '') : '';
                        return {
                            employeeID: item.employeeID ?? item.EmployeeID,
                            promotionID: item.promotionID ?? item.PromotionID,
                            previousRank: item.previousRank ?? item.PreviousRank ?? null,
                            promotedRank: item.promotedRank ?? item.PromotedRank ?? null,
                            promotedDate: item.promotedDate ?? item.PromotedDate ?? null,
                            fromDate: item.fromDate ?? item.FromDate ?? null,
                            toDate: item.toDate ?? item.ToDate ?? null,
                            probationaryPeriod: (item as any).probationaryPeriod ?? (item as any).ProbationaryPeriod ?? null,
                            auth: item.auth ?? item.Auth ?? null,
                            remarks: item.remarks ?? item.Remarks ?? null,
                            documentPath: docPath,
                            documentFileName: docName,
                            documentFile: null as File | null
                        };
                    });
                this.isLoading = false;
            },
            error: () => { this.promotionList = []; this.isLoading = false; }
        });
    }

    getOptionLabel(options: { label: string; value: number }[], value: number | null): string {
        if (value == null) return '—';
        const opt = options.find(o => o.value === value);
        return opt ? opt.label : String(value);
    }

    formatDate(value: Date | string | null): string {
        if (value == null) return '—';
        const d = typeof value === 'string' ? new Date(value) : value;
        if (isNaN(d.getTime())) return '—';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}-${month}-${d.getFullYear()}`;
    }

    getPromotionOrderLabel(row: PromotionListRow): string {
        if (row.documentFile?.name) return row.documentFile.name;
        if (row.documentPath) return row.documentPath.split(/[/\\]/).pop() ?? row.documentPath;
        return row.documentFileName ?? '—';
    }

    truncatePromotionOrderName(row: PromotionListRow, maxLen: number = 20): string {
        const full = this.getPromotionOrderLabel(row);
        if (full === '—') return full;
        return full.length <= maxLen ? full : full.slice(0, maxLen) + '...';
    }

    viewPromotionOrder(row: PromotionListRow): void {
        if (row.documentFile) window.open(URL.createObjectURL(row.documentFile), '_blank');
        else if (row.documentPath) window.open(row.documentPath, '_blank');
    }

    hasPromotionOrderFileInForm(): boolean {
        const file = this.promotionForm.get('documentFile')?.value as File | null;
        const path = this.promotionForm.get('documentPath')?.value as string | null;
        return !!(file?.name || path);
    }

    getPromotionOrderLabelInForm(): string {
        const file = this.promotionForm.get('documentFile')?.value as File | null;
        const path = this.promotionForm.get('documentPath')?.value as string | null;
        if (file?.name) return file.name;
        if (path) return path.split(/[/\\]/).pop() ?? path;
        return '—';
    }

    viewPromotionOrderInForm(): void {
        const file = this.promotionForm.get('documentFile')?.value as File | null;
        const path = this.promotionForm.get('documentPath')?.value as string | null;
        if (file) window.open(URL.createObjectURL(file), '_blank');
        else if (path) window.open(path, '_blank');
    }

    clearPromotionOrderInForm(): void {
        this.promotionForm.patchValue({ documentFile: null, documentPath: null, documentFileName: '' });
    }

    onPromotionOrderSelectInForm(event: { files: File[] }): void {
        this.promotionForm.patchValue({ documentFile: event.files?.[0] ?? null });
    }

    onDialogHide(): void {
        this.promotionForm.patchValue({ documentFile: null });
    }

    openAddDialog(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        this.isEditMode = false;
        this.editingPromotionId = null;
        this.promotionForm.reset({
            promotionID: null,
            previousRank: null,
            promotedRank: null,
            promotedDate: null,
            fromDate: null,
            toDate: null,
            probationaryPeriod: '',
            auth: '',
            remarks: '',
            documentFileName: '',
            documentFile: null,
            documentPath: null
        });
        this.displayDialog = true;
    }

    openEditDialog(row: PromotionListRow): void {
        this.isEditMode = true;
        this.editingPromotionId = row.promotionID;
        this.promotionForm.patchValue({
            promotionID: row.promotionID,
            previousRank: row.previousRank,
            promotedRank: row.promotedRank,
            promotedDate: this.toDateForPicker(row.promotedDate ?? null),
            fromDate: this.toDateForPicker(row.fromDate ?? null),
            toDate: this.toDateForPicker(row.toDate ?? null),
            probationaryPeriod: row.probationaryPeriod ?? '',
            auth: row.auth ?? '',
            remarks: row.remarks ?? '',
            documentFileName: row.documentFileName ?? '',
            documentFile: null,
            documentPath: row.documentPath ?? null
        });
        this.displayDialog = true;
    }

    savePromotion(): void {
        if (!this.selectedEmployeeId) return;
        const v = this.promotionForm.value;
        const now = new Date().toISOString();
        const newId = this.promotionList.length > 0 ? Math.max(...this.promotionList.map(r => r.promotionID)) + 1 : 1;
        const payload: Partial<PromotionInfoModel> = {
            employeeID: this.selectedEmployeeId,
            promotionID: this.isEditMode ? (this.editingPromotionId ?? 0) : newId,
            previousRank: v.previousRank ?? null,
            promotedRank: v.promotedRank ?? null,
            promotedDate: this.toDateOnly(v.promotedDate),
            fromDate: this.toDateOnly(v.fromDate),
            toDate: this.toDateOnly(v.toDate),
            probationaryPeriod: v.probationaryPeriod || null,
            auth: v.auth || null,
            remarks: v.remarks ?? '',
            createdBy: 'user',
            createdDate: now,
            lastUpdatedBy: 'user',
            lastupdate: now
        };
        this.isSaving = true;
        const req = this.isEditMode ? this.promotionInfoService.saveUpdate(payload) : this.promotionInfoService.save(payload);
        req.pipe(
            map((res: any) => {
                const code = res?.statusCode ?? res?.StatusCode ?? 200;
                if (code !== 200) throw new Error(res?.description ?? res?.Description ?? 'Save failed');
                return res;
            }),
            catchError(err => {
                this.messageService.add({ severity: 'error', summary: this.isEditMode ? 'Update failed' : 'Save failed', detail: String(err?.error?.description ?? err?.error?.Description ?? err?.message) });
                return of(null);
            })
        ).subscribe(res => {
            this.isSaving = false;
            if (res != null) {
                this.messageService.add({ severity: 'success', summary: 'Saved', detail: this.isEditMode ? 'Promotion updated.' : 'Promotion added.' });
                this.displayDialog = false;
                this.loadPromotionList();
            }
        });
    }

    confirmDelete(row: PromotionListRow): void {
        this.confirmationService.confirm({
            message: 'Delete this promotion record?',
            header: 'Confirm Delete',
            icon: 'pi pi-exclamation-triangle',
            accept: () => this.deletePromotion(row)
        });
    }

    deletePromotion(row: PromotionListRow): void {
        this.promotionInfoService.delete(row.employeeID, row.promotionID).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Deleted', detail: 'Promotion deleted.' });
                this.loadPromotionList();
            },
            error: err => this.messageService.add({ severity: 'error', summary: 'Error', detail: String(err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Delete failed') })
        });
    }

    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.selectedOrgId = employee.motherOrganization ?? (employee as any).orgId ?? (employee as any).OrgId ?? null;
        this.isReadonly = false;
        this.loadRankOptionsByOrg(this.selectedOrgId);
        if (this.selectedOrgId != null) {
            this.loadPromotionList();
        } else {
            this.empService.getEmployeeById(employee.employeeID).subscribe({
                next: (full) => {
                    this.employeeBasicInfo = full;
                    this.selectedOrgId = (full as any).orgId ?? (full as any).OrgId ?? (full as any).lastMotherUnit ?? (full as any).LastMotherUnit ?? null;
                    this.loadRankOptionsByOrg(this.selectedOrgId);
                    this.loadPromotionList();
                },
                error: () => this.loadPromotionList()
            });
        }
    }

    onEmployeeSearchReset(): void { this.resetForm(); }
    enableEditMode(): void { this.mode = 'edit'; this.isReadonly = false; }
    cancelEdit(): void {
        if (!this.selectedEmployeeId) return;
        this.mode = 'view';
        this.isReadonly = true;
        this.loadPromotionList();
        this.messageService.add({ severity: 'info', summary: 'Cancelled', detail: 'Changes discarded.' });
    }
    goBack(): void { this.router.navigate(['/emp-list']); }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.selectedOrgId = null;
        this.promotionList = [];
    }
}
