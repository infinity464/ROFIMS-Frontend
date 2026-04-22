import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { EmpService } from '@/services/emp-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { SharedService } from '@/shared/services/shared-service';

/**
 * Blocks access to employee-tab routes when the employee's MemberType
 * is not in the current user's allowed list (from IdentityUserMemberTypeAccess).
 *
 * Only enforces when the URL carries ?id=<employeeId>. When no id is present,
 * the page will render and its in-component check will kick in once an
 * employee is chosen via the search widget.
 *
 * Fail-open on every branch that cannot decide (no user id, cache miss + API
 * failure, employee not found, employee has no memberType): we let the route
 * load rather than block legitimate users on infra issues.
 */
@Injectable({ providedIn: 'root' })
export class MemberTypePermissionGuard implements CanActivate {
    constructor(
        private router: Router,
        private empService: EmpService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private sharedService: SharedService
    ) {}

    canActivate(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {
        const rawId = route.queryParamMap.get('id');
        if (!rawId) return of(true);

        const employeeId = Number(rawId);
        if (!Number.isFinite(employeeId) || employeeId <= 0) return of(true);

        const userId = this.sharedService.getCurrentUserId?.() ?? null;

        return this.resolveAllowedIds(userId).pipe(
            switchMap((allowed) =>
                this.empService.getEmployeeSearchInfo(employeeId).pipe(
                    map((info) => {
                        if (!info) return true;
                        const memberTypeId =
                            (info as { memberTypeId?: number; MemberTypeId?: number }).memberTypeId ??
                            (info as { memberTypeId?: number; MemberTypeId?: number }).MemberTypeId ??
                            null;
                        if (memberTypeId == null) return true;
                        if (allowed === null) return true;
                        if (allowed.includes(memberTypeId)) return true;
                        return this.router.createUrlTree(['/emp-list'], {
                            queryParams: { denied: 'memberType' }
                        });
                    }),
                    catchError(() => of(true))
                )
            )
        );
    }

    private resolveAllowedIds(userId: string | null): Observable<number[] | null> {
        if (!userId) return of(null);
        const cached = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (cached !== null) return of(cached);
        return this.memberTypeAccess.cacheForUser(userId).pipe(
            map((ids) => (Array.isArray(ids) ? ids : [])),
            catchError(() => of([] as number[]))
        );
    }
}
