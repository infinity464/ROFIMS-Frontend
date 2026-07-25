import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { ImageCropperComponent, ImageCroppedEvent, ImageTransform } from 'ngx-image-cropper';
import { FileUploadModule } from 'primeng/fileupload';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { EmpService } from '@/services/emp-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

interface EnrolledFace {
    photoId: string;
    url: string;
}

@Component({
    selector: 'app-employee-signature-upload',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        ToastModule,
        ToggleSwitchModule,
        TooltipModule,
        FileUploadModule,
        ConfirmDialogModule,
        ImageCropperComponent,
        EmployeeSearchComponent
    ],
    templateUrl: './employee-signature-upload.html',
    styleUrl: './employee-signature-upload.scss',
    providers: [MessageService, ConfirmationService]
})
export class EmployeeSignatureUploadComponent implements OnInit, OnDestroy {
    employeeId: number | null = null;
    employeeInfo: EmployeeBasicInfo | null = null;

    imageFile: File | null = null;
    croppedImageBlob: Blob | null = null;
    croppedImageUrl: string = '';
    showCropper = false;
    enableCrop = true;
    removeBackground = true;
    uploading = false;
    transform: ImageTransform = {};
    zoomLevel = 1;

    @ViewChild('fileUploader') fileUploader: any;

    // Fixed output size for all signatures
    private readonly SIGNATURE_WIDTH = 600;
    private readonly SIGNATURE_HEIGHT = 200;

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    // Direct upload (no crop)
    directFile: File | null = null;
    directPreviewUrl: string = '';

    // Processed preview (after background removal)
    processedPreviewUrl: string = '';

    // Current saved signature
    currentSignatureUrl: string = '';

    // ---- Face recognition enrollment ----
    faceFiles: File[] = [];
    facePreviewUrls: string[] = [];
    enrolledFaceCount = 0;
    enrollingFaces = false;
    dragOverFace = false;

    // Inline enrolled-images gallery (toggled by "Show All Images")
    showEnrolled = false;
    loadingEnrolled = false;
    enrolledFaces: EnrolledFace[] = [];
    deletingPhotoId: string | null = null;

    /** Hard cap on total enrolled faces per employee. */
    readonly MAX_FACES_PER_EMPLOYEE = 10;
    private readonly MAX_FACE_SIZE_MB = 10;
    @ViewChild('faceInput') faceInput!: ElementRef<HTMLInputElement>;

    /** Remaining slots = cap − already-enrolled − currently-selected. */
    get faceSlotsLeft(): number {
        return Math.max(0, this.MAX_FACES_PER_EMPLOYEE - this.enrolledFaceCount - this.faceFiles.length);
    }

    constructor(
        private empService: EmpService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private _router: Router,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
    }

    ngOnDestroy(): void {
        this.clearFaceSelection();
        this.clearEnrolledGallery();
    }

    onEmployeeFound(emp: EmployeeBasicInfo): void {
        this.employeeId = emp.employeeID;
        this.employeeInfo = emp;
        this.loadCurrentSignature();
        this.loadFaceCount();
        this.resetSelection();
        this.clearFaceSelection();
        this.showEnrolled = false;
        this.clearEnrolledGallery();
    }

    onSearchReset(): void {
        this.employeeId = null;
        this.employeeInfo = null;
        if (this.currentSignatureUrl) {
            URL.revokeObjectURL(this.currentSignatureUrl);
            this.currentSignatureUrl = '';
        }
        this.enrolledFaceCount = 0;
        this.resetSelection();
        this.clearFaceSelection();
        this.showEnrolled = false;
        this.clearEnrolledGallery();
    }

    onCropToggleChange(): void {
        this.resetSelection();
    }

    onRemoveBackgroundChange(): void {
        const blob = this.enableCrop ? this.croppedImageBlob : this.directFile;
        if (this.removeBackground && blob) {
            this.applyBackgroundRemovalPreview(blob);
        } else {
            this.clearProcessedPreview();
        }
    }

