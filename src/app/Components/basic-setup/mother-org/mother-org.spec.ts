import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MotherOrg } from './mother-org';

describe('MotherOrg', () => {
  let component: MotherOrg;
  let fixture: ComponentFixture<MotherOrg>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MotherOrg]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MotherOrg);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
