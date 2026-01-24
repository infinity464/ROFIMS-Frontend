import { Injectable } from '@angular/core';
import { environment } from '@/Core/Environments/environment';
import { EmployeeInfoModel } from '../model/employeeinfo.model';
import { AddressInfoModel } from '../../Shared/address-section/model/address-info.model';
import { Observable, forkJoin } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { switchMap, map } from 'rxjs/operators';
@Injectable({
    providedIn: 'root'
})
export class EmployeeinfoService {
    private empApi = `${environment.apis.core}`;
    
    constructor(private http: HttpClient) {}

    
    getAll(): Observable<EmployeeInfoModel[]> {
        return this.http.get<EmployeeInfoModel[]>(`${this.empApi}/EmployeeInfo/GetAll`);
    }

    
    getEmployeeById(employeeId: number): Observable<EmployeeInfoModel> {
        return this.http.get<EmployeeInfoModel>(`${this.empApi}/EmployeeInfo/GetById/${employeeId}`);
    }

    
    searchEmployees(criteria: {
        motherOrganization?: number;
        serviceId?: string;
        nidNo?: string;
    }): Observable<EmployeeInfoModel[]> {
        return this.http.post<EmployeeInfoModel[]>(`${this.empApi}/EmployeeInfo/Search`, criteria);
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

    saveAddress(payload: any[]): Observable<any> {
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

    /**
     * Save complete profile (employee + addresses)
     */
    saveCompleteProfile(employeePayload: any, addressPayload: any[]): Observable<any> {
  return this.saveEmployee(employeePayload).pipe(
    switchMap((employeeRes: any) => {
      const employeeID =
        employeeRes?.employeeID ??
        employeeRes?.EmployeeID ??
        employeeRes?.data?.employeeID ??
        employeeRes?.data?.EmployeeID;

      if (!employeeID) {
        throw new Error('EmployeeID not returned from server');
      }

      const updatedAddressPayload = addressPayload.map(addr => ({
        ...addr,
        EmployeeID: employeeID
      }));

      return this.saveAddress(updatedAddressPayload).pipe(
        map(addressRes => ({
          employee: employeeRes,
          addresses: addressRes,
          employeeID
        }))
      );
    })
  );
}

    /**
     * Update complete profile (employee + addresses)
     */
    updateCompleteProfile(employeeId: number, employeePayload: any, addressPayload: any[]): Observable<any> {
        return forkJoin({
            employee: this.updateEmployee(employeeId, employeePayload),
            addresses: this.saveAddress(addressPayload) // This will handle updates based on AddressId
        });
    }

    /**
     * Generate RAB ID
     */
    generateRabId(prefix: string, serviceId: string): string {
        return `${prefix}-${serviceId}`;
    }
}