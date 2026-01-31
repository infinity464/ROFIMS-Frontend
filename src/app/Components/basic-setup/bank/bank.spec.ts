import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Bank } from './bank';

describe('Bank', () => {
  let component: Bank;
  let fixture: ComponentFixture<Bank>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Bank]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Bank);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
