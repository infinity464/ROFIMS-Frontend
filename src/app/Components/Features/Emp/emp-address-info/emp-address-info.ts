import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';

import { EmpService } from '@/services/emp-service';
import { AddressData, AddressFormConfig, AddressFormComponent } from '../../EmployeeInfo/address-form/address-form';
import { LocationType } from '@/models/enums';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';

@Component({
    selector: 'app-emp-address-info',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, ButtonModule, Fluid, TooltipModule, AddressFormComponent, EmployeeSearchComponent],
    templateUrl: './emp-address-info.html',
    styleUrl: './emp-address-info.scss'
})
export class EmpAddressInfo implements OnInit {
    @ViewChild('permanentAddressForm') permanentAddressForm!: AddressFormComponent;
    @ViewChild('presentAddressForm') presentAddressForm!: AddressFormComponent;

    // Employee lookup
    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;

    // Employee basic info
    employeeBasicInfo: any = null;

    // Address data for forms
    permanentAddressData: AddressData | undefined = undefined;
    presentAddressData: AddressData | undefined = undefined;

    // Address IDs for updates
    permanentAddressId: number | null = null;
    presentAddressId: number | null = null;

    // Mode: 'search' (default), 'view' (readonly), 'edit'
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly: boolean = false;

    // Address form configs
    permanentAddressConfig: AddressFormConfig = {
        title: 'Permanent Address',
        addressType: 'permanent',
        employeeId: 0
    };

    presentAddressConfig: AddressFormConfig = {
        title: 'Present Address',
        addressType: 'present',
        employeeId: 0,
        showSameAsPresent: true,
        sameAsLabel: 'Same as Permanent Address'
    };

    constructor(
        private empService: EmpService,
        private messageService: MessageService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.checkRouteParams();
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe((params) => {
            const employeeId = params['id'];
            const mode = params['mode'];

            if (employeeId) {
                this.mode = mode === 'edit' ? 'edit' : 'view';
                this.isReadonly = this.mode === 'view';
                this.loadEmployeeById(parseInt(employeeId, 10));
            } else {
                this.mode = 'search';
                this.isReadonly = false;
            }
        });
    }

