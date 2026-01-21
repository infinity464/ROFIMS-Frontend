import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
// import { AuthenticationService } from '@/Components/Features/Authentication/Service/authentication.service';
import { AuthenticationService } from '@/Components/Features/Authentication/Service/authentication';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private auth: AuthenticationService, private router: Router) {}

  canActivate(): boolean {
    if (this.auth.isLoggedIn()) return true;

    this.router.navigate(['/login']);
    return false;
  }
}
