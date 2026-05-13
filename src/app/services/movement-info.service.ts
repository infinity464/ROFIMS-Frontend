import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { MovementInfoModel } from '@/models/movement-info.model';

@Injectable({ providedIn: 'root' })
export class MovementInfoService {
    private http = inject(HttpClient);
    private baseUrl = `${environment.apis.core}/MovementInfo`;

    getAll(): Observable<MovementInfoModel[]> {
        return this.http.get<MovementInfoModel[]>(`${this.baseUrl}/GetAll`);
    }

    getById(movementId: number): Observable<MovementInfoModel> {
        return this.http.get<MovementInfoModel>(`${this.baseUrl}/GetFilteredByKeysAsyn/${movementId}`);
    }

    /** Lookup a movement by opaque PublicToken (used by the QR-code URL). */
    getByPublicToken(token: string): Observable<MovementInfoModel | MovementInfoModel[]> {
        return this.http.get<MovementInfoModel | MovementInfoModel[]>(
            `${this.baseUrl}/GetByPublicToken/${encodeURIComponent(token)}`
        );
    }

    save(model: MovementInfoModel): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveAsyn`, model);
    }

    update(model: MovementInfoModel): Observable<any> {
        return this.http.post(`${this.baseUrl}/UpdateAsyn`, model);
    }

    delete(movementId: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/DeleteAsyn/${movementId}`);
    }
}
