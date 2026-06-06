import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { EmpService, FaceRecognizeResult } from '@/services/emp-service';

interface MatchedEmployee {
    employeeID: number;
    fullNameEN: string;
    fullNameBN?: string;
    rabid: string;
    serviceId: string;
    rankDisplay?: string;
    corpsDisplay?: string;
    tradeDisplay?: string;
    motherOrganizationDisplay?: string;
    profileImageUrl?: string | null;
}

@Component({
    selector: 'app-employee-face-search',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        ToastModule,
        DialogModule
    ],
    templateUrl: './employee-face-search.html',
    styleUrl: './employee-face-search.scss',
    providers: [MessageService]
})
export class EmployeeFaceSearchComponent implements OnDestroy {
    selectedFile: File | null = null;
    previewUrl: string = '';
    searching = false;
    dragOver = false;

    result: FaceRecognizeResult | null = null;
    matched: MatchedEmployee | null = null;

    // Enrolled-images gallery dialog
    showImagesDialog = false;
    imagesLoading = false;
    galleryTitle = '';
    galleryUrls: string[] = [];

    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

    private readonly MAX_SIZE_MB = 10;

    constructor(
        private empService: EmpService,
        private messageService: MessageService,
        private _router: Router
    ) {}

    ngOnDestroy(): void {
        this.clearPreview();
        this.clearProfileImage();
        this.clearGallery();
    }

    get confidencePct(): number {
        return this.result ? Math.round((this.result.confidence ?? 0) * 100) : 0;
    }

    /** Open the native file picker. */
    triggerFileInput(): void {
        this.fileInput?.nativeElement.click();
    }

