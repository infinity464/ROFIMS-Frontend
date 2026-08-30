import { Injectable } from '@angular/core';
import { environment } from '@/Core/Environments/environment';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { switchMap, map, catchError, tap, shareReplay } from 'rxjs/operators';
import { from } from 'rxjs';
import { concatMap, toArray } from 'rxjs/operators';
import { AddressInfoModel, EmpModel, EmployeeSearchInfoModel } from '@/models/EmpModel';

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

/** One row from vw_EmployeeDocumentReferences: file reference from PersonalInfo, EmployeeInfo, etc. */
export interface EmployeeDocumentReferenceItem {
    employeeID: number;
    sourceTable: string;
    fileId: number;
    fileName: string;
}

/** One candidate from a face-recognition search. */
export interface FaceCandidate {
    employee_id: number | null;
    confidence: number;
}

/** One row of the face-search history (from GetFaceSearchHistory). */
export interface FaceSearchHistoryItem {
    id: number;
    searchedAt: string;
    isMatched: boolean;
    confidence: number;
    hasImage: boolean;
    matchedEmployeeId: number | null;
    matchedName: string | null;
    matchedRank: string | null;
    matchedServiceId: string | null;
    matchedRabId: string | null;
    searchedByName: string | null;
    searchedByRank: string | null;
    searchedByServiceId: string | null;
}

/** One enrolled face photo's metadata (from GetEnrolledFacePhotos). */
export interface EnrolledFacePhoto {
    photo_id: string;
    quality_score: number;
    source: string;
    created_at: string;
}

