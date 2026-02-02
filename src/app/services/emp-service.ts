import { Injectable } from '@angular/core';
import { environment } from '@/Core/Environments/environment';
import { Observable, forkJoin, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { switchMap, map, catchError, tap } from 'rxjs/operators';
import { from } from 'rxjs';
import { concatMap, toArray } from 'rxjs/operators';
import { AddressInfoModel, EmpModel } from '@/models/EmpModel';

// Pagination interfaces
export interface PaginationParams {
    pageNumber: number;
    pageSize: number;
    sortField?: string;
    sortOrder?: number; // 1 = asc, -1 = desc
    searchText?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    totalRecords: number;
    pageNumber: number;
    pageSize: number;
}

@Injectable({
    providedIn: 'root'
})
export class EmpService {
    private empApi = `${environment.apis.core}`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<EmpModel[]> {
        return this.http.get<EmpModel[]>(`${this.empApi}/EmployeeInfo/GetAll`);
    }

    // Server-side pagination
    getPaginated(params: PaginationParams): Observable<PaginatedResponse<any>> {
        return this.http.post<PaginatedResponse<any>>(`${this.empApi}/EmployeeInfo/GetPaginated`, params);
    }

    getEmployeeById(employeeId: number): Observable<EmpModel> {
        return this.http.get<EmpModel[]>(`${this.empApi}/EmployeeInfo/GetFilteredByKeysAsyn/${employeeId}`).pipe(
            map(data => data[0]) // API returns array, get first element
        );
    }

    searchEmployees(criteria: { motherOrganization?: number; serviceId?: string; nidNo?: string }): Observable<EmpModel[]> {
        return this.http.post<EmpModel[]>(`${this.empApi}/EmployeeInfo/Search`, criteria);
    }

    // Search by RAB ID or Service ID
    searchByRabIdOrServiceId(rabId?: string, serviceId?: string): Observable<EmpModel | null> {
        const params: any = {};
        if (rabId) params.rabId = rabId;
        if (serviceId) params.serviceId = serviceId;

        return this.http.get<EmpModel[]>(`${this.empApi}/EmployeeInfo/SearchByIdAsyn`, { params }).pipe(
            map(data => data && data.length > 0 ? data[0] : null)
        );
    }

    saveEmployee(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/EmployeeInfo/SaveAsyn`, payload);
    }

    updateEmployee(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/EmployeeInfo/UpdateAsyn`, payload);
    }

    deleteEmployee(employeeId: number): Observable<any> {
        return this.http.delete(`${this.empApi}/EmployeeInfo/Delete/${employeeId}`);
    }

    getAddressesByEmployeeId(employeeId: number): Observable<any[]> {
        // Use dedicated API endpoint to get addresses by employee ID
        return this.http.get<any[]>(`${this.empApi}/AddressInfo/GetByEmployeeId/${employeeId}`);
    }

    saveAddress(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/AddressInfo/SaveAsyn`, payload);
    }

    updateAddress(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/AddressInfo/UpdateAsyn`, payload);
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

    updateCompleteProfile(employeePayload: any, addressPayload: any[]): Observable<any> {
        return forkJoin({
            employee: this.updateEmployee(employeePayload),
            addresses: forkJoin(addressPayload.map(addr => this.updateAddress(addr)))
        });
    }

    generateRabId(prefix: string, serviceId: string): string {
        return `${prefix}-${serviceId}`;
    }

    // PersonalInfo API methods
    savePersonalInfo(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/PersonalInfo/SaveAsyn`, payload);
    }

    updatePersonalInfo(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/PersonalInfo/UpdateAsyn`, payload);
    }

    getPersonalInfoByEmployeeId(employeeId: number): Observable<any> {
        return this.http.get<any[]>(`${this.empApi}/PersonalInfo/GetFilteredByKeysAsyn/${employeeId}`).pipe(
            map(data => data && data.length > 0 ? data[0] : null)
        );
    }

    // Get active addresses by employee ID (only Present and Permanent, not Wife addresses)
    getActiveAddressesByEmployeeId(employeeId: number): Observable<any[]> {
        return this.http.get<any[]>(`${this.empApi}/AddressInfo/GetByEmployeeId/${employeeId}`).pipe(
            map(addresses => {
                // Filter only active addresses and exclude wife addresses
                return addresses.filter(addr => {
                    const locationType = (addr.locationType || addr.LocationType || '').toLowerCase();
                    const isActive = addr.active !== false && addr.Active !== false;
                    const isNotWifeAddress = !locationType.includes('wife');
                    return isActive && isNotWifeAddress;
                });
            })
        );
    }

    // Deactivate an address (set Active = false)
    deactivateAddress(addressId: number): Observable<any> {
        return this.http.post(`${this.empApi}/AddressInfo/Deactivate/${addressId}`, {});
    }

    // Additional Remarks API methods
    getAdditionalRemarksByEmployeeId(employeeId: number): Observable<any[]> {
        return this.http.get<any>(`${this.empApi}/AdditionalRemarksInfo/GetByEmployeeId/${employeeId}`).pipe(
            tap(data => console.log('Raw API response:', data, 'Type:', typeof data, 'IsArray:', Array.isArray(data))),
            map(data => {
                // Handle IQueryable response - it might come as an object with array properties
                if (Array.isArray(data)) {
                    console.log('Data is array, returning as-is');
                    return data;
                }
                // If response is an object, check for common array properties
                if (data && typeof data === 'object') {
                    console.log('Data is object, checking properties:', Object.keys(data));
                    // Try common property names
                    if (Array.isArray(data.value)) {
                        console.log('Found data.value array');
                        return data.value;
                    }
                    if (Array.isArray(data.data)) {
                        console.log('Found data.data array');
                        return data.data;
                    }
                    if (Array.isArray(data.items)) {
                        console.log('Found data.items array');
                        return data.items;
                    }
                    // If it's a single object with ID, wrap in array
                    if (data.additionalRemarksId || data.AdditionalRemarksId) {
                        console.log('Single object found, wrapping in array');
                        return [data];
                    }
                    // Check if object has enumerable properties that might be the array
                    const entries = Object.entries(data);
                    if (entries.length > 0) {
                        console.log('Object entries:', entries);
                        // Check if any value is an array
                        for (const [key, value] of entries) {
                            if (Array.isArray(value)) {
                                console.log(`Found array in property: ${key}`);
                                return value;
                            }
                        }
                    }
                }
                console.log('No array found, returning empty array');
                return [];
            }),
            catchError(error => {
                console.error('Error fetching additional remarks:', error);
                return of([]);
            })
        );
    }

    saveAdditionalRemarks(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/AdditionalRemarksInfo/SaveAsyn`, payload);
    }

    updateAdditionalRemarks(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/AdditionalRemarksInfo/UpdateAsyn`, payload);
    }

    saveUpdateAdditionalRemarks(payload: any): Observable<any> {
        return this.http.post(`${this.empApi}/AdditionalRemarksInfo/SaveUpdateAsyn`, payload);
    }

    deleteAdditionalRemarks(additionalRemarksId: number): Observable<any> {
        return this.http.delete(`${this.empApi}/AdditionalRemarksInfo/DeleteAsyn/${additionalRemarksId}`);
    }
}
