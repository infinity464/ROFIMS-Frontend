import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { ButtonModule } from 'primeng/button';
import { RabIdSerialModel } from '../shared/models/rab-id-serial';
import { CommonCode } from '../shared/models/common-code';
import { MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { InputText } from 'primeng/inputtext';
import { InputNumber } from 'primeng/inputnumber';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { Select } from 'primeng/select';

@Component({
    selector: 'app-rab-id-serial',
    imports: [ReactiveFormsModule, TableModule, InputText, InputNumber, Fluid, ButtonModule, IconField, InputIcon, Select],
    templateUrl: './rab-id-serial.html',
    styleUrl: './rab-id-serial.scss'
})
export class RabIdSerial implements OnInit {
    isSubmitting = false;
    rabIdSerialForm!: FormGroup;

    rabIdSerials: RabIdSerialModel[] = [];
    filteredRabIdSerials: RabIdSerialModel[] = [];
    officerTypes: CommonCode[] = [];
    officerTypeOptions: { label: string; value: number }[] = [];

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
        private sharedService: SharedService
    ) {}

    ngOnInit(): void {
        this.currentUser = this.sharedService.getCurrentUser();
        this.initForm();
        this.loadOfficerTypes();
        this.getAll();
    }

    private setupFormFilterListeners() {
        this.rabIdSerialForm.get('officerTypeId')?.valueChanges.subscribe(() => {
            this.first = 0;
            this.buildTableData();
        });
    }

    private buildTableData() {
        let list = [...this.rabIdSerials];
        const officerTypeId = this.rabIdSerialForm?.get('officerTypeId')?.value;
        if (officerTypeId != null) {
            list = list.filter((r) => r.officerTypeId === officerTypeId);
        }
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) {
            list = list.filter((r) => {
                const officerTypeName = this.getOfficerTypeName(r.officerTypeId).toLowerCase();
                return officerTypeName.includes(q) || String(r.minId).includes(q) || String(r.maxId).includes(q);
            });
        }
        this.filteredRabIdSerials = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    initForm() {
        this.rabIdSerialForm = this.fb.group({
            rabIdSerialId: [0],
            officerTypeId: [null],
            minId: [null, [Validators.required, Validators.min(1)]],
            maxId: [null, [Validators.required, Validators.min(1)]],
            currentId: [null],
            createdBy: [this.currentUser],
            createdDate: [new Date().toISOString()],
            lastUpdatedBy: [this.currentUser],
            lastupdate: [new Date().toISOString()]
        });
    }

    loadOfficerTypes() {
        this.masterBasicSetupService.getAllByType('OfficerType').subscribe({
            next: (res: CommonCode[]) => {
                this.officerTypes = res;
                this.officerTypeOptions = res.map((o) => ({
                    label: o.codeValueEN,
                    value: o.codeId
                }));
                this.setupFormFilterListeners();
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load officer types'
                });
            }
        });
    }

    getAll() {
        this.masterBasicSetupService.getAllRabIdSerial().subscribe({
            next: (res: RabIdSerialModel[]) => {
                this.rabIdSerials = res ?? [];
                this.buildTableData();
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to fetch RAB ID Serial data'
                });
            }
        });
    }

    getOfficerTypeName(officerTypeId: number): string {
        const officerType = this.officerTypes.find((o) => o.codeId === officerTypeId);
        return officerType ? officerType.codeValueEN : '-';
    }

    onSearch(event: Event) {
        const target = event.target as HTMLInputElement;
        this.searchValue = (target?.value ?? '').toLowerCase().trim();
        this.first = 0;
        this.buildTableData();
    }

    onSubmit() {
        if (this.isSubmitting) return;

        const officerTypeId = this.rabIdSerialForm.get('officerTypeId')?.value;
        if (officerTypeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Officer Type' });
            return;
        }
        if (this.rabIdSerialForm.invalid) {
            this.rabIdSerialForm.markAllAsTouched();
            return;
        }

        // Validate min <= max
        const minId = this.rabIdSerialForm.value.minId;
        const maxId = this.rabIdSerialForm.value.maxId;
        if (minId > maxId) {
            this.messageService.add({
                severity: 'error',
                summary: 'Validation Error',
                detail: 'Min ID cannot be greater than Max ID'
            });
            return;
        }

        this.create();
    }

    create() {
        this.isSubmitting = true;
        const currentDateTime = this.sharedService.getCurrentDateTime();

        const payload = {
            ...this.rabIdSerialForm.value,
            currentId: this.rabIdSerialForm.value.minId, // Set currentId to minId on create
            createdBy: this.currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: this.currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.createRabIdSerial(payload).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'RAB ID Serial created successfully'
                });
                this.onReset();
                this.getAll();
                this.isSubmitting = false;
            },
            error: () => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create RAB ID Serial'
                });
                this.isSubmitting = false;
            }
        });
    }

    isMaxLessThanMin(): boolean {
        const minId = this.rabIdSerialForm.get('minId')?.value;
        const maxId = this.rabIdSerialForm.get('maxId')?.value;
        return minId && maxId && maxId < minId;
    }

    onReset() {
        this.searchValue = '';
        this.rabIdSerialForm.reset({
            rabIdSerialId: 0,
            officerTypeId: null,
            minId: null,
            maxId: null,
            currentId: null,
            createdBy: this.currentUser,
            createdDate: new Date().toISOString(),
            lastUpdatedBy: this.currentUser,
            lastupdate: new Date().toISOString()
        });
        this.buildTableData();
        this.isSubmitting = false;
    }
}
