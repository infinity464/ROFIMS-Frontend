import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Upazila } from './upazila';

describe('Upazila', () => {
  let component: Upazila;
  let fixture: ComponentFixture<Upazila>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Upazila]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Upazila);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
