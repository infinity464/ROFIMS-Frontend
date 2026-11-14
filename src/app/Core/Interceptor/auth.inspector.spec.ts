import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthenticationService, IP_ADDRESS_DENIAL_REASON } from '@/Components/Features/Authentication/Service/authentication';
import { AuthInterceptor } from './auth.inspector';

describe('Authentication interceptor IP restriction', () => {
  let http: HttpClient;
  let requests: HttpTestingController;
  let auth: jasmine.SpyObj<AuthenticationService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    auth = jasmine.createSpyObj('AuthenticationService', ['getToken', 'refreshToken', 'logout']);
    auth.getToken.and.returnValue('access-token');
    router = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([AuthInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthenticationService, useValue: auth },
        { provide: Router, useValue: router }
      ]
    });
    http = TestBed.inject(HttpClient);
    requests = TestBed.inject(HttpTestingController);
  });

  afterEach(() => requests.verify());

  it('ends a denied session without trying to refresh', () => {
    http.get('/protected').subscribe({ error: () => {} });
    requests.expectOne('/protected').flush({ reason: IP_ADDRESS_DENIAL_REASON }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.refreshToken).not.toHaveBeenCalled();
    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: IP_ADDRESS_DENIAL_REASON } });
  });

  it('still refreshes ordinary expired tokens and retries once', () => {
    auth.refreshToken.and.returnValue(of({ token: 'replacement' } as any));
    let received: unknown;
    http.get('/protected').subscribe((value) => received = value);
    requests.expectOne('/protected').flush({}, { status: 401, statusText: 'Unauthorized' });
    requests.expectOne('/protected').flush({ allowed: true });
    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(received).toEqual({ allowed: true });
  });

  it('preserves an IP denial returned during refresh', () => {
    auth.refreshToken.and.returnValue(throwError(() => ({ status: 401, reason: IP_ADDRESS_DENIAL_REASON })));
    http.get('/protected').subscribe({ error: () => {} });
    requests.expectOne('/protected').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: IP_ADDRESS_DENIAL_REASON } });
  });

  it('keeps ordinary permission errors separate from IP rejection', () => {
    http.get('/protected').subscribe({ error: () => {} });
    requests.expectOne('/protected').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(auth.refreshToken).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
