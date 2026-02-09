import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map, throwError } from 'rxjs';
import { environment } from '../../../../Core/Environments/environment';
import { LoginResponse } from '../Model/login-response.model';
import { catchError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthenticationService {
  private readonly loginUrl = `${environment.apis.auth}/Identity/GetToken`;
  private readonly refreshUrl = `${environment.apis.auth}/Identity/GetRefreshToken`;

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(this.loginUrl, { email, password }).pipe(
      tap((res) => {
        localStorage.setItem('auth', JSON.stringify(res));
        localStorage.setItem('token', res.token);
        localStorage.setItem('refreshToken', res.refreshToken);
      }),
      catchError((err) => {
        // Never expose password or sensitive server details; use safe user-facing messages
        const status = err?.status;
        const msg =
          status === 401
            ? 'Invalid email or password.'
            : status >= 500
              ? 'Server error. Please try again later.'
              : status === 0 || err?.message === 'Http failure response'
                ? 'Network error. Please check your connection and try again.'
                : err?.error?.message && typeof err.error.message === 'string' && !/password|credential/i.test(err.error.message)
                  ? err.error.message
                  : 'Login failed. Please check your email and password.';
        return throwError(() => ({ status, message: msg }));
      })
    );
  }

  refreshToken(): Observable<LoginResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      return throwError(() => ({ status: 401, message: 'Session expired. Please login again.' }));
    }

    return this.http.post<{ token: string; refreshToken: string }>(this.refreshUrl, { refreshToken }).pipe(
      map((res) => {
        if (!res?.token || res.token.trim() === '') {
          throw new Error('Session expired. Please login again.');
        }
        return res as LoginResponse;
      }),
      tap((res) => {
        const existing = localStorage.getItem('auth');
        const merged = existing
          ? { ...JSON.parse(existing), token: res.token, refreshToken: res.refreshToken }
          : res;
        localStorage.setItem('auth', JSON.stringify(merged));
        localStorage.setItem('token', res.token);
        localStorage.setItem('refreshToken', res.refreshToken);
      }),
      catchError(() => {
        return throwError(() => ({ status: 401, message: 'Session expired. Please login again.' }));
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
