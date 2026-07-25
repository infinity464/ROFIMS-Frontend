import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Fluid } from 'primeng/fluid';
import { TabsModule } from 'primeng/tabs';
import { ButtonModule } from 'primeng/button';
import { MegaMenuModule } from 'primeng/megamenu';
import { MegaMenuItem } from 'primeng/api';

import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { SharedService } from '@/shared/services/shared-service';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { EmpBasicInfo } from '../emp-basic-info/emp-basic-info';
import { EmpPersonalInfo } from '../emp-personal-info/emp-personal-info';
import { EmpAddressInfo } from '../emp-address-info/emp-address-info';
import { EmpFamilyInfo } from '../emp-family-info/emp-family-info';
import { EmpNomineeInfo } from '../emp-nominee-info/emp-nominee-info';
import { EmpPreviousRabService } from '../emp-previous-rab-service/emp-previous-rab-service';
import { EmpServiceHistory } from '../emp-service-history/emp-service-history';
import { EmpPromotionInfo } from '../emp-promotion-info/emp-promotion-info';
import { EmpRankConfirmationComponent } from '../emp-rank-confirmation/emp-rank-confirmation';
import { EmpEducationInfoComponent } from '../emp-education-info/emp-education-info';
import { EmpCourseInfoComponent } from '../emp-course-info/emp-course-info';
import { EmpDisciplineInfoComponent } from '../emp-discipline-info/emp-discipline-info';
import { EmpBankAccount } from '../emp-bank-account/emp-bank-account.component';
import { EmpForeignVisit } from '../emp-foreign-visit/emp-foreign-visit.component';
import { EmpLeaveInfo } from '../emp-leave-info/emp-leave-info.component';
import { EmpMedicalCategory } from '../emp-medical-category/emp-medical-category.component';
import { EmpAdditionalRemarks } from '../emp-additional-remarks/emp-additional-remarks.component';

@Component({
    selector: 'app-emp-personal-service-info',
    standalone: true,
    imports: [
        CommonModule,
        Fluid,
        TabsModule,
        ButtonModule,
        MegaMenuModule,
        ToastModule,
        EmployeeSearchComponent,
        EmpBasicInfo,
        EmpPersonalInfo,
        EmpAddressInfo,
        EmpFamilyInfo,
        EmpNomineeInfo,
        EmpPreviousRabService,
        EmpServiceHistory,
        EmpPromotionInfo,
        EmpRankConfirmationComponent,
        EmpEducationInfoComponent,
        EmpCourseInfoComponent,
        EmpDisciplineInfoComponent,
        EmpBankAccount,
        EmpForeignVisit,
        EmpLeaveInfo,
        EmpMedicalCategory,
        EmpAdditionalRemarks
    ],
    providers: [MessageService],
    templateUrl: './emp-personal-service-info.html',
    styleUrl: './emp-personal-service-info.scss'
})
export class EmpPersonalServiceInfoComponent implements OnInit {
    activeTab = 0;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: EmployeeBasicInfo | null = null;
    menuItems: MegaMenuItem[] = [];
    permissionDenied = false;
    permissionDeniedTypeName: string | null = null;

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private sharedService: SharedService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.route.queryParams.subscribe((params) => {
            const id = params['id'];
            this.selectedEmployeeId = id ? parseInt(id, 10) : null;
            if (!id) this.employeeBasicInfo = null;
        });

        this.updateMenuItems();
    }

    private updateMenuItems(): void {
        const items: MegaMenuItem[] = [
            { label: 'Basic Info', icon: 'pi pi-id-card', command: () => this.setActiveTab(0) },
            { label: 'Personal Info', icon: 'pi pi-user', command: () => this.setActiveTab(1) },
            { label: 'Address Info', icon: 'pi pi-map-marker', command: () => this.setActiveTab(2) },
            { label: 'Family Info', icon: 'pi pi-users', command: () => this.setActiveTab(3) },
            { label: 'Nominee Info', icon: 'pi pi-user-plus', command: () => this.setActiveTab(4) },
            { label: 'Previous RAB Service', icon: 'pi pi-history', command: () => this.setActiveTab(5) },
            { label: 'Service History', icon: 'pi pi-clock', command: () => this.setActiveTab(6) },
            { label: 'Promotion Info', icon: 'pi pi-arrow-up', command: () => this.setActiveTab(7) },
            { label: 'Rank Confirmation', icon: 'pi pi-check-circle', command: () => this.setActiveTab(8) },
            { label: 'Education Info', icon: 'pi pi-book', command: () => this.setActiveTab(9) },
            { label: 'Course Info', icon: 'pi pi-graduation-cap', command: () => this.setActiveTab(10) },
            { label: 'Discipline Info', icon: 'pi pi-exclamation-triangle', command: () => this.setActiveTab(11) },
            { label: 'Bank Account', icon: 'pi pi-wallet', command: () => this.setActiveTab(12) },
            { label: 'Foreign Visit', icon: 'pi pi-globe', command: () => this.setActiveTab(13) },
            { label: 'Leave Info', icon: 'pi pi-calendar-minus', command: () => this.setActiveTab(14) },
            { label: 'Medical Category', icon: 'pi pi-heart', command: () => this.setActiveTab(15) },
            { label: 'Additional Remarks', icon: 'pi pi-comment', command: () => this.setActiveTab(16) }
        ];

        // Add active class and styling to the currently selected tab
        items.forEach((item, index) => {
            if (index === this.activeTab) {
                item.styleClass = 'active-tab';
                (item as any).active = true;
            } else {
                item.styleClass = '';
                (item as any).active = false;
            }
        });

        this.menuItems = items;
    }

    onEmployeeFound(info: EmployeeBasicInfo): void {
        if (!this.isMemberTypeAllowed(info.memberType ?? null)) {
            this.permissionDenied = true;
            this.permissionDeniedTypeName = info.memberTypeDisplay ?? null;
            this.employeeBasicInfo = null;
            this.selectedEmployeeId = null;
            this.messageService.add({
                severity: 'warn',
                summary: 'No Permission',
                detail: info.memberTypeDisplay
                    ? `You do not have permission to view ${info.memberTypeDisplay}.`
                    : 'You do not have permission to view this member type.',
                life: 6000
            });
            this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
            return;
        }

        this.permissionDenied = false;
        this.permissionDeniedTypeName = null;
        this.employeeBasicInfo = info;
        this.selectedEmployeeId = info.employeeID;
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { id: info.employeeID, mode: 'edit' },
            queryParamsHandling: 'merge',
            replaceUrl: true
        });
    }

    onSearchReset(): void {
        this.employeeBasicInfo = null;
        this.selectedEmployeeId = null;
        this.permissionDenied = false;
        this.permissionDeniedTypeName = null;
        this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }

    private isMemberTypeAllowed(memberTypeId: number | null): boolean {
        if (memberTypeId == null) return true;
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) return true;
        const allowed = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (allowed === null) return true;
        return allowed.includes(memberTypeId);
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }

    setActiveTab(tabIndex: number): void {
        this.activeTab = tabIndex;
        this.updateMenuItems();
    }
}
