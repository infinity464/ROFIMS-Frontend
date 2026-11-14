import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EmpService } from './emp-service';
import { UserMenuService } from './user-menu.service';

/** Provided per profile, so sensitive state is never shared between employees/pages. */
@Injectable()
export class ProfileSensitiveInfoService {
    private readonly menus = inject(UserMenuService);
    private readonly employees = inject(EmpService);
    private generation = 0;
    canSpecialView = false;
    remarks: { additionalRemarks: string }[] = [];
    loading = false;
    error = false;

    clear(): void {
        this.generation++;
        this.canSpecialView = false;
        this.remarks = [];
        this.loading = false;
        this.error = false;
    }

    async refresh(employeeId: number): Promise<void> {
        this.clear();
        const generation = this.generation;
        this.loading = true;
        try {
            const permission = await firstValueFrom(this.menus.getMyProfilePermissions());
            if (generation !== this.generation) return;
            this.canSpecialView = permission.canSpecialView === true;
            if (this.canSpecialView) {
                const records = await firstValueFrom(this.employees.getConfidentialRemarksByEmployeeId(employeeId));
                if (generation !== this.generation) return;
                this.remarks = records.map(row => ({ additionalRemarks: row.additionalRemarks ?? row.AdditionalRemarks ?? '' }));
            }
        } catch (error: any) {
            if (generation !== this.generation) return;
            this.remarks = [];
            if (error?.status === 403 || error?.status === 401) this.canSpecialView = false;
            this.error = true;
        } finally {
            if (generation === this.generation) this.loading = false;
        }
    }
}
