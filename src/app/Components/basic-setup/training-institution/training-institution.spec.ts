import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrainingInstitution } from './training-institution';

describe('TrainingInstitution', () => {
  let component: TrainingInstitution;
  let fixture: ComponentFixture<TrainingInstitution>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrainingInstitution]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TrainingInstitution);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
