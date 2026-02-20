import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import {
    DraftPostingList,
    PostingNoteSheet,
    PostingNoteSheetMember,
    PostingMemberRow,
    PendingJoiningItem,
    PostingType,
    PostingNoteSheetStatus
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
}
