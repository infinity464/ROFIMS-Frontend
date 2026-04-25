import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
    OnInit,
    OnChanges,
    SimpleChanges,
    inject,
    DestroyRef
} from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { OrgNode } from '../models/org-node.model';
import { LEVELS } from '../models/org-node.model';
import { OrgService } from '../org.service';
import type { CreateOrgDto, UpdateOrgDto } from '../models/org-node.model';
import { SharedService } from '@/shared/services/shared-service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserMenuService } from '@/services/user-menu.service';

export type FormMode = 'empty' | 'add-unit' | 'add-child' | 'edit';

@Component({
    selector: 'app-org-form',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, ReactiveFormsModule, InputTextModule, InputNumberModule, ButtonModule, SelectModule],
    templateUrl: './org-form.component.html',
    styleUrl: './org-form.component.scss'
})
export class OrgFormComponent implements OnInit, OnChanges {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    private fb = inject(FormBuilder);
    private orgService = inject(OrgService);
    private sharedService = inject(SharedService);
    private destroyRef = inject(DestroyRef);

    @Input() mode: FormMode = 'empty';
    @Input() parentNode: OrgNode | null = null;
    @Input() editNode: OrgNode | null = null;
    @Input() siblingCount = 0;
    /** Path from root to selected node (for breadcrumb) */
    @Input() breadcrumbPath: OrgNode[] = [];
    @Input() submitLabel = 'Save';
    @Input() cancelLabel = 'Exit';
    @Input() hideTitle = false;
    @Output() saved = new EventEmitter<void>();
    @Output() cancelled = new EventEmitter<void>();

    readonly LEVELS = LEVELS;
    form!: FormGroup;
    saving = false;
    formTitle = '';

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.form) return;
        if (changes['mode'] || changes['parentNode'] || changes['editNode'] || changes['siblingCount']) {
            this.applyFormState();
        }
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.buildForm();
        this.applyFormState();
    }

    private applyFormState(): void {
        if (this.mode === 'empty') {
            this.formTitle = '';
            return;
        }
        if (this.mode === 'add-unit') {
            this.formTitle = 'New Unit';
            this.resetForm();
        } else if (this.mode === 'add-child') {
            this.formTitle = 'Add Child';
            this.resetForm();
        } else if (this.mode === 'edit' && this.editNode) {
            this.formTitle = 'Edit';
            this.patchFormForEdit(this.editNode);
        }
    }


    readonly statusOptions = [{ label: 'Active', value: 1 }, { label: 'Inactive', value: 0 }];

    private buildForm(): void {
        this.form = this.fb.group({
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [1],
            orgId: [0],
            commCode: [''],
            displayCodeValueEN: [''],
            displayCodeValueBN: [''],
            sortOrder: [1],
            codeType: [''],
            parentCodeId: [null],
            level: [0]
        });
    }

    resetForm(): void {
        if (!this.form) return;
        const parent = this.parentNode;
        const siblings = this.siblingCount;
        const codeType = this.mode === 'add-unit' ? 'Unit' : this.mode === 'add-child' && parent ? LEVELS[parent.level + 1] : this.editNode?.codeType ?? '';
        const parentCodeId = this.mode === 'add-unit' ? null : (parent?.id ?? this.editNode?.parentId ?? null);
        const level = this.mode === 'add-unit' ? 0 : (parent ? parent.level + 1 : this.editNode?.level ?? 0);
        this.form.reset({
            codeValueEN: '',
            codeValueBN: '',
            status: 1,
            orgId: 0,
            commCode: '',
            displayCodeValueEN: '',
            displayCodeValueBN: '',
            sortOrder: siblings + 1,
            codeType,
            parentCodeId,
            level
        });
    }

    patchFormForEdit(node: OrgNode): void {
        this.form.patchValue({
            codeValueEN: node.nameEN,
            codeValueBN: node.nameBN ?? '',
            status: node.status,
            orgId: node.orgId,
            commCode: node.commCode ?? '',
            displayCodeValueEN: node.displayNameEN ?? '',
            displayCodeValueBN: node.displayNameBN ?? '',
            sortOrder: node.sortOrder,
            codeType: node.codeType,
            parentCodeId: node.parentId,
            level: node.level
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
        const raw = this.form.getRawValue();
        const user = this.sharedService.getCurrentUser();
        const now = this.sharedService.getCurrentDateTime();
        const displayEN = raw.displayCodeValueEN || raw.codeValueEN || null;
        const displayBN = raw.displayCodeValueBN || raw.codeValueBN || null;

        if (this.mode === 'edit' && this.editNode) {
            const dto: UpdateOrgDto = {
                orgId: raw.orgId,
                commCode: raw.commCode,
                codeValueEN: raw.codeValueEN,
                codeValueBN: raw.codeValueBN || null,
                displayCodeValueEN: displayEN,
                displayCodeValueBN: displayBN,
                status: +raw.status,
                parentCodeId: raw.parentCodeId,
                sortOrder: +raw.sortOrder,
                level: raw.level,
                codeType: raw.codeType,
                lastUpdatedBy: user,
                lastupdate: now
            };
            this.saving = true;
            this.orgService.update(this.editNode.id, dto).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
                next: () => {
                    this.saving = false;
                    this.saved.emit();
                },
                error: () => {
                    this.saving = false;
                }
            });
        } else {
            const dto: CreateOrgDto = {
                orgId: raw.orgId,
                commCode: raw.commCode,
                codeValueEN: raw.codeValueEN,
                codeValueBN: raw.codeValueBN || null,
                displayCodeValueEN: displayEN,
                displayCodeValueBN: displayBN,
                status: +raw.status,
                parentCodeId: raw.parentCodeId,
                sortOrder: +raw.sortOrder,
                level: raw.level,
                codeType: raw.codeType,
                createdBy: user,
                createdDate: now,
                lastUpdatedBy: user,
                lastupdate: now
            };
            this.saving = true;
            this.orgService.add(dto).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
                next: () => {
                    this.saving = false;
                    this.saved.emit();
                },
                error: () => {
                    this.saving = false;
                }
            });
        }
    }

    cancel(): void {
        this.cancelled.emit();
    }
}
