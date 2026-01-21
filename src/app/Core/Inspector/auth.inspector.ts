import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
// import { AuthenticationService } from '@/Components/Features/Authentication/Service/authentication.service';
import { AuthenticationService } from '@/Components/Features/Authentication/Service/authentication';
import { Router } from '@angular/router';

export const AuthInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthenticationService);
  const router = inject(Router);

  const token = auth.getToken();

  // attach token if exists
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        return auth.refreshToken().pipe(
          switchMap(() => {
            const newToken = auth.getToken();
            if (!newToken) return throwError(() => error);

            const newReq = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` },
            });

            return next(newReq);
          }),
          catchError((err) => {
            auth.logout();
            router.navigate(['/login']);
            return throwError(() => err);
          })
        );
      }

      return throwError(() => error);
    })
  );
};
