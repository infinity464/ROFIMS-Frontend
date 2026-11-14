import { FormBuilder } from '@angular/forms';
import { of, Subject } from 'rxjs';
import { organizationScopeValidator } from '@/shared/validators/organization-scope.validator';
import { IdentityUserCreateComponent } from './identity-user-create.component';

describe('Organization scope user management', () => {
  const army = { orgId: 1, orgNameEN: 'Army', isActive: true };
  const police = { orgId: 2, orgNameEN: 'Police', isActive: false };
  function create(responses: Record<string, any> = {}) {
    const component = Object.create(IdentityUserCreateComponent.prototype) as IdentityUserCreateComponent;
    Object.assign(component, {
      mappings: [], memberTypeAccesses: [], rabUnitAccesses: [], users: [],
      organizationScopeOptions: [], canGrantAllOrganizations: true,
      accessService: { getByUserId: () => of([]) },
      rabUnitAccessService: { getByUserId: () => of([]) },
      organizationAccessService: { getByUserId: (id: string) => responses[id] ?? of({ organizationMode: 'all', organizationIds: [], organizations: [] }) },
      messageService: { add: jasmine.createSpy('add') },
      identityService: { createUser: jasmine.createSpy('createUser').and.returnValue(of({ isSuccess: false, message: 'test stops after payload capture' })) },
      form: new FormBuilder().group({
        ipAddress: [''], email: ['user@example.com'], userName: ['user'], phoneNumber: ['01700000000'],
        roleName: ['User'], password: ['Password1!'], employeeId: [1], confirmUrl: ['/'],
        memberTypeIds: [[]], rabUnitIds: [[]], rabUnitMode: ['all'],
        organizationMode: ['all'], organizationIds: [[]]
      }, { validators: organizationScopeValidator })
    });
    return component;
  }
  const row = (component: IdentityUserCreateComponent, value: object) => (component as any).buildUserRow(value);

  it('loads all selected IDs, preserves inactive labels, and clears on another user', () => {
    const component = create({ restricted: of({ organizationMode: 'specific', organizationIds: [1, 2], organizations: [army, police] }) });
    component.onEdit(row(component, { id: 'restricted', email: 'restricted@example.com', organizationIds: [1, 2], organizations: [army, police] }));
    expect(component.form.get('organizationIds')?.value).toEqual([1, 2]);
    expect(component.form.get('organizationMode')?.value).toBe('specific');
    expect(component.organizationScopeOptions.find(o => o.orgId === 2)?.label).toBe('Police (inactive)');
    component.onEdit(row(component, { id: 'unrestricted', email: 'unrestricted@example.com' }));
    expect(component.form.get('organizationMode')?.value).toBe('all');
    expect(component.form.get('organizationIds')?.value).toEqual([]);
  });

  it('normalizes PascalCase scope data for the list and edit form', () => {
    const component = create();
    const mapped = row(component, { Id: 'user', Email: 'user@example.com', OrganizationIds: [1], Organizations: [{ OrgId: 1, OrgNameEN: 'Army', IsActive: true }] });
    expect(mapped.organizationIds).toEqual([1]);
    expect(mapped.organizations[0]).toEqual(jasmine.objectContaining(army));
    expect(mapped.organizationNamesJoined).toBe('Army');
  });

  it('requires selections in Specific mode and sends numeric IDs with creation', () => {
    const component = create();
    component.form.patchValue({ organizationMode: 'specific', organizationIds: [] });
    expect(component.form.hasError('organizationRequired')).toBeTrue();
    component.onSubmit();
    expect((component as any).identityService.createUser).not.toHaveBeenCalled();
    component.form.patchValue({ organizationIds: [1, 2] });
    component.onSubmit();
    expect((component as any).identityService.createUser).toHaveBeenCalledWith(jasmine.objectContaining({ organizationMode: 'specific', organizationIds: [1, 2] }));
  });

  it('does not overwrite the current edit with an earlier delayed response', () => {
    const old = new Subject<any>();
    const component = create({ old });
    component.onEdit(row(component, { id: 'old', email: 'old@example.com' }));
    component.onEdit(row(component, { id: 'new', email: 'new@example.com' }));
    old.next({ organizationMode: 'specific', organizationIds: [1], organizations: [army] });
    old.complete();
    expect(component.form.get('organizationIds')?.value).toEqual([]);
    expect(component.editingUser?.id).toBe('new');
  });

  it('blocks saving when access settings failed to load', () => {
    const component = create();
    component.accessSettingsLoadFailed = true;
    component.onSubmit();
    expect((component as any).identityService.createUser).not.toHaveBeenCalled();
  });
});
