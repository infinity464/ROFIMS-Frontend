import { ComponentFixture, TestBed } from '@angular/core/testing';

import { District } from './district';

describe('District', () => {
  let component: District;
  let fixture: ComponentFixture<District>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [District]
    })
    .compileComponents();

    fixture = TestBed.createComponent(District);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
