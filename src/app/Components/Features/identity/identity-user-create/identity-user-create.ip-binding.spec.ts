import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { IdentityUserCreateComponent } from './identity-user-create.component';

describe('User edit IP binding', () => {
  function createComponent(): IdentityUserCreateComponent {
    // Exercise response mapping and edit behavior without loading the page's unrelated lookups.
    const component = Object.create(IdentityUserCreateComponent.prototype) as IdentityUserCreateComponent;
    Object.assign(component, {
      mappings: [], memberTypeAccesses: [], rabUnitAccesses: [],
      organizationScopeOptions: [],
      organizationAccessService: { getByUserId: () => of({ organizationMode: 'all', organizationIds: [], organizations: [] }) },
      accessService: { getByUserId: () => of([]) },
      rabUnitAccessService: { getByUserId: () => of([]) },
      form: new FormBuilder().group({
        ipAddress: [''], email: [''], userName: [''], phoneNumber: [''],
        roleName: [''], password: [''], employeeId: [null],
        memberTypeIds: [[]], rabUnitIds: [[]], rabUnitMode: ['all']
      })
    });
    return component;
  }

  for (const field of ['ipAddress', 'IpAddress']) {
    it(`loads the saved IP from the ${field} response field when editing`, () => {
      const component = createComponent();
      const row = (component as any).buildUserRow({
        id: 'bound-user', email: 'bound@example.com', [field]: '192.168.1.12'
      });
      component.onEdit(row);
      expect(component.form.get('ipAddress')?.value).toBe('192.168.1.12');
    });
  }

  it('clears the previous IP when switching to an unrestricted user', () => {
    const component = createComponent();
    const row = (value: object) => (component as any).buildUserRow(value);
    component.onEdit(row({ id: 'bound', email: 'bound@example.com', ipAddress: '127.0.0.1' }));
    expect(component.form.get('ipAddress')?.value).toBe('127.0.0.1');
    component.onEdit(row({ id: 'unrestricted', email: 'unrestricted@example.com', ipAddress: null }));
    expect(component.form.get('ipAddress')?.value).toBe('');
  });
});
