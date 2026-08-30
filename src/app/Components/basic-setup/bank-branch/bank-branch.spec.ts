import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BankBranchComponent } from './bank-branch';

describe('BankBranchComponent', () => {
    let component: BankBranchComponent;
    let fixture: ComponentFixture<BankBranchComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [BankBranchComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(BankBranchComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
