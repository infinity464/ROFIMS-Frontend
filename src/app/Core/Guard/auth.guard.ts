import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, CanActivateChild, Router, RouterStateSnapshot } from '@angular/router';
import { AuthenticationService } from '@/Components/Features/Authentication/Service/authentication';
import { UserMenuService } from '@/services/user-menu.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate, CanActivateChild {
  constructor(
    private auth: AuthenticationService,
    private router: Router,
    private userMenuService: UserMenuService
  ) {}

  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
      return false;
    }
    return this.checkViewPermission(state.url);
  }

  canActivateChild(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
      return false;
    }
    return this.checkViewPermission(state.url);
  }

  private checkViewPermission(url: string): boolean {
    const normalize = (p: string) => p.split('?')[0].replace(/^\/+|\/+$/g, '').toLowerCase();
    const path = normalize(url);

    // Always allow dashboard, change-password and root
    if (!path || path === 'dashboard' || path === 'change-password') return true;

    // If menu not found in stored menus, allow access (menu may not be registered)
    const menus = this.userMenuService.getStoredMenus();
    const hasMenu = menus.some(m => m.routerName && normalize(m.routerName) === path);
    if (!hasMenu) return true;

    const perms = this.userMenuService.getPermissionsByRoute(url);
    if (!perms.canView) {
      this.router.navigate(['/dashboard']);
      return false;
    }
    return true;
  }
}
