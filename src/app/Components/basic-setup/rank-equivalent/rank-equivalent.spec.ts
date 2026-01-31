import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RankEquivalent } from './rank-equivalent';

describe('RankEquivalent', () => {
  let component: RankEquivalent;
  let fixture: ComponentFixture<RankEquivalent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RankEquivalent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RankEquivalent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
