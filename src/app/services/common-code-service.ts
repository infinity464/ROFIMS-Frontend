import { environment } from '@/Core/Environments/environment';
import { CommonCodeModel } from '@/models/common-code-model';
import { MotherOrganizationModel } from '@/models/mother-org-model';
import { HttpClient } from '@angular/common/http';
import { inject, Inject } from '@angular/core';
import { Observable } from 'rxjs';

@Inject({
    providerIn: 'root'
})
export class CommonCodeService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/CommonCode`;

    getAllActiveMotherOrgs(): Observable<MotherOrganizationModel[]> {
        return this.http.get<MotherOrganizationModel[]>(`${environment.apis.core}/MotherOrg/GetAllActiveMotherOrgs`);
    }

    getAllActiveCommonCodesByOrgIdAndType(orgId: number, codeType: string): Observable<CommonCodeModel[]> {
        return this.http.get<CommonCodeModel[]>(`${this.apiUrl}/GetActiveByOrgIdAndTypeAsyn/${orgId}/${codeType}`);
    }

    getAllActiveCommonCodesType(codeType: string): Observable<CommonCodeModel[]> {
        return this.http.get<CommonCodeModel[]>(`${this.apiUrl}/GetActiveCommonCodeByTypeName/${codeType}`);
    }
}
