import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/Core/Environments/environment';
import { CommonCodeService } from '@/services/common-code-service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';

/**
 * Shared lookup cache for the leave-application list-style components (my-applications,
 * apply-for-other, action-taken-by-me, history). Loads each lookup at most once per app
 * session and exposes already-resolved getters for rendering. A single instance is shared
 * across the app via `providedIn: 'root'`.
 */
@Injectable({ providedIn: 'root' })
export class LeaveListLookupsService {
    private http = inject(HttpClient);
    private commonCodeService = inject(CommonCodeService);
    private masterBasicSetup = inject(MasterBasicSetupService);

    employeeName: Record<number, string> = {};
    employeeServiceId: Record<number, string> = {};
    employeeRabId: Record<number, string> = {};
    employeeUnitId: Record<number, number> = {};
    employeeAppointmentId: Record<number, number> = {};
    employeePrefixId: Record<number, number> = {};
    employeeRankId: Record<number, number> = {};
    employeeProfQualId: Record<number, number> = {};
    unitName: Record<number, string> = {};
    appointmentName: Record<number, string> = {};
    prefixName: Record<number, string> = {};
    rankName: Record<number, string> = {};
    profQualName: Record<number, string> = {};
    leaveTypeName: Record<number, string> = {};
    leaveTypeOptions: { label: string; value: number }[] = [];

    private loaded = {
        employees: false,
        personal: false,
        leaveTypes: false,
        units: false,
        appointments: false,
        prefixes: false,
        ranks: false,
        profQuals: false
    };

    /** Triggers all lookups in parallel; safe to call multiple times — each is loaded only once. */
    loadAll(): void {
        if (!this.loaded.employees) { this.loaded.employees = true; this.loadEmployees(); }
        if (!this.loaded.personal) { this.loaded.personal = true; this.loadPersonalInfo(); }
        if (!this.loaded.leaveTypes) { this.loaded.leaveTypes = true; this.loadLeaveTypes(); }
        if (!this.loaded.units) { this.loaded.units = true; this.loadUnits(); }
        if (!this.loaded.appointments) { this.loaded.appointments = true; this.loadAppointments(); }
        if (!this.loaded.prefixes) { this.loaded.prefixes = true; this.loadPrefixes(); }
        if (!this.loaded.ranks) { this.loaded.ranks = true; this.loadRanks(); }
        if (!this.loaded.profQuals) { this.loaded.profQuals = true; this.loadProfQuals(); }
    }

    /** Composed display string: "{prefix}-{serviceId} {rank} {name}, {profQual}". */
    getApplicantName(empId: number | null | undefined): string {
        if (empId == null) return '-';
        const name = this.employeeName[empId];
        if (name == null) return String(empId);
        const prefix = this.prefixName[this.employeePrefixId[empId]];
        const rank = this.rankName[this.employeeRankId[empId]];
        const profQual = this.profQualName[this.employeeProfQualId[empId]];
        const serviceId = this.employeeServiceId[empId];
        const idPart = prefix && serviceId ? `${prefix}-${serviceId}` : (serviceId ?? '');
        const left = [idPart, rank, name].filter((p) => !!p).join(' ');
        return profQual ? `${left}, ${profQual}` : left;
    }

    getApplicantRabId(empId: number | null | undefined): string {
        if (empId == null) return '-';
        return this.employeeRabId[empId] ?? '-';
    }

    getApplicantServiceId(empId: number | null | undefined): string {
        if (empId == null) return '-';
        return this.employeeServiceId[empId] ?? '-';
    }

    getLeaveTypeName(leaveTypeId: number | null | undefined): string {
        if (leaveTypeId == null) return '-';
        return this.leaveTypeName[leaveTypeId] ?? String(leaveTypeId);
    }

    private loadEmployees(): void {
        this.http.get<any[]>(`${environment.apis.core}/EmployeeInfo/GetAll`).subscribe({
            next: (list) => {
                (Array.isArray(list) ? list : []).forEach((e: any) => {
                    const id = e.employeeID ?? e.EmployeeID;
                    if (id == null) return;
                    this.employeeName[id] = e.fullNameEN ?? e.FullNameEN ?? String(id);
                    const sid = e.serviceId ?? e.ServiceId ?? null;
                    if (sid) this.employeeServiceId[id] = String(sid);
                    const rab = e.rabid ?? e.RABID ?? e.Rabid ?? null;
                    if (rab) this.employeeRabId[id] = String(rab);
                    const unit = e.motherOrganization ?? e.MotherOrganization ?? null;
                    if (unit != null) this.employeeUnitId[id] = Number(unit);
                    const appt = e.appointment ?? e.Appointment ?? null;
                    if (appt != null) this.employeeAppointmentId[id] = Number(appt);
                    const prefix = e.prefix ?? e.Prefix ?? null;
                    if (prefix != null) this.employeePrefixId[id] = Number(prefix);
                    const rank = e.rank ?? e.Rank ?? null;
                    if (rank != null) this.employeeRankId[id] = Number(rank);
                });
            }
        });
    }

    private loadPersonalInfo(): void {
        this.http.get<any[]>(`${environment.apis.core}/PersonalInfo/GetAll`).subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((p: any) => {
                const id = p.employeeID ?? p.EmployeeID;
                const pq = p.professionalQualification ?? p.ProfessionalQualification ?? null;
                if (id != null && pq != null) this.employeeProfQualId[id] = Number(pq);
            }),
            error: () => {}
        });
    }

    private loadLeaveTypes(): void {
        this.masterBasicSetup.getAllByType('LeaveType').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id == null) return;
                const name = c.codeValueEN ?? c.CodeValueEN ?? String(id);
                this.leaveTypeName[id] = name;
                this.leaveTypeOptions.push({ label: name, value: id });
            })
        });
    }

    private loadUnits(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((o: any) => {
                const id = o.orgId ?? o.OrgId;
                if (id != null) this.unitName[id] = o.orgNameEN ?? o.OrgNameEN ?? String(id);
            })
        });
    }

    private loadAppointments(): void {
        this.commonCodeService.getAllActiveCommonCodesType('AppointmentCategory').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.appointmentName[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }

    private loadPrefixes(): void {
        this.masterBasicSetup.getAllByType('Prefix').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.prefixName[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }

    private loadRanks(): void {
        this.masterBasicSetup.getAllByType('MotherOrgRank').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.rankName[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }

    private loadProfQuals(): void {
        this.commonCodeService.getAllActiveCommonCodesType('ProfessionalQualification').subscribe({
            next: (list) => (Array.isArray(list) ? list : []).forEach((c: any) => {
                const id = c.codeId ?? c.CodeId;
                if (id != null) this.profQualName[id] = c.codeValueEN ?? c.CodeValueEN ?? String(id);
            })
        });
    }
}
