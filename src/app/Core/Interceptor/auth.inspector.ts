import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';
import { AuthenticationService } from '@/Components/Features/Authentication/Service/authentication';
import { Router } from '@angular/router';
import { LoginResponse } from '@/Components/Features/Authentication/Model/login-response.model';

function isAuthEndpoint(url: string): boolean {
  return /\/Identity\/(GetToken|GetRefreshToken|GetForgotToken|ForgotPassword)/i.test(url);
}

/**
 * Single-flight refresh lock. When several requests fire at once (e.g. on navigation) and all
 * get 401, only the FIRST starts a refresh; the rest await the same in-flight call. Without this,
 * each 401 would call refreshToken() independently — and since the backend rotates the refresh
 * token, only the first refresh succeeds while the others use a now-invalidated token, fail, and
 * trigger a spurious logout. Shared module-level state survives across interceptor invocations.
 */
let refreshInFlight$: Observable<LoginResponse> | null = null;

export const AuthInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthenticationService);
  const router = inject(Router);

  const skipAuth = isAuthEndpoint(req.url);
  const token = skipAuth ? null : auth.getToken();

  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthEndpoint(req.url)) {
        // Reuse the in-flight refresh if one is already running; otherwise start it.
        if (!refreshInFlight$) {
          refreshInFlight$ = auth.refreshToken().pipe(
            finalize(() => { refreshInFlight$ = null; }),
            shareReplay({ bufferSize: 1, refCount: false })
          );
        }

        return refreshInFlight$.pipe(
          switchMap(() => {
            const newToken = auth.getToken();
            if (!newToken) return throwError(() => error);
            const newReq = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` },
            });
            return next(newReq);
          }),
          catchError(() => {
            auth.logout();
            router.navigate(['/login']);
            return throwError(() => error);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
