import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { NoteSheetType } from '@/models/enums';
import {
    DraftPostingList,
    DraftPostingMasterDto,
    DraftPostingMasterWithDetailsDto,
    DraftPostingEmployeeRow,
    DraftInterPostingMasterDto,
    DraftInterPostingMasterWithDetailsDto,
    PostingNoteSheet,
    PostingNoteSheetMember,
    PostingMemberRow,
    PendingJoiningItem,
    PostingReceiveViewDto,
    PendingPostingJoiningDto,
    PostingOrderMasterDto,
    PostingOrderMasterWithDetailsDto,
    PostingOrderEmployeeRow,
    ApprovedNoteSheetItem,
    PostingType,
    PostingNoteSheetStatus,
    PostingMemberRemovalHistoryDto,
    EmployeeRemovalInfo,
    CancelledInterPostingInfo,
    EmployeePostingProcessingStatusDto
} from '@/models/posting.model';

/** Status for action button: None | PostingInProcess | NoteSheetInProcess */
export type PostingFlowStatus = 'None' | 'PostingInProcess' | 'NoteSheetInProcess';

const API = `${environment.apis.core}/Posting`;

@Injectable({ providedIn: 'root' })
export class PostingService {
    private readonly draftNewLists$ = new BehaviorSubject<DraftPostingList[]>([]);
    private readonly draftInterLists$ = new BehaviorSubject<DraftPostingList[]>([]);
    private readonly noteSheets$ = new BehaviorSubject<PostingNoteSheet[]>([]);
    private readonly pendingJoining$ = new BehaviorSubject<PendingJoiningItem[]>([]);
    private flowStatusCache$ = new BehaviorSubject<Map<number, PostingFlowStatus>>(new Map());

    constructor(private http: HttpClient) {}

    /** Fetch and cache posting flow status for employee IDs. Call when supernumerary list loads. */
    refreshEmployeePostingFlowStatus(employeeIds: number[], type: PostingType): Observable<Map<number, PostingFlowStatus>> {
        if (!employeeIds?.length)
            return new Observable((s) => {
                s.next(new Map());
                s.complete();
            });
        return this.http
            .post<{ employeeId: number; status: string }[]>(`${API}/GetEmployeePostingFlowStatus`, {
                employeeIds,
                postingType: type
            })
            .pipe(
                map((list) => {
                    const m = new Map<number, PostingFlowStatus>();
                    (list ?? []).forEach((x) => m.set(x.employeeId, (x.status as PostingFlowStatus) || 'None'));
                    return m;
                }),
                tap((m) => this.flowStatusCache$.next(m))
            );
    }

    /** Get cached flow status for an employee. Call refreshEmployeePostingFlowStatus first. */
    getEmployeePostingFlowStatus(employeeId: number): PostingFlowStatus {
        return this.flowStatusCache$.value.get(employeeId) ?? 'None';
    }

    isEmployeeInPostingFlow(employeeId: number, type: PostingType): boolean {
        const s = this.getEmployeePostingFlowStatus(employeeId);
        return s === 'PostingInProcess' || s === 'NoteSheetInProcess';
    }

    /** Label for action column: "Posting in Process" | "Note Sheet in Process" | null (show button) */
    getActionLabel(employeeId: number): string | null {
        const s = this.flowStatusCache$.value.get(employeeId);
        if (s === 'PostingInProcess') return 'Posting in Process';
        if (s === 'NoteSheetInProcess') return 'Note Sheet in Process';
        return null;
    }

    // ---------- Draft New Posting List (API) ----------
    getDraftNewPostingLists(): Observable<DraftPostingList[]> {
        return this.http.get<any[]>(`${API}/GetDraftNewPostingLists`).pipe(
            map((list) =>
                (list ?? []).map((l) => ({
                    id: String(l.id),
                    listNo: l.listNo,
                    listDate: l.listDate,
                    postingType: 'New' as PostingType,
                    members: (l.members ?? []).map((m: any) => ({
                        employeeId: m.employeeId,
                        serviceId: m.serviceId,
                        rabID: m.rabId,
                        fullNameEN: m.fullNameEN,
                        rankName: m.rankName,
                        corpsName: m.corpsName,
                        tradeName: m.tradeName,
                        motherUnitName: m.motherUnitName,
                        joiningDate: m.joiningDate
                    })),
                    createdBy: l.createdBy ?? '',
                    createdDate: l.createdDate ?? ''
                }))
            ),
            tap((lists) => this.draftNewLists$.next(lists))
        );
    }

