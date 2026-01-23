import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map, throwError } from 'rxjs';
import { environment } from '../../../../Core/Environments/environment';
import { LoginResponse } from '../Model/login-response.model';
import { catchError} from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthenticationService {
  private loginUrl = `${environment.apis.auth}/Identity/GetToken`;

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
  return this.http.post<LoginResponse>(this.loginUrl, { email, password }).pipe(
    tap((res) => {
      localStorage.setItem('auth', JSON.stringify(res));
      localStorage.setItem('token', res.token);
      localStorage.setItem('refreshToken', res.refreshToken);
    }),
    catchError((err) => {
      const msg =
        err?.error?.message ||
        err?.error ||
        'Login failed. Please check your email & password.';
      return throwError(() => new Error(msg));
    })
  );
}

  refreshToken(): Observable<LoginResponse> {
    const refreshToken = localStorage.getItem('refreshToken');

    return this.http.post<LoginResponse>(this.loginUrl, { refreshToken }).pipe(
      map((res) => {
        if (!res?.token || res.token.trim() === '') {
          throw new Error('Session expired. Please login again.');
        }
        return res;
      }),
      tap((res) => {
        localStorage.setItem('auth', JSON.stringify(res));
        localStorage.setItem('token', res.token);
        localStorage.setItem('refreshToken', res.refreshToken);
      })
    );
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  logout(): void {
    localStorage.clear();
  }
}
