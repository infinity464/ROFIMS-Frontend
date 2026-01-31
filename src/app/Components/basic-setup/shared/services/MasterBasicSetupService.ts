import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CommonCode } from '../models/common-code';
import { Observable } from 'rxjs';
import { PagedResponse } from '@/Core/Models/Pagination';
import { OrganizationModel } from '../../organization-setup/models/organization';
import { BankModel } from '../models/bank';
import { TrainingInstituteModel } from '../models/training-institution';

@Injectable({
    providedIn: 'root'
})
export class MasterBasicSetupService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/CommonCode`;
    private apiUrlBank = `${environment.apis.core}/Bank`;
     private apiUrlTraining = `${environment.apis.core}/TrainingInstitute`;

    getAllByType(codeType: string): Observable<CommonCode[]> {
        return this.http.get<CommonCode[]>(`${this.apiUrl}/GetByTypeAsyn/${codeType}`);
    }
    getByParentId(parentCodeId: number): Observable<CommonCode[]> {
        return this.http.get<CommonCode[]>(`${this.apiUrl}/GetByParentIdAsyn/${parentCodeId}`);
    }

    getAncestorsOfCommonCode(codeId: number): Observable<CommonCode[]> {
        return this.http.get<CommonCode[]>(`${this.apiUrl}/GetParentalInfoAsyn/${codeId}`);
    }

    getAllActiveMotherOrgs(): Observable<OrganizationModel[]> {
        return this.http.get<OrganizationModel[]>(`${environment.apis.core}/MotherOrg/GetAllActiveMotherOrgs`);
    }

    getAllActiveCommonCodesByOrgIdAndType(orgId: number, codeType: string): Observable<CommonCode[]> {
        return this.http.get<CommonCode[]>(`${this.apiUrl}/GetActiveByOrgIdAndTypeAsyn/${orgId}/${codeType}`);
    }

    getAllWithPaging(codeType: string, pageNumber: number, pageSize: number): Observable<PagedResponse<CommonCode>> {
        return this.http.get<PagedResponse<CommonCode>>(`${this.apiUrl}/GetPaginatedOnConditionAsyn/${codeType}?page_no=${pageNumber}&row_per_page=${pageSize}`);
    }

    getByKeyordWithPaging(codeType: string, keyword: string, pageNumber: number, pageSize: number): Observable<PagedResponse<CommonCode>> {
        return this.http.get<PagedResponse<CommonCode>>(`${this.apiUrl}/GetPaginatedOnSearchAsyn/${codeType}?searchValue=${keyword}&page_no=${pageNumber}&row_per_page=${pageSize}`);
    }

    create(data: CommonCode): Observable<CommonCode> {
        return this.http.post<CommonCode>(`${this.apiUrl}/SaveAsyn`, data);
    }

    update(data: CommonCode): Observable<CommonCode> {
        return this.http.put<CommonCode>(`${this.apiUrl}/UpdateAsyn`, data);
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}/DeleteAsyn/${id}`);
    }

    // Bank

    // GET: all banks
    getAllBank(): Observable<BankModel[]> {
        return this.http.get<BankModel[]>(`${this.apiUrlBank}/GetAll`);
    }

    // GET: bank by id
    getBankById(id: number): Observable<BankModel> {
        return this.http.get<BankModel>(`${this.apiUrlBank}/GetById/${id}`);
    }

    // POST: create bank
    createBank(model: BankModel): Observable<any> {
        return this.http.post(`${this.apiUrlBank}/SaveAsyn`, model);
    }

    // PUT: update bank
    updateBank( model: BankModel): Observable<any> {
        return this.http.put(`${this.apiUrlBank}/UpdateAsyn`, model);
    }

    // DELETE: delete bank
    deleteBank(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrlBank}/DeleteAsyn/${id}`);
    }


  // GET: all training institutes
  getAllInstitute(): Observable<TrainingInstituteModel[]> {
    return this.http.get<TrainingInstituteModel[]>(`${this.apiUrlTraining}/GetAll`);
  }

  // POST: create
  createInstitute(model: TrainingInstituteModel): Observable<any> {
    return this.http.post(`${this.apiUrlTraining}/SaveAsyn`, model);
  }

  // PUT: update
  updateInstitute(model: TrainingInstituteModel): Observable<any> {
    return this.http.put(`${this.apiUrlTraining}/UpdateAsyn`, model);
  }

  // DELETE: delete
  deleteInstitute(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrlTraining}/DeleteAsyn/${id}`);
  }
}
