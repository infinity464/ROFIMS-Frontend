import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TrainingInstituteModel } from '../shared/models/training-institution';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { CommonCode } from '../shared/models/common-code';
import { TableModule } from "primeng/table";
import { IconField } from "primeng/iconfield";
import { InputIcon } from "primeng/inputicon";
import { Fluid } from "primeng/fluid";
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-training-institution',
  imports: [TableModule, InputTextModule, ButtonModule, SelectModule, IconField, InputIcon, Fluid, CommonModule, ReactiveFormsModule],
  templateUrl: './training-institution.html',
  styleUrl: './training-institution.scss',
})
export class TrainingInstitution {
 trainingForm! : FormGroup
  institutes: TrainingInstituteModel[] = [];
  filteredInstitutes: TrainingInstituteModel[] = [];
  editingId: number | null = null;
  isSubmitting = false;
  currentUser = '';
  country : CommonCode[] = []

  // Pagination
  first = 0;
  rows = 10;
  totalRecords = 0;

  // Search
  searchValue = '';

  constructor(
    private fb: FormBuilder,
    private instituteService: MasterBasicSetupService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private sharedService: SharedService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.sharedService.getCurrentUser();
    this.initForm();
    this.getAll();
    this.loadCountry();
  }

  initForm() {
    this.trainingForm = this.fb.group({
      trainingInstituteId: [0],
      trainingInstituteNameEN: ['', Validators.required],
      trainingInstituteNameBN: ['', Validators.required],
      countryId: [''],
      location: [''],
      createdBy: [this.currentUser],
      createdDate: [new Date()],
      lastUpdatedBy: [this.currentUser],
      lastUpdate: [new Date()]
    });
  }

  getAll() {
    this.instituteService.getAllInstitute().subscribe({
      next: (res: TrainingInstituteModel[]) => {
        this.institutes = res;
        this.filteredInstitutes = [...res];
        this.totalRecords = res.length;
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to fetch institutes'
        });
      }
    });
  }

  onSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchValue = target.value.toLowerCase().trim();

    if (this.searchValue) {
      this.filteredInstitutes = this.institutes.filter(inst =>
        inst.trainingInstituteNameEN.toLowerCase().includes(this.searchValue) ||
        inst.trainingInstituteNameBN?.toLowerCase().includes(this.searchValue) ||
        inst.location?.toLowerCase().includes(this.searchValue)
      );
    } else {
      this.filteredInstitutes = [...this.institutes];
    }

    this.totalRecords = this.filteredInstitutes.length;
    this.first = 0;
  }

  onSubmit() {
    if (this.isSubmitting) return;

    if (this.trainingForm.invalid) {
      this.trainingForm.markAllAsTouched();
      return;
    }

    if (this.editingId) {
      this.update();
    } else {
      this.create();
    }
  }

  loadCountry(){
    this.instituteService.getAllByType('Country').subscribe({
        next: (res)=>{
            this.country = res;
        }
    })
  }

  create() {
    this.isSubmitting = true;

    this.instituteService.createInstitute(this.trainingForm.value).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Institute created successfully'
        });
        this.onReset();
        this.getAll();
        this.isSubmitting = false;
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to create institute'
        });
        this.isSubmitting = false;
      }
    });
  }

  update() {
    this.isSubmitting = true;

    const updatePayload = {
      ...this.trainingForm.value,
      trainingInstituteId: this.editingId
    };

    this.instituteService.updateInstitute(updatePayload).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Institute updated successfully'
        });
        this.onReset();
        this.getAll();
        this.isSubmitting = false;
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to update institute'
        });
        this.isSubmitting = false;
      }
    });
  }

  onEdit(institute: TrainingInstituteModel) {
    this.editingId = institute.trainingInstituteId;
    this.trainingForm.patchValue(institute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onDelete(institute: TrainingInstituteModel, event: Event) {
    this.confirmationService.confirm({
      target: event.target as EventTarget,
      message: 'Do you want to delete this record?',
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      acceptIcon: 'pi pi-check',
      rejectIcon: 'pi pi-times',
      rejectLabel: 'Cancel',
      acceptLabel: 'Delete',
      rejectButtonProps: {
        label: 'Cancel',
        severity: 'secondary',
        outlined: true
      },
      acceptButtonProps: {
        label: 'Delete',
        severity: 'danger'
      },
      accept: () => {
        this.instituteService.deleteInstitute(institute.trainingInstituteId).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Institute deleted successfully'
            });
            this.getAll();
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: 'Failed to delete institute'
            });
          }
        });
      }
    });
  }

  onReset() {
    this.editingId = null;
    this.trainingForm.reset({
      trainingInstituteId: 0,
      createdBy: this.currentUser,
      createdDate: new Date(),
      lastUpdatedBy: this.currentUser,
      lastUpdate: new Date()
    });
    this.isSubmitting = false;
  }

}