    getDraftNewPostingListsSnapshot(): DraftPostingList[] {
        return this.draftNewLists$.value;
    }

    /** Add employees to an existing Draft Posting list (New or Inter). Employees must have IsSendingNotesheetStatus = 'draft'. */
    addDraftPostingDetail(
        draftPostingMasterId: number,
        isInterPosting: boolean,
        employeeIds: number[],
        createdBy: string,
        transferRabUnitId?: number | null,
        remarks?: string | null
    ): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/AddDraftPostingDetail`, {
            draftPostingMasterId,
            isInterPosting,
            employeeIds,
            createdBy,
            transferRabUnitId: transferRabUnitId ?? null,
            remarks: remarks?.trim() || null
        });
    }

    /** Save Draft New Posting: creates master + details, sets IsSendingNotesheetStatus to draftPosting for selected employees. */
    saveDraftNewPosting(draftPostingNo: string, draftPostingDate: string, employeeIds: number[], createdBy: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/SaveDraftNewPosting`, {
            draftPostingNo,
            draftPostingDate,
            employeeIds,
            createdBy
        });
    }

    /** List Draft New Posting masters (for Add Draft New Posting page). */
    getDraftNewPostingMasters(): Observable<DraftPostingMasterDto[]> {
        return this.http.get<DraftPostingMasterDto[]>(`${API}/GetDraftNewPostingMasters`);
    }

    /** Get single Draft New Posting by id with details (for Edit). */
    getDraftNewPostingById(id: number): Observable<DraftPostingMasterWithDetailsDto> {
        return this.http.get<DraftPostingMasterWithDetailsDto>(`${API}/GetDraftNewPostingById/${id}`);
    }

    /** Get employees in a Draft Posting list from vw_DraftPostingWithEmployees view. */
    getDraftPostingEmployees(draftPostingMasterId: number): Observable<DraftPostingEmployeeRow[]> {
        return this.http.get<DraftPostingEmployeeRow[]>(`${API}/GetDraftPostingEmployees/${draftPostingMasterId}`);
    }

    /** Update TransferRabUnitId and Remarks on DraftPostingDetail rows. */
    updateDraftPostingDetails(items: { id: number; transferRabUnitId: number | null; remarks: string | null }[]): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/UpdateDraftPostingDetails`, { items });
    }

    /** Remove employees from a draft posting list and revert to supernumerary.
     *  Pass notesheet context so removal history is logged accurately. */
    removeDraftPostingDetails(
        draftPostingMasterId: number,
        detailIds: number[],
        isInterPosting: boolean,
        noteSheetId?: number | null,
        noteSheetNo?: string | null,
        removedFromStep?: string | null
    ): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/RemoveDraftPostingDetails`, {
            draftPostingMasterId,
            detailIds,
            isInterPosting,
            noteSheetId: noteSheetId ?? null,
            noteSheetNo: noteSheetNo ?? null,
            removedFromStep: removedFromStep ?? null
        });
    }

    /** Get the removal history log for a draft posting list. */
    getPostingMemberRemovalHistory(draftPostingMasterId: number, isInterPosting: boolean): Observable<PostingMemberRemovalHistoryDto[]> {
        return this.http.get<PostingMemberRemovalHistoryDto[]>(
            `${API}/GetPostingMemberRemovalHistory?draftPostingMasterId=${draftPostingMasterId}&isInterPosting=${isInterPosting}`
        );
    }

    /** Get the latest removal history for a list of employee IDs (across all postings). */
    getRemovalHistoryByEmployeeIds(employeeIds: number[]): Observable<EmployeeRemovalInfo[]> {
        return this.http.post<EmployeeRemovalInfo[]>(
            `${API}/GetRemovalHistoryByEmployeeIds`, employeeIds
        );
    }

    /** Get the most recent cancelled posting (joining cancelled) per employee, by posting type. */
    getLastCancelledInterPostingByEmployeeIds(employeeIds: number[], postingType: string = NoteSheetType.InterPosting): Observable<CancelledInterPostingInfo[]> {
        return this.http.post<CancelledInterPostingInfo[]>(
            `${API}/GetLastCancelledInterPostingByEmployeeIds?postingType=${encodeURIComponent(postingType)}`, employeeIds
        );
    }

    /** Update Draft New Posting master (DraftPostingNo, DraftPostingDate, DraftPostingStatus). */
    updateDraftNewPosting(id: number, draftPostingNo: string, draftPostingDate: string, draftPostingStatus: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/UpdateDraftNewPosting`, {
            id,
            draftPostingNo,
            draftPostingDate,
            draftPostingStatus
        });
    }

    /** Update PostingStatus on EmployeeInfo for multiple employees (e.g. after final approval). */
    updateEmployeesPostingStatus(employeeIds: number[], postingStatus: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${environment.apis.core}/EmployeeInfo/UpdatePostingStatus`, {
            employeeIds,
            postingStatus
        });
    }

    addToDraftNewPostingList(members: PostingMemberRow[], createdBy: string): Observable<{ id: number; listNo: string }> {
        const body = {
            members: members.map((m) => ({
                employeeId: m.employeeId,
                serviceId: m.serviceId ?? null,
                rabId: m.rabID ?? null,
                fullNameEN: m.fullNameEN ?? null,
                rankName: m.rankName ?? null,
                corpsName: m.corpsName ?? null,
                tradeName: m.tradeName ?? null,
                motherUnitName: m.motherUnitName ?? null,
                joiningDate: m.joiningDate ?? null,
                relieverServiceId: m.relieverServiceId ?? null
            })),
            createdBy
        };
        return this.http.post<any>(`${API}/AddToDraftNewPostingList`, body).pipe(
            map((r) => (r?.data ? { id: r.data.id, listNo: r.data.listNo } : { id: 0, listNo: '' })),
            tap(() => this.getDraftNewPostingLists().subscribe())
        );
    }

    // ---------- Draft Inter Posting List (in-memory fallback; add API later) ----------
    getDraftInterPostingLists(): Observable<DraftPostingList[]> {
        return this.draftInterLists$.asObservable();
    }

    getDraftInterPostingListsSnapshot(): DraftPostingList[] {
        return this.draftInterLists$.value;
    }

    addToDraftInterPostingList(members: PostingMemberRow[], createdBy: string): DraftPostingList {
        const listNo = `IP-${Date.now()}`;
        const listDate = new Date().toISOString().slice(0, 10);
        const list: DraftPostingList = {
            id: `draft-inter-${Date.now()}`,
            listNo,
            listDate,
            postingType: 'Inter',
            members: [...members],
            createdBy,
            createdDate: new Date().toISOString()
        };
        this.draftInterLists$.next([...this.draftInterLists$.value, list]);
        return list;
    }

    // ---------- Posting Note-Sheet: Create from Draft List (API) ----------
    createPostingNoteSheetFromDraftList(
        draftListId: string,
        postingType: PostingType,
        createdBy: string
    ): Observable<PostingNoteSheet | null> {
        const id = parseInt(draftListId, 10);
        if (isNaN(id)) return new Observable((s) => (s.next(null), s.complete()));

        return this.http
            .post<any>(`${API}/CreateDraftNewPostingNoteSheet`, {
                draftListId: id,
                postingType,
                createdBy
            })
            .pipe(
                map((r) => {
                    if (r?.statusCode !== 200 || !r?.data) return null;
                    const d = r.data;
                    return {
                        id: String(d.id),
                        postingType,
                        draftListId: d.draftPostingListId ? String(d.draftPostingListId) : null,
                        noteSheetNo: d.noteSheetNo ?? '',
                        noteSheetDate: d.noteSheetDate ?? new Date().toISOString().slice(0, 10),
                        referenceNumber: null,
                        subject: '',
                        mainText: '',
                        textType: 'en' as const,
                        preparedBy: createdBy,
                        initiatorId: null,
                        recommenderIds: [] as number[],
                        finalApproverId: null,
                        filesReferences: [],
                        status: 'Draft' as const,
                        members: (d.members ?? []).map((m: any) => ({
                            employeeId: m.employeeId,
                            serviceId: m.serviceId,
                            fullNameEN: m.fullNameEN,
                            rankName: m.rankName,
                            corpsName: m.corpsName,
                            tradeName: m.tradeName,
                            motherUnitName: m.motherUnitName,
                            rabUnit: m.rabUnit,
                            joiningDate: m.joiningDate,
                            homeDistrictName: m.homeDistrictName,
                            transferUnitId: m.transferUnitId ?? null,
                            transferUnitName: m.transferUnitName ?? null
                        })),
                        createdBy,
                        createdDate: new Date().toISOString()
                    };
                }),
                tap((sheet) => {
                    if (sheet) {
                        this.noteSheets$.next([...this.noteSheets$.value, sheet]);
                        this.getDraftNewPostingLists().subscribe();
                    }
                })
            );
    }

    getPostingNoteSheets(): Observable<PostingNoteSheet[]> {
        return this.http
            .get<any[]>(`${API}/GetDraftNewPostingNoteSheets`, { params: { postingType: 'New' } })
            .pipe(
                map((list) =>
                    (list ?? []).map((l) => ({
                        id: String(l.id),
                        postingType: 'New' as PostingType,
                        draftListId: l.draftPostingListId ? String(l.draftPostingListId) : null,
                        noteSheetNo: l.noteSheetNo,
                        noteSheetDate: l.noteSheetDate,
                        referenceNumber: null,
                        subject: '',
                        mainText: '',
                        textType: 'en' as const,
                        preparedBy: '',
                        initiatorId: null,
                        recommenderIds: [],
                        finalApproverId: null,
                        filesReferences: [],
                        status: (l.status ?? 'Draft') as PostingNoteSheetStatus,
                        members: (l.members ?? []).map((m: any) => ({
                            employeeId: m.employeeId,
                            serviceId: m.serviceId,
                            fullNameEN: m.fullNameEN,
                            rankName: m.rankName,
                            corpsName: m.corpsName,
                            tradeName: m.tradeName,
                            motherUnitName: m.motherUnitName,
                            rabUnit: m.rabUnit,
                            joiningDate: m.joiningDate,
                            homeDistrictName: m.homeDistrictName,
                            transferUnitId: m.transferUnitId ?? null,
                            transferUnitName: m.transferUnitName ?? null
                        })),
                        createdBy: '',
                        createdDate: ''
                    }))
                ),
                tap((sheets) => this.noteSheets$.next(sheets))
            );
    }

    getPostingNoteSheetsSnapshot(type?: PostingType): PostingNoteSheet[] {
        const list = this.noteSheets$.value;
        return type ? list.filter((n) => n.postingType === type) : list;
    }

    getPostingNoteSheetById(id: string): PostingNoteSheet | null {
        return this.noteSheets$.value.find((n) => n.id === id) ?? null;
    }

    updatePostingNoteSheet(
        id: string,
        patch: Partial<Pick<PostingNoteSheet, 'subject' | 'mainText' | 'referenceNumber' | 'noteSheetDate' | 'textType' | 'initiatorId' | 'recommenderIds' | 'finalApproverId' | 'filesReferences' | 'members'>>
    ): void {
        const list = this.noteSheets$.value.map((n) => (n.id === id ? { ...n, ...patch } : n));
        this.noteSheets$.next(list);
    }

    submitForFinalized(id: string): void {
        this.updateNoteSheetStatus(id, 'PendingFinalized');
    }

    finalizeWithUnits(id: string, memberUnitMap: Record<number, number>): void {
        const sheet = this.getPostingNoteSheetById(id);
        if (!sheet) return;
        const members = sheet.members.map((m) => ({
            ...m,
            transferUnitId: memberUnitMap[m.employeeId] ?? m.transferUnitId
        }));
        this.updatePostingNoteSheet(id, { members });
    }

    submitForApproval(id: string): void {
        this.updateNoteSheetStatus(id, 'PendingApproval');
    }

    approvePostingNoteSheet(id: string): void {
        const sheet = this.getPostingNoteSheetById(id);
        if (!sheet) return;
        this.updateNoteSheetStatus(id, 'Approved');
        const orderNo = `PO-${Date.now()}`;
        const items: PendingJoiningItem[] = sheet.members.map((m, idx) => ({
            id: `join-${id}-${m.employeeId}`,
            postingType: sheet.postingType,
            postingNoteSheetId: id,
            orderNo,
            employeeId: m.employeeId,
            serviceId: m.serviceId,
            rabID: null,
            fullNameEN: m.fullNameEN,
            rankName: m.rankName,
            corpsName: m.corpsName,
            tradeName: m.tradeName,
            postingFromUnitId: null,
            postingFromUnitName: sheet.postingType === 'Inter' ? (sheet.members[idx] as any).rabUnit ?? null : null,
            postedToUnitId: m.transferUnitId,
            postedToUnitName: m.transferUnitName ?? null,
            joiningDate: null,
            ccMoArticle47No: null,
            ccMoArticle47FileId: null
        }));
        this.pendingJoining$.next([...this.pendingJoining$.value, ...items]);
    }

    declinePostingNoteSheet(id: string): void {
        this.updateNoteSheetStatus(id, 'Declined');
    }

    private updateNoteSheetStatus(id: string, status: PostingNoteSheetStatus): void {
        const list = this.noteSheets$.value.map((n) => (n.id === id ? { ...n, status } : n));
        this.noteSheets$.next(list);
    }

    // ---------- Pending List for Joining ----------
    getPendingJoiningList(): Observable<PendingJoiningItem[]> {
        return this.pendingJoining$.asObservable();
    }

    getPendingJoiningListSnapshot(type?: PostingType): PendingJoiningItem[] {
        const list = this.pendingJoining$.value.filter((p) => !p.joiningDate);
        return type ? list.filter((p) => p.postingType === type) : list;
    }

    recordJoin(
        itemId: string,
        joiningDate: string,
        ccMoArticle47No: string | null,
        ccMoArticle47FileId: number | null
    ): void {
        const list = this.pendingJoining$.value.map((p) =>
            p.id === itemId
                ? { ...p, joiningDate, ccMoArticle47No, ccMoArticle47FileId }
                : p
        );
        this.pendingJoining$.next(list);
    }

    // ── Draft Inter Posting (API) ──────────────────────────────────

    /** Save Draft Inter Posting: creates master + details, sets IsSendingNotesheetStatus to draftInterPosting. */
    saveDraftInterPosting(draftInterPostingNo: string, draftInterPostingDate: string, employeeIds: number[], createdBy: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/SaveDraftInterPosting`, {
            draftInterPostingNo,
            draftInterPostingDate,
            employeeIds,
            createdBy
        });
    }

    /** List Draft Inter Posting masters. */
    getDraftInterPostingMasters(): Observable<DraftInterPostingMasterDto[]> {
        return this.http.get<DraftInterPostingMasterDto[]>(`${API}/GetDraftInterPostingMasters`);
    }

    /** Get single Draft Inter Posting by id with details (for Edit). */
    getDraftInterPostingById(id: number): Observable<DraftInterPostingMasterWithDetailsDto> {
        return this.http.get<DraftInterPostingMasterWithDetailsDto>(`${API}/GetDraftInterPostingById/${id}`);
    }

    /** Update Draft Inter Posting master. */
    updateDraftInterPosting(id: number, draftInterPostingNo: string, draftInterPostingDate: string, draftInterPostingStatus: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/UpdateDraftInterPosting`, {
            id,
            draftInterPostingNo,
            draftInterPostingDate,
            draftInterPostingStatus
        });
    }

    /** Update TransferRabUnitId and Remarks on DraftInterPostingDetail rows. */
    updateDraftInterPostingDetails(items: { id: number; transferRabUnitId: number | null; remarks: string | null }[]): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/UpdateDraftInterPostingDetails`, { items });
    }

    /** Get employees in a Draft Inter Posting from vw_DraftInterPostingWithEmployees view. */
    getDraftInterPostingEmployees(draftInterPostingMasterId: number): Observable<any[]> {
        return this.http.get<any[]>(`${API}/GetDraftInterPostingEmployees/${draftInterPostingMasterId}`);
    }

    // ── Posting Receive ─────────────────────────────────────────────

    getApprovedPostingOrders(): Observable<PostingReceiveViewDto[]> {
        return this.http.get<PostingReceiveViewDto[]>(`${API}/GetApprovedPostingOrders`);
    }

    getPendingPostingReceive(draftPostingMasterId?: number, postingOrderMasterId?: number): Observable<PostingReceiveViewDto[]> {
        const params: any = {};
        if (draftPostingMasterId != null) params.draftPostingMasterId = draftPostingMasterId;
        if (postingOrderMasterId != null) params.postingOrderMasterId = postingOrderMasterId;
        return this.http.get<PostingReceiveViewDto[]>(`${API}/GetPendingPostingReceive`, { params });
    }

    getPostingReceiveHistory(draftPostingMasterId?: number, postingOrderMasterId?: number): Observable<PostingReceiveViewDto[]> {
        const params: any = {};
        if (draftPostingMasterId != null) params.draftPostingMasterId = draftPostingMasterId;
        if (postingOrderMasterId != null) params.postingOrderMasterId = postingOrderMasterId;
        return this.http.get<PostingReceiveViewDto[]>(`${API}/GetPostingReceiveHistory`, { params });
    }

    /** "Pending List for Joining — New Posting": employees whose posting order is generated but who haven't joined yet.
     *  Pass onlyCancelled = true to fetch the cancelled-joinings list instead. */
    getPendingPostingJoining(postingType?: string, onlyCancelled = false): Observable<PendingPostingJoiningDto[]> {
        const params: Record<string, string> = {};
        if (postingType) params['postingType'] = postingType;
        if (onlyCancelled) params['onlyCancelled'] = 'true';
        return this.http.get<PendingPostingJoiningDto[]>(`${API}/GetPendingPostingJoining`, { params });
    }

    /** Server-side paginated cancelled joinings (JoinStatus = Cancel) for the collapsible section. */
    getCancelledPostingJoiningPaged(
        postingType: string,
        pageNo: number,
        rowPerPage: number
    ): Observable<{ datalist: PendingPostingJoiningDto[]; pages: { Rows: number; TotalPages: number } }> {
        return this.http.post<{ datalist: PendingPostingJoiningDto[]; pages: { Rows: number; TotalPages: number } }>(
            `${API}/GetCancelledPostingJoiningPaginated`,
            { postingType, pagination: { page_no: pageNo, row_per_page: rowPerPage } }
        );
    }

    receivePostingMembers(
        items: { postingReceiveId: number; joiningDate: string; remarks: string | null }[],
        receivedBy: string
    ): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/ReceivePostingMembers`, {
            items,
            receivedBy
        });
    }

    // ── Posting Order ─────────────────────────────────────────────

    private readonly NOTESHEET_API = `${environment.apis.core}/NoteSheetInfo`;

    /** Get approved notesheets filtered by type (NewPosting / InterPosting),
     *  excluding those that already have a generated Posting Order. */
    getApprovedNoteSheetsByType(noteSheetType: string): Observable<ApprovedNoteSheetItem[]> {
        return this.http.get<ApprovedNoteSheetItem[]>(
            `${API}/GetApprovedNoteSheetsForPostingOrder`,
            { params: { noteSheetType } }
        );
    }

    /** Get notesheet employees (from DraftPostingDetail via DraftPostingMasterId). */
    getNoteSheetEmployees(noteSheetId: number): Observable<PostingOrderMasterWithDetailsDto | null> {
        return this.http.get<any>(`${this.NOTESHEET_API}/GetFilteredByKeysAsyn/${noteSheetId}`).pipe(
            map((data) => {
                const ns = Array.isArray(data) ? data[0] : data;
                return ns ?? null;
            })
        );
    }

    /** List all posting orders. */
    getPostingOrderMasters(): Observable<PostingOrderMasterDto[]> {
        return this.http.get<PostingOrderMasterDto[]>(`${API}/GetPostingOrderMasters`);
    }

    /** Get single posting order by id with details. */
    getPostingOrderById(id: number): Observable<PostingOrderMasterWithDetailsDto> {
        return this.http.get<PostingOrderMasterWithDetailsDto>(`${API}/GetPostingOrderById/${id}`);
    }

    /** Get posting order employees with full details from vw_PostingOrderWithEmployees. */
    getPostingOrderEmployees(id: number): Observable<PostingOrderEmployeeRow[]> {
        return this.http.get<PostingOrderEmployeeRow[]>(`${API}/GetPostingOrderEmployees/${id}`);
    }

    /** Create a new posting order. */
    createPostingOrder(body: {
        postingOrderNo: string;
        postingOrderDate: string;
        postingType: string;
        noteSheetId: number;
        refPostingOrderMasterId?: number | null;
        referenceNumber?: string | null;
        subject?: string | null;
        mainText?: string | null;
        subText?: string | null;
        textType?: string | null;
        filesReferences?: string | null;
        remarks?: string | null;
        footerText?: string | null;
        employeeIds: number[];
        createdBy: string;
        postingOrderNumberConfigId?: number | null;
        approvalEmployeeId?: number | null;
    }): Observable<{ statusCode: number; description: string; data?: any }> {
        return this.http.post<{ statusCode: number; description: string; data?: any }>(`${API}/CreatePostingOrder`, body);
    }

    /** Approve a posting order. */
    approvePostingOrder(id: number, approvalNote: string, approvedBy: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/ApprovePostingOrder`, { id, approvalNote, approvedBy });
    }

    /** Cancel a posting order. */
    cancelPostingOrder(id: number, cancelReason: string, cancelledBy: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/CancelPostingOrder`, { id, cancelReason, cancelledBy });
    }

    /** Cancel a single member's joining on an approved posting order (sets JoinStatus = Cancel). */
    cancelPostingJoining(postingOrderMasterId: number, employeeId: number, cancelledBy: string, remarks: string | null = null): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/CancelPostingJoining`, { postingOrderMasterId, employeeId, cancelledBy, remarks });
    }

    /** Get employees for approval person dropdown. */
    getApprovalEmployees(): Observable<{ value: number; label: string }[]> {
        return this.http.get<{ value: number; label: string }[]>(`${API}/GetApprovalEmployees`);
    }

    /** Add a single employee directly to an existing Posting Order (immediate DB persist). */
    addPostingOrderEmployee(
        postingOrderMasterId: number,
        employeeId: number,
        transferRabUnitId: number | null,
        addedBy: string,
        draftPostingMasterId: number | null = null,
        postingType: string | null = null,
        remarks: string | null = null
    ): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/AddPostingOrderEmployee`, {
            postingOrderMasterId,
            employeeId,
            transferRabUnitId: transferRabUnitId ?? null,
            addedBy,
            draftPostingMasterId: draftPostingMasterId ?? null,
            postingType: postingType ?? null,
            remarks: remarks?.trim() || null
        });
    }

    /** Remove a single employee from an existing Posting Order (immediate DB persist + history). */
    removePostingOrderEmployee(
        postingOrderMasterId: number,
        employeeId: number,
        removedBy: string,
        draftPostingMasterId: number | null = null,
        postingType: string | null = null
    ): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/RemovePostingOrderEmployee`, {
            postingOrderMasterId,
            employeeId,
            removedBy,
            draftPostingMasterId: draftPostingMasterId ?? null,
            postingType: postingType ?? null
        });
    }

    /** Update an existing posting order. */
    updatePostingOrder(body: {
        id: number;
        postingOrderNo: string;
        postingOrderDate: string;
        postingType: string;
        refPostingOrderMasterId?: number | null;
        referenceNumber?: string | null;
        subject?: string | null;
        mainText?: string | null;
        subText?: string | null;
        textType?: string | null;
        filesReferences?: string | null;
        status?: string | null;
        remarks?: string | null;
        footerText?: string | null;
        employeeIds: number[];
        updatedBy: string;
        approvalEmployeeId?: number | null;
    }): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/UpdatePostingOrder`, body);
    }

    /** Set TransferRabUnitId on a draft detail row by DraftPostingMasterId + EmployeeId. */
    setDraftDetailTransferUnit(draftPostingMasterId: number, isInterPosting: boolean, employeeId: number, transferRabUnitId: number | null): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/SetDraftDetailTransferUnit`, {
            draftPostingMasterId,
            isInterPosting,
            employeeId,
            transferRabUnitId
        });
    }

    /** Get detailed posting processing status (New + Inter) for a single employee. */
    getEmployeePostingProcessingStatus(employeeId: number): Observable<EmployeePostingProcessingStatusDto> {
        return this.http.get<EmployeePostingProcessingStatusDto>(`${API}/GetEmployeePostingProcessingStatus/${employeeId}`);
    }
}
