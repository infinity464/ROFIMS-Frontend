import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CommonCode } from '../models/common-code';
import { Observable } from 'rxjs';
import { PagedResponse } from '@/Core/Models/Pagination';
import { OrganizationModel } from '../../organization-setup/models/organization';
import { BankModel } from '../models/bank';
import { BankBranchModel } from '../models/bank-branch';
import { TrainingInstituteModel } from '../models/training-institution';
import { RabIdSerialModel } from '../models/rab-id-serial';
import { NoteSheetTemplateModel } from '../models/notesheet-template';

@Injectable({
    providedIn: 'root'
})
export class MasterBasicSetupService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/CommonCode`;
    private apiUrlBank = `${environment.apis.core}/Bank`;
    private apiUrlBankBranch = `${environment.apis.core}/BankBranch`;
    private apiUrlTraining = `${environment.apis.core}/TrainingInstitute`;
    private apiUrlRabIdSerial = `${environment.apis.core}/RabIdSerial`;
    private apiUrlNoteSheetTemplate = `${environment.apis.core}/NoteSheetTemplate`;

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
    updateBank(model: BankModel): Observable<any> {
        return this.http.put(`${this.apiUrlBank}/UpdateAsyn`, model);
    }

    // DELETE: delete bank
    deleteBank(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrlBank}/DeleteAsyn/${id}`);
    }

    // BankBranch

    getAllBankBranch(): Observable<BankBranchModel[]> {
        return this.http.get<BankBranchModel[]>(`${this.apiUrlBankBranch}/GetAll`);
    }

    createBankBranch(model: BankBranchModel): Observable<any> {
        return this.http.post(`${this.apiUrlBankBranch}/SaveAsyn`, model);
    }

    updateBankBranch(model: BankBranchModel): Observable<any> {
        return this.http.put(`${this.apiUrlBankBranch}/UpdateAsyn`, model);
    }

    deleteBankBranch(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrlBankBranch}/DeleteAsyn/${id}`);
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

    // RabIdSerial CRUD

    // GET: all RabIdSerial
    getAllRabIdSerial(): Observable<RabIdSerialModel[]> {
        return this.http.get<RabIdSerialModel[]>(`${this.apiUrlRabIdSerial}/GetAll`);
    }

    // GET: RabIdSerial by id
    getRabIdSerialById(id: number): Observable<RabIdSerialModel> {
        return this.http.get<RabIdSerialModel>(`${this.apiUrlRabIdSerial}/GetFilteredByKeysAsyn/${id}`);
    }

    // POST: create RabIdSerial
    createRabIdSerial(model: RabIdSerialModel): Observable<any> {
        return this.http.post(`${this.apiUrlRabIdSerial}/SaveAsyn`, model);
    }

    // POST: update RabIdSerial
    updateRabIdSerial(model: RabIdSerialModel): Observable<any> {
        return this.http.post(`${this.apiUrlRabIdSerial}/UpdateAsyn`, model);
    }

    // DELETE: delete RabIdSerial
    deleteRabIdSerial(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrlRabIdSerial}/DeleteAsyn/${id}`);
    }

    getNoteSheetTemplates(): Observable<NoteSheetTemplateModel[]> {
        return this.http.get<NoteSheetTemplateModel[]>(`${this.apiUrlNoteSheetTemplate}/GetAll`);
    }
    getNoteSheetTemplateById(id: number): Observable<NoteSheetTemplateModel[]> {
        return this.http.get<NoteSheetTemplateModel[]>(`${this.apiUrlNoteSheetTemplate}/GetFilteredByKeysAsyn/${id}`);
    }
    createNoteSheetTemplate(model: NoteSheetTemplateModel): Observable<any> {
        return this.http.post(`${this.apiUrlNoteSheetTemplate}/SaveAsyn`, model);
    }
    updateNoteSheetTemplate(model: NoteSheetTemplateModel): Observable<any> {
        return this.http.put(`${this.apiUrlNoteSheetTemplate}/UpdateAsyn`, model);
    }
    deleteNoteSheetTemplate(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrlNoteSheetTemplate}/DeleteAsyn/${id}`);
    }
}