    /** Native <input type="file"> change handler. */
    onInputChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        this.handleFile(file ?? null);
        input.value = ''; // allow re-selecting the same file
    }

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        this.dragOver = true;
    }

    onDragLeave(event: DragEvent): void {
        event.preventDefault();
        this.dragOver = false;
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        this.dragOver = false;
        const file = event.dataTransfer?.files?.[0];
        this.handleFile(file ?? null);
    }

    private handleFile(file: File | null): void {
        if (!file) return;
        if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please choose a PNG or JPG image.' });
            return;
        }
        if (file.size > this.MAX_SIZE_MB * 1024 * 1024) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: `Image must be less than ${this.MAX_SIZE_MB} MB.` });
            return;
        }
        this.clearPreview();
        this.clearProfileImage();
        this.selectedFile = file;
        this.previewUrl = URL.createObjectURL(file);
        // Reset any previous result.
        this.result = null;
        this.matched = null;
    }

    search(): void {
        if (!this.selectedFile) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select an image first.' });
            return;
        }
        this.searching = true;
        this.result = null;
        this.matched = null;

        this.empService.recognizeFace(this.selectedFile).subscribe({
            next: (res) => {
                this.result = res;
                this.searching = false;
                if (res.matched && res.employee_id) {
                    this.loadMatchedEmployee(res.employee_id);
                } else {
                    this.messageService.add({ severity: 'info', summary: 'No Match', detail: 'No enrolled employee matched this face above the threshold.' });
                }
            },
            error: (err: any) => {
                this.searching = false;
                const status = err?.status;
                if (status === 400) {
                    this.messageService.add({ severity: 'warn', summary: 'No Face', detail: err?.error?.message || 'No face detected in the image.' });
                } else if (status === 502 || status === 503) {
                    this.messageService.add({ severity: 'error', summary: 'Service Unavailable', detail: err?.error?.message || 'Face recognition service is unavailable.' });
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Face search failed.' });
                }
            }
        });
    }

    clear(): void {
        this.clearPreview();
        this.clearProfileImage();
        this.selectedFile = null;
        this.result = null;
        this.matched = null;
    }

    /** Open a dialog showing all enrolled face images for an employee. */
    viewEnrolledImages(employeeId: number | null, name: string): void {
        if (!employeeId) return;
        this.clearGallery();
        this.galleryTitle = name ? `Enrolled Faces — ${name}` : 'Enrolled Faces';
        this.showImagesDialog = true;
        this.imagesLoading = true;

        this.empService.getEnrolledFacePhotos(employeeId).subscribe({
            next: (photos) => {
                const list = photos ?? [];
                if (list.length === 0) {
                    this.imagesLoading = false;
                    return;
                }
                forkJoin(
                    list.map((p) =>
                        this.empService.getEnrolledFaceImageBlob(employeeId, p.photo_id).pipe(catchError(() => of(null)))
                    )
                ).subscribe((blobs) => {
                    this.galleryUrls = blobs
                        .filter((b): b is Blob => !!b && b.size > 0)
                        .map((b) => URL.createObjectURL(b));
                    this.imagesLoading = false;
                });
            },
            error: (err: any) => {
                this.imagesLoading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load enrolled images.' });
            }
        });
    }

    closeImagesDialog(): void {
        this.showImagesDialog = false;
        this.clearGallery();
    }

    viewProfile(employeeId: number | null): void {
        if (employeeId) {
            this._router.navigate(['/members/profile', employeeId]);
        }
    }

    confidenceSeverity(conf: number): 'success' | 'warn' | 'danger' {
        if (conf >= 0.6) return 'success';
        if (conf >= 0.4) return 'warn';
        return 'danger';
    }

    // ---------------------------------------------------------------- internals
    private loadMatchedEmployee(employeeId: number): void {
        forkJoin({
            emp: this.empService.getEmployeeById(employeeId).pipe(catchError(() => of(null))),
            info: this.empService.getEmployeeSearchInfo(employeeId).pipe(catchError(() => of(null)))
        }).subscribe(({ emp, info }) => {
            const e: any = emp ?? {};
            const i: any = info ?? {};
            this.matched = {
                employeeID: employeeId,
                fullNameEN: e.FullNameEN ?? e.fullNameEN ?? '',
                fullNameBN: e.FullNameBN ?? e.fullNameBN ?? '',
                rabid: e.RABID ?? e.rabid ?? '',
                serviceId: e.ServiceId ?? e.serviceId ?? '',
                rankDisplay: i.rank ?? i.Rank,
                corpsDisplay: i.corps ?? i.Corps,
                tradeDisplay: i.trade ?? i.Trade,
                motherOrganizationDisplay: i.motherOrganization ?? i.MotherOrganization,
                profileImageUrl: null
            };
            this.loadProfileImage(e);
        });
    }

    /** Parse EmployeeInfo.ProfileImages JSON → first FileId → download blob → object URL. */
    private loadProfileImage(emp: any): void {
        const json = emp?.ProfileImages ?? emp?.profileImages ?? null;
        if (!json || typeof json !== 'string') return;
        let refs: { FileId?: number; fileId?: number }[];
        try {
            refs = JSON.parse(json);
        } catch {
            return;
        }
        const first = Array.isArray(refs) && refs.length > 0 ? refs[0] : null;
        const fileId = first?.FileId ?? first?.fileId;
        if (fileId == null || fileId <= 0) return;
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => {
                if (blob && blob.size > 0 && this.matched) {
                    this.matched.profileImageUrl = URL.createObjectURL(blob);
                }
            },
            error: () => {}
        });
    }

    private clearPreview(): void {
        if (this.previewUrl) {
            URL.revokeObjectURL(this.previewUrl);
            this.previewUrl = '';
        }
    }

    private clearProfileImage(): void {
        if (this.matched?.profileImageUrl) {
            URL.revokeObjectURL(this.matched.profileImageUrl);
            this.matched.profileImageUrl = null;
        }
    }

    private clearGallery(): void {
        this.galleryUrls.forEach((u) => URL.revokeObjectURL(u));
        this.galleryUrls = [];
    }
}
