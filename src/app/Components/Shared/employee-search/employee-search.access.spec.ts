import { EventEmitter } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { EmployeeSearchComponent } from './employee-search';

describe('Employee direct-ID access', () => {
  function component(getEmployeeById: (id: number) => any): EmployeeSearchComponent {
    const value = Object.create(EmployeeSearchComponent.prototype) as EmployeeSearchComponent;
    Object.assign(value, {
      directLookupRequestId: 0, employeeFound: true, employeeInfo: { employeeID: 1, fullNameEN: 'Previous employee' },
      empService: { getEmployeeById }, searchRabId: 'old', searchServiceId: 'old',
      messageService: { add: jasmine.createSpy('message') }, onSearchReset: new EventEmitter<void>(),
      onEmployeeFound: new EventEmitter(), showExMemberNotice: false
    });
    spyOn(value as any, 'finalizeAndEmit');
    return value;
  }

  it('clears the prior selection and URL state when a direct-ID request is denied', () => {
    const value = component(() => throwError(() => ({ status: 403 })));
    const reset = spyOn(value.onSearchReset, 'emit');
    value.loadEmployeeById(60343);
    expect(value.employeeFound).toBeFalse();
    expect(value.employeeInfo).toBeNull();
    expect(value.isSearching).toBeFalse();
    expect(reset).toHaveBeenCalled();
    expect((value as any).finalizeAndEmit).not.toHaveBeenCalled();
  });

  it('never emits an employee when the server returns an empty scoped lookup', () => {
    const value = component(() => of(undefined));
    const found = spyOn(value.onEmployeeFound, 'emit');
    value.loadEmployeeById(60343);
    expect(value.employeeInfo).toBeNull();
    expect(found).not.toHaveBeenCalled();
    expect((value as any).finalizeAndEmit).not.toHaveBeenCalled();
  });

  it('ignores a slower previous lookup after the current employee is denied', () => {
    const slow = new Subject<any>();
    const value = component(id => id === 1 ? slow : throwError(() => ({ status: 403 })));
    value.loadEmployeeById(1);
    value.loadEmployeeById(60343);
    slow.next({ EmployeeID: 1, FullNameEN: 'Old result' });
    expect(value.employeeInfo).toBeNull();
    expect(value.employeeFound).toBeFalse();
    expect((value as any).finalizeAndEmit).not.toHaveBeenCalled();
  });

  it('loads an authorized direct employee after the backend accepts the request', () => {
    const value = component(() => of({ EmployeeID: 2, FullNameEN: 'Allowed employee' }));
    value.loadEmployeeById(2);
    expect(value.employeeInfo?.employeeID).toBe(2);
    expect((value as any).finalizeAndEmit).toHaveBeenCalledWith(2);
  });
});