    onFileSelected(event: { files: File[] }): void {
        const file = event.files[0];
        if (!file) return;

        if (file.size > 1 * 1024 * 1024) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'File size must be less than 1 MB.' });
            this.fileUploader?.clear();
            return;
        }

        if (this.enableCrop) {
            this.imageFile = file;
            this.showCropper = true;
            this.croppedImageBlob = null;
            this.croppedImageUrl = '';
        } else {
            this.directFile = file;
            this.directPreviewUrl = URL.createObjectURL(file);
            if (this.removeBackground) {
                this.applyBackgroundRemovalPreview(file);
            }
        }
    }

    imageCropped(event: ImageCroppedEvent): void {
        this.croppedImageBlob = event.blob ?? null;
        if (event.objectUrl) {
            this.croppedImageUrl = event.objectUrl;
        }
        if (this.removeBackground && this.croppedImageBlob) {
            this.applyBackgroundRemovalPreview(this.croppedImageBlob);
        } else {
            this.clearProcessedPreview();
        }
    }

    imageLoaded(): void {
        this.zoomLevel = 1;
        this.transform = {};
    }

    zoomIn(): void {
        this.zoomLevel = Math.min(this.zoomLevel + 0.2, 5);
        this.transform = { ...this.transform, scale: this.zoomLevel };
    }

    zoomOut(): void {
        this.zoomLevel = Math.max(this.zoomLevel - 0.2, 0.2);
        this.transform = { ...this.transform, scale: this.zoomLevel };
    }

    resetZoom(): void {
        this.zoomLevel = 1;
        this.transform = { ...this.transform, scale: 1 };
    }

    loadImageFailed(): void {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load image.' });
        this.resetSelection();
    }

    get hasImageReady(): boolean {
        return this.enableCrop ? !!this.croppedImageBlob : !!this.directFile;
    }

    upload(): void {
        if (!this.canUpdate) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to upload signatures.' });
            return;
        }
        if (!this.employeeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select an employee.' });
            return;
        }

        const blob = this.enableCrop ? this.croppedImageBlob : this.directFile;
        if (!blob) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select a signature image.' });
            return;
        }

        this.uploading = true;

        // Pipeline: remove background -> compress -> upload
        this.processImage(blob).then((processed) => {
            this.doUpload(processed);
        }).catch(() => {
            this.doUpload(blob);
        });
    }

    private doUpload(blob: Blob): void {
        this.empService.uploadSignature(this.employeeId!, blob).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Signature uploaded successfully.' });
                this.uploading = false;
                this.loadCurrentSignature();
                this.resetSelection();
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload signature.' });
                this.uploading = false;
            }
        });
    }

    /** Pipeline: remove background (if enabled) -> normalize size -> compress (if >= 500KB). */
    private async processImage(blob: Blob): Promise<Blob> {
        let result = blob;
        if (this.removeBackground) {
            result = await this.removeImageBackground(result);
        }
        result = await this.normalizeSize(result);
        if (result.size >= 500 * 1024) {
            result = await this.compressImage(result);
        }
        return result;
    }

    /** Resize image to fixed signature dimensions so all signatures are stored at the same size. */
    private normalizeSize(blob: Blob): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = this.SIGNATURE_WIDTH;
                canvas.height = this.SIGNATURE_HEIGHT;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject('Canvas not supported'); return; }

                // White background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Scale to fit within fixed size while maintaining aspect ratio, centered
                const scale = Math.min(this.SIGNATURE_WIDTH / img.width, this.SIGNATURE_HEIGHT / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                const x = (this.SIGNATURE_WIDTH - w) / 2;
                const y = (this.SIGNATURE_HEIGHT - h) / 2;

                ctx.drawImage(img, x, y, w, h);

                canvas.toBlob((result) => {
                    if (result) resolve(result);
                    else reject('Normalization failed');
                }, 'image/png');

                URL.revokeObjectURL(img.src);
            };
            img.onerror = () => reject('Image load failed');
            img.src = URL.createObjectURL(blob);
        });
    }

    /**
     * Removes image background: converts non-dark pixels to white,
     * keeping only the signature ink (dark pixels).
     * Uses a brightness threshold — pixels brighter than the threshold become white.
     */
    private removeImageBackground(blob: Blob): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject('Canvas not supported'); return; }

                // Draw original image
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // Threshold: pixels with brightness above this become white.
                // Signature ink is very dark (brightness < 80), so 128 safely
                // removes all background (gray edges, shadows) while keeping ink.
                const threshold = 128;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const brightness = (r + g + b) / 3;

                    if (brightness > threshold) {
                        // Background pixel -> make white
                        data[i] = 255;
                        data[i + 1] = 255;
                        data[i + 2] = 255;
                        data[i + 3] = 255;
                    }
                    // else: keep dark pixel (signature ink) as-is
                }

                ctx.putImageData(imageData, 0, 0);

                canvas.toBlob((result) => {
                    if (result) resolve(result);
                    else reject('Background removal failed');
                }, 'image/png');

                URL.revokeObjectURL(img.src);
            };
            img.onerror = () => reject('Image load failed');
            img.src = URL.createObjectURL(blob);
        });
    }

    /** Compress image using canvas. Reduces quality until size < 500KB. */
    private compressImage(blob: Blob): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Scale down if too large
                let w = img.width;
                let h = img.height;
                const maxW = 600;
                if (w > maxW) {
                    h = Math.round(h * (maxW / w));
                    w = maxW;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject('Canvas not supported'); return; }
                ctx.drawImage(img, 0, 0, w, h);

                // Try decreasing quality until < 500KB
                let quality = 0.7;
                const tryCompress = () => {
                    canvas.toBlob((result) => {
                        if (!result) { reject('Compression failed'); return; }
                        if (result.size < 500 * 1024 || quality <= 0.3) {
                            resolve(result);
                        } else {
                            quality -= 0.1;
                            tryCompress();
                        }
                    }, 'image/png', quality);
                };
                tryCompress();
            };
            img.onerror = () => reject('Image load failed');
            img.src = URL.createObjectURL(blob);
        });
    }

    private loadCurrentSignature(): void {
        if (!this.employeeId) return;

        // Revoke previous object URL to prevent memory leaks
        if (this.currentSignatureUrl) {
            URL.revokeObjectURL(this.currentSignatureUrl);
            this.currentSignatureUrl = '';
        }

        // Fetch via HttpClient so auth headers are included
        this.empService.getSignatureBlob(this.employeeId).subscribe({
            next: (blob) => {
                if (blob && blob.size > 0) {
                    this.currentSignatureUrl = URL.createObjectURL(blob);
                }
            },
            error: (err: any) => {
                this.currentSignatureUrl = '';
            }
        });
    }

    /** Apply background removal and update the processed preview URL. */
    private applyBackgroundRemovalPreview(blob: Blob): void {
        this.removeImageBackground(blob).then((processed) => {
            this.clearProcessedPreview();
            this.processedPreviewUrl = URL.createObjectURL(processed);
        }).catch(() => {
            this.clearProcessedPreview();
        });
    }

    private clearProcessedPreview(): void {
        if (this.processedPreviewUrl) {
            URL.revokeObjectURL(this.processedPreviewUrl);
            this.processedPreviewUrl = '';
        }
    }

    resetSelection(): void {
        this.imageFile = null;
        this.croppedImageBlob = null;
        this.croppedImageUrl = '';
        this.showCropper = false;
        this.zoomLevel = 1;
        this.transform = {};
        this.clearProcessedPreview();
        if (this.directPreviewUrl) {
            URL.revokeObjectURL(this.directPreviewUrl);
        }
        this.directFile = null;
        this.directPreviewUrl = '';
        this.fileUploader?.clear();
    }

    onSignatureLoadError(): void {
        this.currentSignatureUrl = '';
    }

    // ---------------------------------------------------------------- Face enrollment

    /** Open the native face-image file picker. */
    triggerFaceInput(): void {
        this.faceInput?.nativeElement.click();
    }

    onFaceInputChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.addFaceFiles(input.files ? Array.from(input.files) : []);
        input.value = ''; // allow re-selecting the same file
    }

    onFaceDragOver(event: DragEvent): void {
        event.preventDefault();
        this.dragOverFace = true;
    }

    onFaceDragLeave(event: DragEvent): void {
        event.preventDefault();
        this.dragOverFace = false;
    }

    onFaceDrop(event: DragEvent): void {
        event.preventDefault();
        this.dragOverFace = false;
        const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
        this.addFaceFiles(files);
    }

    /** Add selected images to the pending list (type/size/dedup + 10-per-employee cap). */
    private addFaceFiles(incoming: File[]): void {
        for (const file of incoming) {
            if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
                this.messageService.add({ severity: 'warn', summary: 'Warning', detail: `"${file.name}" is not a PNG/JPG image.` });
                continue;
            }
            if (file.size > this.MAX_FACE_SIZE_MB * 1024 * 1024) {
                this.messageService.add({ severity: 'warn', summary: 'Warning', detail: `"${file.name}" exceeds ${this.MAX_FACE_SIZE_MB} MB.` });
                continue;
            }
            // Skip exact duplicates (same name + size).
            if (this.faceFiles.some((f) => f.name === file.name && f.size === file.size)) {
                continue;
            }
            // Hard cap: total enrolled + pending must not exceed the per-employee limit.
            if (this.faceSlotsLeft <= 0) {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Limit reached',
                    detail: `An employee can have at most ${this.MAX_FACES_PER_EMPLOYEE} enrolled face images (${this.enrolledFaceCount} already enrolled).`
                });
                break;
            }
            this.faceFiles.push(file);
            this.facePreviewUrls.push(URL.createObjectURL(file));
        }
    }

    /** Remove one pending face image by index. */
    removeFaceFile(index: number): void {
        if (this.facePreviewUrls[index]) {
            URL.revokeObjectURL(this.facePreviewUrls[index]);
        }
        this.faceFiles.splice(index, 1);
        this.facePreviewUrls.splice(index, 1);
    }

    /** Upload all pending face images to the recognition service. */
    enrollFaces(): void {
        if (!this.canUpdate) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to upload face images.' });
            return;
        }
        if (!this.employeeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select an employee.' });
            return;
        }
        if (this.faceFiles.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select at least one face image.' });
            return;
        }
        if (this.enrolledFaceCount + this.faceFiles.length > this.MAX_FACES_PER_EMPLOYEE) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Limit reached',
                detail: `An employee can have at most ${this.MAX_FACES_PER_EMPLOYEE} enrolled face images.`
            });
            return;
        }

        this.enrollingFaces = true;
        this.empService.enrollFaces(this.employeeId, this.faceFiles).subscribe({
            next: (res: any) => {
                const enrolled = res?.photos_enrolled ?? 0;
                const rejected = res?.photos_rejected ?? 0;
                if (enrolled > 0) {
                    this.messageService.add({
                        severity: rejected > 0 ? 'warn' : 'success',
                        summary: 'Face Enrollment',
                        detail: `${enrolled} image(s) enrolled${rejected > 0 ? `, ${rejected} rejected (no/low-quality face).` : '.'}`
                    });
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Face Enrollment', detail: 'No images were enrolled. Ensure each image shows a clear, well-lit face.' });
                }
                this.enrollingFaces = false;
                this.clearFaceSelection();
                this.loadFaceCount();
                if (this.showEnrolled) this.loadEnrolledImages();
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to enroll face images.' });
                this.enrollingFaces = false;
            }
        });
    }

    /** Delete all enrolled face images for the current employee (with confirm). */
    deleteEnrolledFaces(): void {
        if (!this.canDelete) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to delete face images.' });
            return;
        }
        if (!this.employeeId) return;

        this.confirmationService.confirm({
            header: 'Delete All Enrolled Faces',
            message: `Delete all ${this.enrolledFaceCount} enrolled face image(s) for this employee? This cannot be undone.`,
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'No', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Yes, delete all', severity: 'danger' },
            accept: () => this.doDeleteAllEnrolled()
        });
    }

    private doDeleteAllEnrolled(): void {
        if (!this.employeeId) return;
        this.empService.deleteEnrolledFaces(this.employeeId).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'All enrolled face images removed.' });
                this.clearEnrolledGallery();
                this.loadFaceCount();
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to remove face images.' });
            }
        });
    }

    /** Toggle the inline enrolled-images gallery. */
    toggleEnrolledImages(): void {
        this.showEnrolled = !this.showEnrolled;
        if (this.showEnrolled) {
            this.loadEnrolledImages();
        } else {
            this.clearEnrolledGallery();
        }
    }

    /** Delete a single enrolled face image by its photo id (with confirm). */
    deleteEnrolledFace(photoId: string): void {
        if (!this.canDelete) {
            this.messageService.add({ severity: 'warn', summary: 'Permission Denied', detail: 'You do not have permission to delete face images.' });
            return;
        }
        if (!this.employeeId || this.deletingPhotoId) return;

        this.confirmationService.confirm({
            header: 'Delete Face Image',
            message: 'Delete this enrolled face image? This cannot be undone.',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'No', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Yes, delete', severity: 'danger' },
            accept: () => this.doDeleteEnrolledFace(photoId)
        });
    }

    private doDeleteEnrolledFace(photoId: string): void {
        if (!this.employeeId) return;
        this.deletingPhotoId = photoId;
        this.empService.deleteEnrolledFace(this.employeeId, photoId).subscribe({
            next: () => {
                const idx = this.enrolledFaces.findIndex((f) => f.photoId === photoId);
                if (idx >= 0) {
                    URL.revokeObjectURL(this.enrolledFaces[idx].url);
                    this.enrolledFaces.splice(idx, 1);
                }
                this.enrolledFaceCount = Math.max(0, this.enrolledFaceCount - 1);
                this.deletingPhotoId = null;
                this.messageService.add({ severity: 'success', summary: 'Removed', detail: 'Face image deleted.' });
            },
            error: (err: any) => {
                this.deletingPhotoId = null;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to delete face image.' });
            }
        });
    }

    private loadEnrolledImages(): void {
        if (!this.employeeId) return;
        this.loadingEnrolled = true;
        this.clearEnrolledGallery();
        this.empService.getEnrolledFacePhotos(this.employeeId).subscribe({
            next: (photos) => {
                const list = photos ?? [];
                this.enrolledFaceCount = list.length;
                if (list.length === 0) {
                    this.loadingEnrolled = false;
                    return;
                }
                const eid = this.employeeId!;
                forkJoin(
                    list.map((p) =>
                        this.empService.getEnrolledFaceImageBlob(eid, p.photo_id).pipe(catchError(() => of(null)))
                    )
                ).subscribe((blobs) => {
                    this.enrolledFaces = list
                        .map((p, i) => ({ photoId: p.photo_id, blob: blobs[i] }))
                        .filter((x) => !!x.blob && x.blob!.size > 0)
                        .map((x) => ({ photoId: x.photoId, url: URL.createObjectURL(x.blob as Blob) }));
                    this.loadingEnrolled = false;
                });
            },
            error: () => {
                this.loadingEnrolled = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load enrolled images.' });
            }
        });
    }

    private loadFaceCount(): void {
        if (!this.employeeId) return;
        this.empService.getEnrolledFaceCount(this.employeeId).subscribe({
            next: (res) => { this.enrolledFaceCount = res?.photoCount ?? 0; },
            error: () => { this.enrolledFaceCount = 0; }
        });
    }

    private clearFaceSelection(): void {
        this.facePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
        this.faceFiles = [];
        this.facePreviewUrls = [];
    }

    private clearEnrolledGallery(): void {
        this.enrolledFaces.forEach((f) => URL.revokeObjectURL(f.url));
        this.enrolledFaces = [];
    }
}
