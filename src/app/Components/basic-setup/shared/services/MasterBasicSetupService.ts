import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CommonCode } from '../models/common-code';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { PagedResponse } from '@/Core/Models/Pagination';
import { OrganizationModel } from '../../organization-setup/models/organization';
import { BankModel } from '../models/bank';
import { BankBranchModel } from '../models/bank-branch';
import { TrainingInstituteModel } from '../models/training-institution';
import { RabIdSerialModel } from '../models/rab-id-serial';
import { EquivalentRankModel } from '../models/equivalent-rank';
import { MotherOrgRankVacancyDistributionModel } from '../models/mother-org-rank-vacancy';

import { NoteSheetTemplateModel } from '../models/notesheet-template';
import { NoteSheetNumberConfigModel } from '../models/notesheet-number-config';
import { NoteSheetApproverConfigModel } from '../models/notesheet-approver-config';
import { RABUnitAORModel, ResultViewModel } from '../models/rab-unit-aor';
import { PostingOrderNumberConfigModel } from '../models/posting-order-number-config';

export interface AuthorizedCountItem {
    codeId: number;
    authorizedCount: number;
}


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
    private apiUrlRankEquivalent = `${environment.apis.core}/RankEquivalent`;
    private apiUrlMotherOrgRankVacancyDistribution = `${environment.apis.core}/MotherOrgRankVacancyDistribution`;
    private apiUrlNoteSheetTemplate = `${environment.apis.core}/NoteSheetTemplate`;
    private apiUrlNoteSheetNumberConfig = `${environment.apis.core}/NoteSheetNumberConfig`;
    private apiUrlNoteSheetApproverConfig = `${environment.apis.core}/NoteSheetApproverConfig`;
    private apiUrlRABUnitAOR = `${environment.apis.core}/RABUnitAOR`;
    private apiUrlPostingOrderNumberConfig = `${environment.apis.core}/PostingOrderNumberConfig`;


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

    // RankEquivalent
    getAllRankEquivalents(): Observable<EquivalentRankModel[]> {
        return this.http.get<EquivalentRankModel[]>(`${this.apiUrlRankEquivalent}/GetAll`);
    }

    getRankEquivalentByKeys(equivalentNameID: number, motherOrgRankId: number): Observable<EquivalentRankModel[]> {
        return this.http.get<EquivalentRankModel[]>(`${this.apiUrlRankEquivalent}/GetFilteredByKeysAsyn/${equivalentNameID}/${motherOrgRankId}`);
    }

    saveRankEquivalent(model: EquivalentRankModel): Observable<{ statusCode: number; description?: string }> {
        return this.http.post<{ statusCode: number; description?: string }>(`${this.apiUrlRankEquivalent}/SaveAsyn`, model);
    }

    updateRankEquivalent(model: EquivalentRankModel): Observable<{ statusCode: number; description?: string }> {
        return this.http.post<{ statusCode: number; description?: string }>(`${this.apiUrlRankEquivalent}/UpdateAsyn`, model);
    }

    deleteRankEquivalent(equivalentNameID: number, motherOrgRankId: number): Observable<{ statusCode: number; description?: string }> {
        return this.http.delete<{ statusCode: number; description?: string }>(`${this.apiUrlRankEquivalent}/DeleteAsyn/${equivalentNameID}/${motherOrgRankId}`);
    }

    // MotherOrgRankVacancyDistribution
    getMotherOrgRankVacancyDistributionByVacancy(orgId: number, motherOrgRankId: number): Observable<MotherOrgRankVacancyDistributionModel[]> {
        return this.http.get<MotherOrgRankVacancyDistributionModel[]>(`${this.apiUrlMotherOrgRankVacancyDistribution}/GetByVacancy/${orgId}/${motherOrgRankId}`);
    }
    saveMotherOrgRankVacancyDistribution(model: MotherOrgRankVacancyDistributionModel): Observable<{ statusCode: number; description?: string }> {
        return this.http.post<{ statusCode: number; description?: string }>(`${this.apiUrlMotherOrgRankVacancyDistribution}/Save`, model);
    }
    updateMotherOrgRankVacancyDistribution(model: MotherOrgRankVacancyDistributionModel): Observable<{ statusCode: number; description?: string }> {
        return this.http.put<{ statusCode: number; description?: string }>(`${this.apiUrlMotherOrgRankVacancyDistribution}/Update`, model);
    }
    deleteMotherOrgRankVacancyDistribution(id: number): Observable<{ statusCode: number; description?: string }> {
        return this.http.delete<{ statusCode: number; description?: string }>(`${this.apiUrlMotherOrgRankVacancyDistribution}/Delete/${id}`);
    }

    getAuthorizedOrganogramCounts(): Observable<AuthorizedCountItem[]> {
        const rabOrgTypes = new Set([
            'RabUnit', 'RABUNIT', 'RabWing', 'RABWING',
            'RabBranch', 'RABBRANCH', 'RabSubBranch', 'RABSUBBRANCH',
            'RabSection', 'RABSECTION', 'RabSubSection', 'RABSUBSECTION'
        ]);

        return forkJoin({
            distributions: this.http.get<MotherOrgRankVacancyDistributionModel[]>(`${this.apiUrlMotherOrgRankVacancyDistribution}/GetAll`),
            allCodes: this.http.get<CommonCode[]>(`${this.apiUrl}/GetAll`)
        }).pipe(
            map(({ distributions, allCodes }) => {
                // Build parent lookup from full org hierarchy
                const parentByCodeId = new Map<number, number | null>();
                for (const n of allCodes) {
                    if (rabOrgTypes.has(n.codeType)) {
                        parentByCodeId.set(n.codeId, n.parentCodeId ?? null);
                    }
                }

                // Direct counts per leaf node
                const directCounts = new Map<number, number>();
                for (const d of distributions) {
                    if (d.rabCodeId && d.quantity) {
                        directCounts.set(d.rabCodeId, (directCounts.get(d.rabCodeId) || 0) + d.quantity);
                    }
                }

                // Rollup: walk up parent chain for each direct count
                const rollup = new Map<number, number>();
                directCounts.forEach((cnt, codeId) => {
                    let cur: number | null | undefined = codeId;
                    let guard = 0;
                    while (cur != null && guard++ < 500) {
                        rollup.set(cur, (rollup.get(cur) || 0) + cnt);
                        const parent = parentByCodeId.get(cur);
                        if (parent === undefined) break;
                        cur = parent;
                    }
                });

                const result: AuthorizedCountItem[] = [];
                rollup.forEach((authorizedCount, codeId) => {
                    result.push({ codeId, authorizedCount });
                });
                return result;
            })
        );
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

    // NoteSheetNumberConfig CRUD

    getAllNoteSheetNumberConfig(): Observable<NoteSheetNumberConfigModel[]> {
        return this.http.get<NoteSheetNumberConfigModel[]>(`${this.apiUrlNoteSheetNumberConfig}/GetAll`);
    }

    getNoteSheetNumberConfigById(id: number): Observable<NoteSheetNumberConfigModel> {
        return this.http.get<NoteSheetNumberConfigModel>(`${this.apiUrlNoteSheetNumberConfig}/GetFilteredByKeysAsyn/${id}`);
    }

    createNoteSheetNumberConfig(model: NoteSheetNumberConfigModel): Observable<any> {
        return this.http.post(`${this.apiUrlNoteSheetNumberConfig}/SaveAsyn`, model);
    }

    updateNoteSheetNumberConfig(model: NoteSheetNumberConfigModel): Observable<any> {
        return this.http.post(`${this.apiUrlNoteSheetNumberConfig}/UpdateAsyn`, model);
    }

    deleteNoteSheetNumberConfig(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrlNoteSheetNumberConfig}/DeleteAsyn/${id}`);
    }

    // NoteSheetApproverConfig CRUD

    getAllNoteSheetApproverConfig(): Observable<NoteSheetApproverConfigModel[]> {
        return this.http.get<NoteSheetApproverConfigModel[]>(`${this.apiUrlNoteSheetApproverConfig}/GetAll`);
    }

    getNoteSheetApproverConfigById(id: number): Observable<NoteSheetApproverConfigModel> {
        return this.http.get<NoteSheetApproverConfigModel>(`${this.apiUrlNoteSheetApproverConfig}/GetFilteredByKeysAsyn/${id}`);
    }

    getNoteSheetApproverConfigByType(noteSheetType: string): Observable<NoteSheetApproverConfigModel[]> {
        return this.http.get<NoteSheetApproverConfigModel[]>(`${this.apiUrlNoteSheetApproverConfig}/GetByNoteSheetType/${noteSheetType}`);
    }

    createNoteSheetApproverConfig(model: NoteSheetApproverConfigModel): Observable<any> {
        return this.http.post(`${this.apiUrlNoteSheetApproverConfig}/SaveAsyn`, model);
    }

    updateNoteSheetApproverConfig(model: NoteSheetApproverConfigModel): Observable<any> {
        return this.http.post(`${this.apiUrlNoteSheetApproverConfig}/UpdateAsyn`, model);
    }

    deleteNoteSheetApproverConfig(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrlNoteSheetApproverConfig}/DeleteAsyn/${id}`);
    }

    getRABUnitAORByUpazila(upazilaId: number): Observable<RABUnitAORModel[]> {
        return this.http.get<RABUnitAORModel[]>(`${this.apiUrlRABUnitAOR}/GetByUpazila/${upazilaId}`);
    }

    getRABUnitAORByRabUnit(rabUnitId: number): Observable<RABUnitAORModel[]> {
        return this.http.get<RABUnitAORModel[]>(`${this.apiUrlRABUnitAOR}/GetByRabUnit/${rabUnitId}`);
    }

    saveRABUnitAOR(model: RABUnitAORModel): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrlRABUnitAOR}/SaveAsyn`, model);
    }

    updateRABUnitAOR(model: RABUnitAORModel): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrlRABUnitAOR}/UpdateAsyn`, model);
    }

    deleteRABUnitAOR(aorId: number): Observable<ResultViewModel> {
        return this.http.delete<ResultViewModel>(`${this.apiUrlRABUnitAOR}/DeleteAsyn/${aorId}`);
    }

    // PostingOrderNumberConfig CRUD

    getAllPostingOrderNumberConfig(): Observable<PostingOrderNumberConfigModel[]> {
        return this.http.get<PostingOrderNumberConfigModel[]>(`${this.apiUrlPostingOrderNumberConfig}/GetAll`);
    }

    getPostingOrderNumberConfigById(id: number): Observable<PostingOrderNumberConfigModel> {
        return this.http.get<PostingOrderNumberConfigModel>(`${this.apiUrlPostingOrderNumberConfig}/GetFilteredByKeysAsyn/${id}`);
    }

    createPostingOrderNumberConfig(model: PostingOrderNumberConfigModel): Observable<any> {
        return this.http.post(`${this.apiUrlPostingOrderNumberConfig}/SaveAsyn`, model);
    }

    updatePostingOrderNumberConfig(model: PostingOrderNumberConfigModel): Observable<any> {
        return this.http.post(`${this.apiUrlPostingOrderNumberConfig}/UpdateAsyn`, model);
    }

    deletePostingOrderNumberConfig(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrlPostingOrderNumberConfig}/DeleteAsyn/${id}`);
    }
}
