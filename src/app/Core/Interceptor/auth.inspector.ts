import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthenticationService } from '@/Components/Features/Authentication/Service/authentication';
import { Router } from '@angular/router';

function isAuthEndpoint(url: string): boolean {
  return /\/Identity\/(GetToken|GetRefreshToken|GetForgotToken|ForgotPassword)/i.test(url);
}

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
        return auth.refreshToken().pipe(
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
