import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmpAddress } from './emp-address';

describe('EmpAddress', () => {
  let component: EmpAddress;
  let fixture: ComponentFixture<EmpAddress>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmpAddress]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmpAddress);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
