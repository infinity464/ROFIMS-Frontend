import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Division } from './division';

describe('Division', () => {
  let component: Division;
  let fixture: ComponentFixture<Division>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Division]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Division);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
