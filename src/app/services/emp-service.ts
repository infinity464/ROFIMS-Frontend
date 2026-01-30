import { Injectable } from '@angular/core';
import { environment } from '@/Core/Environments/environment';
import { Observable, forkJoin } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { switchMap, map } from 'rxjs/operators';
import { from } from 'rxjs';
import { concatMap, toArray } from 'rxjs/operators';
import { AddressInfoModel, EmpModel } from '@/models/EmpModel';
@Injectable({
    providedIn: 'root'
})
export class EmpService {
    private empApi = `${environment.apis.core}`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<EmpModel[]> {
        return this.http.get<EmpModel[]>(`${this.empApi}/EmployeeInfo/GetAll`);
    }

    getEmployeeById(employeeId: number): Observable<EmpModel> {
        return this.http.get<EmpModel>(`${this.empApi}/EmployeeInfo/GetById/${employeeId}`);
    }

    searchEmployees(criteria: { motherOrganization?: number; serviceId?: string; nidNo?: string }): Observable<EmpModel[]> {
        return this.http.post<EmpModel[]>(`${this.empApi}/EmployeeInfo/Search`, criteria);
    }

    saveEmployee(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/EmployeeInfo/SaveAsyn`, payload);
    }

    updateEmployee(employeeId: number, payload: any): Observable<any> {
        return this.http.put(`${this.empApi}/EmployeeInfo/Update/${employeeId}`, payload);
    }

    deleteEmployee(employeeId: number): Observable<any> {
        return this.http.delete(`${this.empApi}/EmployeeInfo/Delete/${employeeId}`);
    }

    getAddressesByEmployeeId(employeeId: number): Observable<AddressInfoModel[]> {
        return this.http.get<AddressInfoModel[]>(`${this.empApi}/AddressInfo/GetByEmployeeId/${employeeId}`);
    }

    saveAddress(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/AddressInfo/SaveAsyn`, payload);
    }

    updateAddress(addressId: number, payload: any): Observable<any> {
        return this.http.put(`${this.empApi}/AddressInfo/Update/${addressId}`, payload);
    }

    deleteAddress(addressId: number): Observable<any> {
        return this.http.delete(`${this.empApi}/AddressInfo/Delete/${addressId}`);
    }

    getCompleteProfile(employeeId: number): Observable<any> {
        return forkJoin({
            employee: this.getEmployeeById(employeeId),
            addresses: this.getAddressesByEmployeeId(employeeId)
        });
    }

    saveCompleteProfile(employeePayload: any, addressPayload: any[]): Observable<any> {
        const employeeID = employeePayload.EmployeeID; // 102 fixed

        return this.saveEmployee(employeePayload).pipe(
            switchMap(() => {
                const updatedAddressPayload = addressPayload.map((addr) => ({
                    ...addr,
                    EmployeeID: employeeID
                }));

                return from(updatedAddressPayload).pipe(
                    concatMap((addr) => this.saveAddress(addr)),
                    toArray(),
                    map((addressResponses) => ({
                        employeeID,
                        addresses: addressResponses
                    }))
                );
            })
        );
    }

    updateCompleteProfile(employeeId: number, employeePayload: any, addressPayload: any[]): Observable<any> {
        return forkJoin({
            employee: this.updateEmployee(employeeId, employeePayload),
            addresses: this.saveAddress(addressPayload) // This will handle updates based on AddressId
        });
    }

    generateRabId(prefix: string, serviceId: string): string {
        return `${prefix}-${serviceId}`;
    }
}
