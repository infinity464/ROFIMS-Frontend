import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MasterBasicSetup } from './master-basic-setup';

describe('MasterBasicSetup', () => {
  let component: MasterBasicSetup;
  let fixture: ComponentFixture<MasterBasicSetup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasterBasicSetup]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MasterBasicSetup);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
