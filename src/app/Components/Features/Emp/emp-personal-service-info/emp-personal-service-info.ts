import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Fluid } from 'primeng/fluid';
import { TabsModule } from 'primeng/tabs';
import { ButtonModule } from 'primeng/button';

import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
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
        EmployeeSearchComponent,
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
    templateUrl: './emp-personal-service-info.html',
    styleUrl: './emp-personal-service-info.scss'
})
export class EmpPersonalServiceInfoComponent implements OnInit {
    activeTab = 0;
    selectedEmployeeId: number | null = null;
    employeeBasicInfo: EmployeeBasicInfo | null = null;

    constructor(private router: Router, private route: ActivatedRoute) {}

    ngOnInit(): void {
        this.route.queryParams.subscribe((params) => {
            const id = params['id'];
            this.selectedEmployeeId = id ? parseInt(id, 10) : null;
            if (!id) this.employeeBasicInfo = null;
        });
    }

    onEmployeeFound(info: EmployeeBasicInfo): void {
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
        this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }

    goBack(): void {
        this.router.navigate(['/emp-list']);
    }
}
