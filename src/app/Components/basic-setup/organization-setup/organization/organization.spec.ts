import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Organization } from './organization';

describe('Organization', () => {
  let component: Organization;
  let fixture: ComponentFixture<Organization>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Organization]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Organization);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