/** Result of POST /EmployeeInfo/RecognizeFace. */
export interface FaceRecognizeResult {
    matched: boolean;
    employee_id: number | null;
    confidence: number;
    matched_photo_path?: string | null;
    processing_ms?: number;
    threshold?: number;
    log_id?: string | null;
    candidates: FaceCandidate[];
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
            map((data) => data[0]) // API returns array, get first element
        );
    }

    searchEmployees(criteria: { motherOrganization?: number; serviceId?: string; nidNo?: string }): Observable<EmpModel[]> {
        return this.http.post<EmpModel[]>(`${this.empApi}/EmployeeInfo/Search`, criteria);
    }

    // Search by RAB ID, NID or Service ID. When presentMemberOnly is true, backend returns only if PostingStatus is Servings. Optional motherOrganization filters by OrgId.
    searchByRabIdOrServiceId(rabId?: string, serviceId?: string, presentMemberOnly?: boolean, motherOrganization?: number | null, nid?: string): Observable<EmpModel | null> {
        const params: any = {};
        if (rabId) params.rabId = rabId;
        if (serviceId) params.serviceId = serviceId;
        if (nid) params.nid = nid;
        if (presentMemberOnly === true) params.presentMemberOnly = 'true';
        if (motherOrganization != null && motherOrganization > 0) params.motherOrganization = String(motherOrganization);

        return this.http.get<EmpModel[]>(`${this.empApi}/EmployeeInfo/SearchByIdAsyn`, { params }).pipe(map((data) => (data && data.length > 0 ? data[0] : null)));
    }

    // Same as searchByRabIdOrServiceId but returns the full matching list (e.g. when ServiceId repeats across Mother Org + Prefix combinations).
    // Optional prefix filters by Prefix code id (used for composite uniqueness check); excludeEmployeeId drops one record from the result (useful in edit-mode duplicate checks so the record doesn't match itself).
    searchListByRabIdOrServiceId(
        rabId?: string,
        serviceId?: string,
        presentMemberOnly?: boolean,
        motherOrganization?: number | null,
        nid?: string,
        prefix?: number | null,
        excludeEmployeeId?: number | null
    ): Observable<EmpModel[]> {
        const params: any = {};
        if (rabId) params.rabId = rabId;
        if (serviceId) params.serviceId = serviceId;
        if (nid) params.nid = nid;
        if (presentMemberOnly === true) params.presentMemberOnly = 'true';
        if (motherOrganization != null && motherOrganization > 0) params.motherOrganization = String(motherOrganization);
        if (prefix != null && prefix > 0) params.prefix = String(prefix);
        if (excludeEmployeeId != null && excludeEmployeeId > 0) params.excludeEmployeeId = String(excludeEmployeeId);

        return this.http.get<EmpModel[]>(`${this.empApi}/EmployeeInfo/SearchByIdAsyn`, { params }).pipe(map((data) => data ?? []));
    }

    /**
     * Single-box personnel lookup — matches the term against any unique identifier
     * (RAB ID, Service ID, Service ID Card No, NID / Old NID, Mobile, Office Mobile,
     * Passport, Email). Returns all matches (Service ID can repeat).
     */
    searchByUniqueIdentifier(term: string, presentMemberOnly = false): Observable<EmpModel[]> {
        const params: any = { term };
        if (presentMemberOnly) params.presentMemberOnly = 'true';
        return this.http
            .get<EmpModel[]>(`${this.empApi}/EmployeeInfo/SearchByUniqueIdentifierAsyn`, { params })
            .pipe(map((data) => data ?? []));
    }

    /** Gets display info from vw_EmployeeSearchInfo (Rank, Corps, Trade, MotherOrganization, MemberType). Call after search when employee is found. */
    getEmployeeSearchInfo(employeeId: number): Observable<EmployeeSearchInfoModel | null> {
        return this.http.get<EmployeeSearchInfoModel>(`${this.empApi}/EmployeeInfo/GetEmployeeSearchInfo/${employeeId}`).pipe(
            catchError(() => of(null))
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
            addresses: forkJoin(addressPayload.map((addr) => this.updateAddress(addr)))
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
        return this.http.get<any[]>(`${this.empApi}/PersonalInfo/GetFilteredByKeysAsyn/${employeeId}`).pipe(map((data) => (data && data.length > 0 ? data[0] : null)));
    }

    // Get active addresses by employee ID (only Present and Permanent, not Spouse addresses)
    getActiveAddressesByEmployeeId(employeeId: number): Observable<any[]> {
        return this.http.get<any[]>(`${this.empApi}/AddressInfo/GetByEmployeeId/${employeeId}`).pipe(
            map((addresses) => {
                // Filter only active addresses and exclude wife addresses
                return addresses.filter((addr) => {
                    const locationType = (addr.locationType || addr.LocationType || '').toLowerCase();
                    const isActive = addr.active !== false && addr.Active !== false;
                    const isNotSpouseAddress = !locationType.includes('spouse');
                    return isActive && isNotSpouseAddress;
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
            tap((data) => console.log('Raw API response:', data, 'Type:', typeof data, 'IsArray:', Array.isArray(data))),
            map((data) => {
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
            catchError((error) => {
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

    // Confidential Remarks API methods (same table, IsConfidential = true)
    getConfidentialRemarksByEmployeeId(employeeId: number): Observable<any[]> {
        return this.http.get<any>(`${this.empApi}/AdditionalRemarksInfo/GetConfidentialByEmployeeId/${employeeId}`).pipe(
            map((data) => {
                if (Array.isArray(data)) return data;
                if (data && typeof data === 'object') {
                    if (Array.isArray(data.value)) return data.value;
                    if (Array.isArray(data.data)) return data.data;
                    if (Array.isArray(data.items)) return data.items;
                    if (data.additionalRemarksId || data.AdditionalRemarksId) return [data];
                    for (const value of Object.values(data)) {
                        if (Array.isArray(value)) return value;
                    }
                }
                return [];
            }),
            catchError((error) => {
                console.error('Error fetching confidential remarks:', error);
                return of([]);
            })
        );
    }

    /**
     * Uploads already issued, keyed by the File instance. A file picked once is written to disk once, however
     * many times Save is pressed: a double-click shares the single in-flight request, and a later re-save reuses
     * the FileId instead of writing another copy. Failed uploads drop out of the map so Save can retry them.
     * Weakly keyed, so entries disappear with the File itself.
     */
    private readonly issuedUploads = new WeakMap<File, Observable<{ fileId: number; fileName: string }>>();

    /**
     * Upload a file for employee references. File is stored on server (path from appsettings) and a FileInformation record is created.
     * Returns { fileId, fileName } for FilesReferences JSON.
     *
     * Uploading the same File instance again returns the first upload's result rather than issuing a second request.
     *
     * @param displayName Label kept in FileInformation.FileName — what file lists and downloads show. Defaults to the file's own name.
     * @param owner Owner tag for the on-disk name (`<displayName>_<owner>_<guid>.<ext>`). Build it with buildUploadOwnerTag(); omitting it stores the file under NORABID.
     */
    uploadEmployeeFile(file: File, displayName?: string, owner?: string): Observable<{ fileId: number; fileName: string }> {
        const alreadyIssued = this.issuedUploads.get(file);
        if (alreadyIssued) return alreadyIssued;

        const form = new FormData();
        form.append('file', file);
        if (displayName != null && displayName.trim() !== '') form.append('fileName', displayName.trim());
        if (owner != null && owner.trim() !== '') form.append('owner', owner.trim());

        const upload$ = this.http.post<{ fileId: number; fileName: string }>(`${this.empApi}/FileInformation/Upload`, form).pipe(
            catchError((err) => {
                // Nothing was stored — let the next Save try again.
                this.issuedUploads.delete(file);
                return throwError(() => err);
            }),
            shareReplay({ bufferSize: 1, refCount: false })
        );

        this.issuedUploads.set(file, upload$);
        return upload$;
    }

    /** Download a file by FileID. Returns blob. Use with triggerFileDownload(blob, fileName) to save. */
    downloadFile(fileId: number): Observable<Blob> {
        return this.http.get(`${this.empApi}/FileInformation/Download/${fileId}`, { responseType: 'blob' });
    }

    /** Delete a file by FileID. Removes the physical file and database record from the server. */
    deleteFile(fileId: number): Observable<any> {
        return this.http.delete(`${this.empApi}/FileInformation/Delete/${fileId}`);
    }

    /**
     * Resolve profile-photo FileIDs for a batch of employees in one round trip.
     * Employees without a profile image are simply absent from the response —
     * callers should treat "missing" as "no photo", not "not loaded yet".
     */
    getProfilePhotoRefs(employeeIds: number[]): Observable<{ employeeId: number; fileId: number }[]> {
        return this.http.post<{ employeeId: number; fileId: number }[]>(
            `${this.empApi}/FileInformation/GetProfilePhotoRefs`, employeeIds
        );
    }

    /** Get all document references (file id and file name) for an employee from vw_EmployeeDocumentReferences. */
    getEmployeeDocumentReferences(employeeId: number): Observable<EmployeeDocumentReferenceItem[]> {
        return this.http.get<EmployeeDocumentReferenceItem[]>(`${this.empApi}/FileInformation/GetEmployeeDocumentReferences`, {
            params: { employeeId: String(employeeId) }
        });
    }

    /** Upload signature image for an employee. Accepts a Blob (cropped image). */
    uploadSignature(employeeId: number, file: Blob): Observable<any> {
        const form = new FormData();
        form.append('employeeId', String(employeeId));
        form.append('file', file, 'signature.png');
        return this.http.post(`${this.empApi}/EmployeeInfo/UploadSignature`, form);
    }

    /**
     * Enroll one or more face images for an employee into the Face Recognition
     * service (proxied through the .NET backend). Used for later face search.
     */
    enrollFaces(employeeId: number, files: File[], source: string = 'enrollment'): Observable<any> {
        const form = new FormData();
        form.append('employeeId', String(employeeId));
        files.forEach((f) => form.append('files', f, f.name));
        form.append('source', source);
        return this.http.post(`${this.empApi}/EmployeeInfo/EnrollFaces`, form);
    }

    /** Get the number of face images currently enrolled for an employee. */
    getEnrolledFaceCount(employeeId: number): Observable<{ employeeId: number; photoCount: number }> {
        return this.http.get<{ employeeId: number; photoCount: number }>(
            `${this.empApi}/EmployeeInfo/GetEnrolledFaceCount/${employeeId}`
        );
    }

    /** Remove all enrolled face images (and search vectors) for an employee. */
    deleteEnrolledFaces(employeeId: number): Observable<any> {
        return this.http.delete(`${this.empApi}/EmployeeInfo/DeleteEnrolledFaces/${employeeId}`);
    }

    /** Remove a single enrolled face image (and its search vector). */
    deleteEnrolledFace(employeeId: number, photoId: string): Observable<any> {
        return this.http.delete(`${this.empApi}/EmployeeInfo/DeleteEnrolledFace`, {
            params: { employeeId: String(employeeId), photoId }
        });
    }

    /**
     * Recognize the most prominent face in an image against enrolled employees.
     * Returns { matched, employee_id, confidence, candidates, ... }.
     */
    recognizeFace(file: File, sourceType: string = 'portal'): Observable<FaceRecognizeResult> {
        const form = new FormData();
        form.append('file', file, file.name);
        form.append('sourceType', sourceType);
        return this.http.post<FaceRecognizeResult>(`${this.empApi}/EmployeeInfo/RecognizeFace`, form);
    }

    /** Check whether the Face Recognition service is online. */
    getFaceServiceHealth(): Observable<{ online: boolean }> {
        return this.http.get<{ online: boolean }>(`${this.empApi}/EmployeeInfo/FaceServiceHealth`);
    }

    /** List enrolled face photos (metadata) for an employee. */
    getEnrolledFacePhotos(employeeId: number): Observable<EnrolledFacePhoto[]> {
        return this.http.get<EnrolledFacePhoto[]>(
            `${this.empApi}/EmployeeInfo/GetEnrolledFacePhotos/${employeeId}`
        );
    }

    /** Fetch a single enrolled face image as a Blob (auth header via interceptor). */
    getEnrolledFaceImageBlob(employeeId: number, photoId: string): Observable<Blob> {
        return this.http.get(`${this.empApi}/EmployeeInfo/GetEnrolledFaceImage`, {
            params: { employeeId: String(employeeId), photoId },
            responseType: 'blob'
        });
    }

    /** Paginated global face-search history. */
    getFaceSearchHistory(pageNo: number, rowPerPage: number): Observable<{ datalist: FaceSearchHistoryItem[]; pages: { rows: number; totalPages: number }; retentionDays: number }> {
        return this.http.get<{ datalist: FaceSearchHistoryItem[]; pages: { rows: number; totalPages: number }; retentionDays: number }>(
            `${this.empApi}/EmployeeInfo/GetFaceSearchHistory`,
            { params: { page_no: String(pageNo), row_per_page: String(rowPerPage) } }
        );
    }

    /** The query image for a single history row, as a Blob. */
    getFaceSearchImageBlob(id: number): Observable<Blob> {
        return this.http.get(`${this.empApi}/EmployeeInfo/GetFaceSearchImage/${id}`, { responseType: 'blob' });
    }

    /** Get signature image URL for an employee. Returns the API URL string (not an Observable). */
    getSignatureUrl(employeeId: number): string {
        return `${this.empApi}/EmployeeInfo/GetSignature/${employeeId}`;
    }

    /** Get signature image as a Blob (uses HttpClient with auth headers). */
    getSignatureBlob(employeeId: number): Observable<Blob> {
        return this.http.get(`${this.empApi}/EmployeeInfo/GetSignature/${employeeId}`, { responseType: 'blob' });
    }

    /** Trigger browser download of a blob with the given file name. */
    triggerFileDownload(blob: Blob, fileName: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'download';
        a.click();
        // Revoke after a short delay so the browser can start the download before the URL is invalidated
        setTimeout(() => URL.revokeObjectURL(url), 500);
    }
}
