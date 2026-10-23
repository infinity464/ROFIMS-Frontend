import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { APP_INITIALIZER, ApplicationConfig } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withEnabledBlockingInitialNavigation, withInMemoryScrolling } from '@angular/router';
import Aura from '@primeuix/themes/aura';
import { providePrimeNG } from 'primeng/config';
import { appRoutes } from './app.routes';
import { AuthInterceptor } from '@/Core/Interceptor/auth.inspector';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SessionPolicyService } from '@/shared/services/session-policy.service';
import { IdleTimeoutService } from '@/shared/services/idle-timeout.service';
import { AuthenticationService } from '@/Components/Features/Authentication/Service/authentication';
import { catchError, of } from 'rxjs';

/**
 * Bootstraps:
 *   - Refreshes the cached session policy if a token is already present.
 *   - Starts the idle-timeout watcher (it self-gates on `auth.isLoggedIn()` per tick).
 *
 * Failures are swallowed so a flaky network can't block app boot.
 *
 * Note: when LogoutOnBrowserClose is on, opening a new tab via URL paste means a fresh login
 * (sessionStorage is per-tab). Cross-tab auth sync was tried and removed — accept the trade-off.
 */
function initSession(
    auth: AuthenticationService,
    policy: SessionPolicyService,
    idle: IdleTimeoutService
) {
    return () => {
        idle.start();
        if (auth.isLoggedIn()) {
            return policy.load().pipe(catchError(() => of(null))).toPromise();
        }
        return Promise.resolve();
    };
}

export const appConfig: ApplicationConfig = {
    providers: [
        provideHttpClient(withInterceptors([AuthInterceptor])),
        provideRouter(appRoutes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }), withEnabledBlockingInitialNavigation()),
        // provideHttpClient(withFetch()),
        provideAnimationsAsync(),
        providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: '.app-dark' } } }),
        MessageService,
        ConfirmationService,
        {
            provide: APP_INITIALIZER,
            useFactory: initSession,
            deps: [AuthenticationService, SessionPolicyService, IdleTimeoutService],
            multi: true
        }
    ]
};