    loadEmployeeById(employeeId: number): void {
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                if (employee) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = employee.employeeID || employee.EmployeeID;
                    this.employeeBasicInfo = employee;
                    this.updateAddressConfigs();
                    this.loadAddresses();
                }
            },
            error: (err) => {
                console.error('Failed to load employee', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load employee data'
                });
            }
        });
    }

    updateAddressConfigs(): void {
        if (this.selectedEmployeeId) {
            this.permanentAddressConfig.employeeId = this.selectedEmployeeId;
            this.presentAddressConfig.employeeId = this.selectedEmployeeId;
        }
    }

    // Handle employee search component events
    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;
        this.isReadonly = true;
        this.updateAddressConfigs();
        this.loadAddresses();
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    loadAddresses(): void {
        if (!this.selectedEmployeeId) return;

        this.empService.getAddressesByEmployeeId(this.selectedEmployeeId).subscribe({
            next: (addresses: any[]) => {
                // Find active permanent and present addresses
                addresses.forEach((addr) => {
                    const locationType = (addr.locationType || addr.LocationType || '').toLowerCase();
                    const isActive = addr.active !== false && addr.Active !== false;

                    if (isActive) {
                        const addressData: AddressData = {
                            division: addr.divisionType || addr.DivisionType,
                            district: addr.districtType || addr.DistrictType,
                            upazila: addr.thanaType || addr.ThanaType,
                            postOffice: addr.postOfficeType || addr.PostOfficeType,
                            postCode: addr.postCode || addr.PostCode || '',
                            villageEnglish: addr.addressAreaEN || addr.AddressAreaEN || '',
                            villageBangla: addr.addressAreaBN || addr.AddressAreaBN || '',
                            houseRoad: addr.houseRoad || addr.HouseRoad || ''
                        };

                        if (locationType === LocationType.Permanent.toLowerCase()) {
                            this.permanentAddressData = addressData;
                            this.permanentAddressId = addr.addressId || addr.AddressId;
                        } else if (locationType === LocationType.Present.toLowerCase()) {
                            this.presentAddressData = addressData;
                            this.presentAddressId = addr.addressId || addr.AddressId;
                        }
                    }
                });
            },
            error: (err) => {
                console.error('Failed to load addresses', err);
            }
        });
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { id: this.selectedEmployeeId, mode: 'edit' },
            queryParamsHandling: 'merge'
        });
    }

    cancelEdit(): void {
        this.mode = 'view';
        this.isReadonly = true;
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { id: this.selectedEmployeeId, mode: 'view' },
            queryParamsHandling: 'merge'
        });
    }

    enableSearchEditMode(): void {
        this.isReadonly = false;
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    copyPermanentToPresent(): void {
        const permanentData = this.permanentAddressForm?.getFormData();
        if (permanentData?.data) {
            this.presentAddressForm?.populateFromSourceAddress(permanentData.data);
        }
    }

    saveAllAddresses(): void {
        if (!this.selectedEmployeeId) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'Please search for an employee first'
            });
            return;
        }

        // Get form data from both forms
        const permanentData = this.permanentAddressForm?.getFormData();
        const presentData = this.presentAddressForm?.getFormData();

        if (!permanentData?.data?.division && !presentData?.data?.division) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'No address data to save'
            });
            return;
        }

        let totalOperations = 0;
        let completedOperations = 0;
        let errorCount = 0;

        // Count total operations needed
        if (permanentData?.data?.division) totalOperations++;
        if (presentData?.data?.division) totalOperations++;

        const checkComplete = () => {
            completedOperations++;
            if (completedOperations === totalOperations) {
                if (errorCount === 0) {
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Addresses saved successfully'
                    });
                    this.isReadonly = true; // Back to readonly mode
                    this.loadAddresses(); // Reload to get new data
                }
            }
        };

        // Save permanent address: deactivate old, create new
        if (permanentData?.data?.division) {
            this.deactivateAndCreateNew(
                permanentData.data,
                LocationType.Permanent,
                this.permanentAddressId,
                () => checkComplete(),
                () => {
                    errorCount++;
                    checkComplete();
                }
            );
        }

        // Save present address: deactivate old, create new
        if (presentData?.data?.division) {
            this.deactivateAndCreateNew(
                presentData.data,
                LocationType.Present,
                this.presentAddressId,
                () => checkComplete(),
                () => {
                    errorCount++;
                    checkComplete();
                }
            );
        }
    }

    // Deactivate old address and create new one
    private deactivateAndCreateNew(data: AddressData, locationType: string, existingAddressId: number | null, onSuccess: () => void, onError: () => void): void {
        // New address payload (always create new with Active = true)
        const newAddressPayload = {
            EmployeeID: this.selectedEmployeeId,
            AddressId: 0, // New record
            FMID: 0,
            LocationType: locationType,
            LocationCode: `${data.division}-${data.district}-${data.upazila}`,
            PostCode: data.postCode || '',
            AddressAreaEN: data.villageEnglish || '',
            AddressAreaBN: data.villageBangla || '',
            DivisionType: data.division,
            DistrictType: data.district,
            ThanaType: data.upazila,
            PostOfficeType: data.postOffice,
            HouseRoad: data.houseRoad || '',
            Active: true,
            CreatedBy: 'system',
            CreatedDate: new Date().toISOString(),
            LastUpdatedBy: 'system',
            Lastupdate: new Date().toISOString()
        };

        if (existingAddressId) {
            // Get the existing address data first, then deactivate it
            this.empService.getAddressesByEmployeeId(this.selectedEmployeeId!).subscribe({
                next: (addresses: any[]) => {
                    // Find the existing address
                    const existingAddress = addresses.find((addr) => (addr.addressId || addr.AddressId) === existingAddressId);

                    if (existingAddress) {
                        // Create full deactivate payload with all fields
                        const deactivatePayload = {
                            EmployeeID: existingAddress.employeeID || existingAddress.EmployeeID,
                            AddressId: existingAddressId,
                            FMID: existingAddress.fmid || existingAddress.FMID || 0,
                            LocationType: existingAddress.locationType || existingAddress.LocationType,
                            LocationCode: existingAddress.locationCode || existingAddress.LocationCode || '',
                            PostCode: existingAddress.postCode || existingAddress.PostCode || '',
                            AddressAreaEN: existingAddress.addressAreaEN || existingAddress.AddressAreaEN || '',
                            AddressAreaBN: existingAddress.addressAreaBN || existingAddress.AddressAreaBN || '',
                            DivisionType: existingAddress.divisionType || existingAddress.DivisionType,
                            DistrictType: existingAddress.districtType || existingAddress.DistrictType,
                            ThanaType: existingAddress.thanaType || existingAddress.ThanaType,
                            PostOfficeType: existingAddress.postOfficeType || existingAddress.PostOfficeType,
                            HouseRoad: existingAddress.houseRoad || existingAddress.HouseRoad || '',
                            Active: false, // Deactivate
                            CreatedBy: existingAddress.createdBy || existingAddress.CreatedBy || 'system',
                            CreatedDate: existingAddress.createdDate || existingAddress.CreatedDate,
                            LastUpdatedBy: 'system',
                            Lastupdate: new Date().toISOString()
                        };

                        // Update with full payload to deactivate
                        this.empService.updateAddress(deactivatePayload).subscribe({
                            next: () => {
                                // After deactivating, create new address
                                this.empService.saveAddress(newAddressPayload).subscribe({
                                    next: () => onSuccess(),
                                    error: (err) => {
                                        console.error('Failed to create new address', err);
                                        onError();
                                    }
                                });
                            },
                            error: (err) => {
                                console.error('Failed to deactivate old address', err);
                                onError();
                            }
                        });
                    } else {
                        // Address not found, just create new
                        this.empService.saveAddress(newAddressPayload).subscribe({
                            next: () => onSuccess(),
                            error: (err) => {
                                console.error('Failed to save new address', err);
                                onError();
                            }
                        });
                    }
                },
                error: (err) => {
                    console.error('Failed to get existing address', err);
                    onError();
                }
            });
        } else {
            // No existing address, just create new
            this.empService.saveAddress(newAddressPayload).subscribe({
                next: () => onSuccess(),
                error: (err) => {
                    console.error('Failed to save new address', err);
                    onError();
                }
            });
        }
    }

    resetForm(): void {
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.permanentAddressData = undefined;
        this.presentAddressData = undefined;
        this.permanentAddressId = null;
        this.presentAddressId = null;
    }
}
