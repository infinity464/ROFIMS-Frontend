import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

/** Row from vw_AddressInfoByEmployee. API: AddressInfo/ViewByEmployeeId/{employeeId} */
export interface AddressInfoByEmployeeView {
    employeeID: number;
    ser: number;
    locationType: string | null;
    locationCode: string | null;
    postCode: string | null;
    addressAreaEN: string | null;
    addressAreaBN: string | null;
    divisionTypeId?: number | null;
    division: string | null;
    divisionBN?: string | null;
    districtTypeId?: number | null;
    district: string | null;
    districtBN?: string | null;
    thanTypeId?: number | null;
    thana: string | null;
    thanaBN?: string | null;
    postOfficeTypeId?: number | null;
    postOffice: string | null;
    postOfficeBN?: string | null;
    houseRoad: string | null;
    active: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class AddressInfoService {
    private apiUrl = `${environment.apis.core}/AddressInfo`;

    constructor(private http: HttpClient) {}

    /** Gets list from vw_AddressInfoByEmployee by employee ID (for profile display). */
    getViewByEmployeeId(employeeId: number): Observable<AddressInfoByEmployeeView[]> {
        return this.http
            .get<AddressInfoByEmployeeView[]>(`${this.apiUrl}/GetViewByEmployeeId/${employeeId}`)
            .pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }
}
