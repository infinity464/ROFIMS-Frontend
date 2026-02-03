import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    FormArray,
    FormBuilder,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { FileUploadModule } from 'primeng/fileupload';

import { EmpService } from '@/services/emp-service';
import { RankConfirmationInfoService, RankConfirmationInfoModel } from '@/services/rank-confirmation-info.service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

@Component({
    selector: 'app-emp-rank-confirmation',
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
        EmployeeSearchComponent
    ],
    templateUrl: './emp-rank-confirmation.html',
    styleUrl: './emp-rank-confirmation.scss'
})
export class EmpRankConfirmationComponent implements OnInit {
    employeeFound = false;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: any = null;
    selectedOrgId: number | null = null;
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly = false;

    rankForm!: FormGroup;
    rankOptions: { label: string; value: number }[] = [];
    private existingKeys: { employeeId: number; rankConfirmId: number }[] = [];
    isSaving = false;

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private rankConfirmationService: RankConfirmationInfoService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.buildForm();
        this.loadRankOptions();
        this.checkRouteParams();
    }

    buildForm(): void {
        this.rankForm = this.fb.group({ rows: this.fb.array([]) });
    }

    get rows(): FormArray {
        return this.rankForm.get('rows') as FormArray;
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

    createRow(
        ser: number,
        employeeId: number | null,
        rankConfirmId: number | null,
        presentRank: number | null,
        rankConfirmDate: Date | string | null,
        auth: string | null,
        remarks: string | null,
        documentFile?: File | null,
        documentPath?: string | null,
        documentFileName?: string | null
    ): FormGroup {
        return this.fb.group({
            ser: [ser],
            employeeId: [employeeId],
            rankConfirmId: [rankConfirmId],
            presentRank: [presentRank],
            rankConfirmDate: [this.toDateForPicker(rankConfirmDate)],
            auth: [auth ?? ''],
            remarks: [remarks ?? ''],
            documentFile: [documentFile ?? null],
            documentPath: [documentPath ?? null],
            documentFileName: [documentFileName ?? (documentPath ? documentPath.split(/[/\\]/).pop() ?? '' : '')]
        });
    }

    onOrderSelect(event: { files: File[] }, rowIndex: number): void {
        const file = event.files?.[0] ?? null;
        this.rows.at(rowIndex).patchValue({ documentFile: file });
    }

    getOrderLabel(row: FormGroup): string {
        const file = row.get('documentFile')?.value as File | null;
        const path = row.get('documentPath')?.value as string | null;
        if (file?.name) return file.name;
        if (path) return path.split(/[/\\]/).pop() ?? path;
        return '—';
    }

    truncateOrderName(row: FormGroup, maxLen = 20): string {
        const full = this.getOrderLabel(row);
        return full === '—' || full.length <= maxLen ? full : full.slice(0, maxLen) + '...';
    }

    clearOrder(rowIndex: number): void {
        this.rows.at(rowIndex).patchValue({ documentFile: null, documentFileName: '' });
    }

    viewOrder(row: FormGroup): void {
        const file = row.get('documentFile')?.value as File | null;
        const path = row.get('documentPath')?.value as string | null;
        if (file) window.open(URL.createObjectURL(file), '_blank');
        else if (path) window.open(path, '_blank');
    }

    hasOrderFile(row: FormGroup): boolean {
        const file = row.get('documentFile')?.value as File | null;
        const path = row.get('documentPath')?.value as string | null;
        return !!(file?.name || path);
    }

    addRow(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        const ser = this.rows.length + 1;
        this.rows.push(this.createRow(ser, this.selectedEmployeeId, null, null, null, '', '', null, null, ''));
    }

    removeRow(index: number): void {
        this.rows.removeAt(index);
        this.rows.controls.forEach((ctrl, i) => ctrl.get('ser')?.setValue(i + 1));
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

    checkRouteParams(): void {
        this.route.queryParams.subscribe(params => {
            const id = params['id'];
            const modeParam = params['mode'];
            if (id) {
                this.mode = modeParam === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(id, 10));
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
                    this.selectedOrgId = e.orgId ?? e.OrgId ?? e.lastMotherUnit ?? e.LastMotherUnit ?? null;
                    this.loadRankOptionsByOrg(this.selectedOrgId);
                    this.loadDataForEmployee(employeeId);
                }
            },
            error: err => console.error('Failed to load employee', err)
        });
    }

    loadDataForEmployee(employeeId: number): void {
        this.rows.clear();
        this.existingKeys = [];
        this.rankConfirmationService.getByEmployeeId(employeeId).subscribe({
            next: (list: any[]) => {
                const arr = Array.isArray(list) ? list : [];
                let ser = 1;
                for (const item of arr) {
                    const empId = item.employeeId ?? (item as any).EmployeeId;
                    const rankId = item.rankConfirmId ?? (item as any).RankConfirmId;
                    if (empId !== employeeId) continue;
                    this.existingKeys.push({ employeeId: empId, rankConfirmId: rankId });
                    const rankConfirmDate = item.rankConfirmDate ?? (item as any).RankConfirmDate;
                    const dateVal = rankConfirmDate != null ? (typeof rankConfirmDate === 'string' ? rankConfirmDate : new Date(rankConfirmDate).toISOString().substring(0, 10)) : null;
                    const docPath = (item as any).documentPath ?? (item as any).DocumentPath ?? null;
                    const docName = docPath ? (docPath.split(/[/\\]/).pop() ?? '') : '';
                    this.rows.push(this.createRow(
                        ser++,
                        empId,
                        rankId,
                        item.presentRank ?? (item as any).PresentRank ?? null,
                        dateVal,
                        item.auth ?? (item as any).Auth ?? null,
                        item.remarks ?? (item as any).Remarks ?? null,
                        null,
                        docPath,
                        docName
                    ));
                }
            },
            error: () => { this.rows.clear(); this.existingKeys = []; }
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
            this.loadDataForEmployee(employee.employeeID);
        } else {
            this.empService.getEmployeeById(employee.employeeID).subscribe({
                next: (full) => {
                    this.employeeBasicInfo = full;
                    this.selectedOrgId = (full as any).orgId ?? (full as any).OrgId ?? (full as any).lastMotherUnit ?? (full as any).LastMotherUnit ?? null;
                    this.loadRankOptionsByOrg(this.selectedOrgId);
                    this.loadDataForEmployee(employee.employeeID);
                },
                error: () => this.loadDataForEmployee(employee.employeeID)
            });
        }
    }

    onEmployeeSearchReset(): void { this.resetForm(); }
    enableEditMode(): void { this.mode = 'edit'; this.isReadonly = false; }
    enableSearchEditMode(): void { this.isReadonly = false; }

    cancelEdit(): void {
        const empId = this.selectedEmployeeId;
        if (empId == null) return;
        this.mode = 'view';
        this.isReadonly = true;
        this.loadDataForEmployee(empId);
        this.messageService.add({ severity: 'info', summary: 'Cancelled', detail: 'Changes discarded.' });
    }

    goBack(): void { this.router.navigate(['/emp-list']); }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.selectedOrgId = null;
        this.rows.clear();
        this.existingKeys = [];
    }

    saveData(): void {
        if (this.selectedEmployeeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No employee selected.' });
            return;
        }
        const controls = this.rows.controls;
        const currentKeys = new Set(
            controls
                .map(c => ({ e: c.get('employeeId')?.value, r: c.get('rankConfirmId')?.value }))
                .filter((k): k is { e: number; r: number } => k.e != null && k.r != null && k.r > 0)
                .map(k => `${k.e}-${k.r}`)
        );
        const toDelete = this.existingKeys.filter(k => !currentKeys.has(`${k.employeeId}-${k.rankConfirmId}`));
        const now = new Date().toISOString();
        const deleteCalls = toDelete.map(k =>
            this.rankConfirmationService.delete(k.employeeId, k.rankConfirmId).pipe(catchError(() => of(null)))
        );
        const saveCalls: Observable<any>[] = [];
        for (const c of controls) {
            const rankConfirmId = c.get('rankConfirmId')?.value as number | null;
            const isNew = rankConfirmId == null || rankConfirmId <= 0;
            const payload: Partial<RankConfirmationInfoModel> = {
                employeeId: this.selectedEmployeeId!,
                rankConfirmId: isNew ? 0 : rankConfirmId!,
                presentRank: c.get('presentRank')?.value ?? null,
                rankConfirmDate: this.toDateOnly(c.get('rankConfirmDate')?.value),
                auth: c.get('auth')?.value || null,
                remarks: c.get('remarks')?.value ?? '',
                createdBy: 'user',
                createdDate: now,
                lastUpdatedBy: 'user',
                lastupdate: now
            };
            const call = isNew
                ? this.rankConfirmationService.save(payload).pipe(
                    map((res: any) => { const code = res?.statusCode ?? res?.StatusCode ?? 200; if (code !== 200) throw new Error(res?.description ?? res?.Description ?? 'Save failed'); return res; }),
                    catchError((err) => { this.messageService.add({ severity: 'error', summary: 'Save failed', detail: String(err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Save failed') }); return of(null); })
                )
                : this.rankConfirmationService.saveUpdate(payload).pipe(
                    map((res: any) => { const code = res?.statusCode ?? res?.StatusCode ?? 200; if (code !== 200) throw new Error(res?.description ?? res?.Description ?? 'Update failed'); return res; }),
                    catchError((err) => { this.messageService.add({ severity: 'error', summary: 'Update failed', detail: String(err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Update failed') }); return of(null); })
                );
            saveCalls.push(call);
        }
        const allCalls = [...deleteCalls, ...saveCalls];
        if (allCalls.length === 0) {
            this.messageService.add({ severity: 'info', summary: 'Info', detail: 'No changes to save.' });
            return;
        }
        this.isSaving = true;
        forkJoin(allCalls).subscribe({
            next: (results) => {
                this.isSaving = false;
                const failed = results?.some((r: any) => r == null) ?? false;
                if (failed) return;
                this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Rank confirmation saved successfully.' });
                this.loadDataForEmployee(this.selectedEmployeeId!);
            },
            error: (err) => {
                this.isSaving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: String(err?.error?.description ?? err?.error?.Description ?? err?.message ?? 'Failed to save.') });
            }
        });
    }
}
