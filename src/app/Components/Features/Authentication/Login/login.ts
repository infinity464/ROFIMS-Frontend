import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { DialogModule } from 'primeng/dialog';

import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { AuthenticationService } from '../Service/authentication';
import { UserMenuService } from '@/services/user-menu.service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { IdentityUserRabUnitAccessService } from '@/services/identity-user-rab-unit-access.service';
import { AppFloatingConfigurator } from '@/layout/component/app.floatingconfigurator';

@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
    RouterModule,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    PasswordModule,
    RippleModule,
    DialogModule,
    ToastModule,
    AppFloatingConfigurator
  ],
  providers: [MessageService],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login implements OnInit {
  email = '';
  password = '';
  checked = false;

  isLoading = false;

  /** Forgot password dialog */
  forgotPasswordVisible = false;
  forgotStep: 'request' | 'reset' = 'request';
  forgotEmail = '';
  forgotToken = '';
  forgotNewPassword = '';
  forgotConfirmPassword = '';
  forgotLoading = false;
  forgotRequestSent = false;

  constructor(
    private auth: AuthenticationService,
    private router: Router,
    private messageService: MessageService,
    private userMenuService: UserMenuService,
    private memberTypeAccess: IdentityUserMemberTypeAccessService,
    private rabUnitAccess: IdentityUserRabUnitAccessService
  ) {}

  ngOnInit(): void {
    const remembered = this.auth.getRememberedEmail();
    if (remembered) {
      this.email = remembered;
      this.checked = true;
    }
  }

  onLogin(): void {
    if (this.isLoading) return;
    this.isLoading = true;

    this.auth.login(this.email, this.password).subscribe({
      next: (res) => {
        if (!res?.token) {
          this.isLoading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Login Failed',
            detail: 'Invalid response. Please try again.',
            life: 3000
          });
          return;
        }
        if (this.checked) {
          this.auth.setRememberMeEmail(this.email);
        } else {
          this.auth.setRememberMeEmail(null);
        }

        // Cache this user's allowed member-type and RAB-unit IDs so other screens don't refetch.
        // Fire-and-forget: errors are swallowed inside the services; navigation proceeds regardless.
        if (res.userId) {
          this.memberTypeAccess.cacheForUser(res.userId).subscribe();
          this.rabUnitAccess.cacheForUser(res.userId).subscribe();
        }

        // Load user menus based on role, then navigate
        this.userMenuService.loadUserMenus(res.roleId).subscribe({
          next: (menus) => {
            this.userMenuService.storeMenus(menus);
            this.isLoading = false;
            this.messageService.add({
              severity: 'success',
              summary: 'Login Successful',
              detail: 'Welcome back! Redirecting to dashboard...',
              life: 2000
            });
            setTimeout(() => this.router.navigate(['/dashboard']), 500);
          },
          error: () => {
            // Menu load failed — still allow login, sidebar will be empty
            this.isLoading = false;
            this.messageService.add({
              severity: 'success',
              summary: 'Login Successful',
              detail: 'Welcome back! Redirecting to dashboard...',
              life: 2000
            });
            setTimeout(() => this.router.navigate(['/dashboard']), 500);
          }
        });
      },
      error: (err: { status?: number; message?: string; reason?: string }) => {
        this.isLoading = false;
        const detail =
          err?.message ||
          (err?.status === 401
            ? 'Invalid email or password.'
            : err?.status && err.status >= 500
              ? 'Server error. Please try again later.'
              : 'Network error. Please check your connection and try again.');
        const summary = err?.reason === 'UserDisabled' ? 'Account Disabled' : 'Login Failed';
        this.messageService.add({
          severity: 'error',
          summary,
          detail,
          life: 5000
        });
      }
    });
  }

  openForgotPassword(): void {
    this.forgotPasswordVisible = true;
    this.forgotStep = 'request';
    this.forgotEmail = this.email || '';
    this.forgotToken = '';
    this.forgotNewPassword = '';
    this.forgotConfirmPassword = '';
    this.forgotRequestSent = false;
  }

  onForgotRequestSubmit(): void {
    const email = (this.forgotEmail || '').trim();
    if (!email) {
      this.messageService.add({ severity: 'warn', summary: 'Email required', detail: 'Please enter your email address.', life: 3000 });
      return;
    }
    this.forgotLoading = true;
    this.auth.requestForgotPasswordToken(email).subscribe({
      next: (res) => {
        this.forgotLoading = false;
        this.forgotRequestSent = true;
        this.messageService.add({
          severity: res.isSuccess ? 'success' : 'info',
          summary: 'Check your email',
          detail: res.isSuccess ? 'If an account exists, you will receive reset instructions by email.' : (res.message || 'Request sent.'),
          life: 5000
        });
        this.forgotStep = 'reset';
      },
      error: (err: { message?: string }) => {
        this.forgotLoading = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Request failed',
          detail: err?.message ?? 'Could not send reset email. Please try again.',
          life: 5000
        });
      }
    });
  }

  onForgotResetSubmit(): void {
    const email = (this.forgotEmail || '').trim();
    const token = (this.forgotToken || '').trim();
    const newPwd = this.forgotNewPassword;
    const confirm = this.forgotConfirmPassword;
    if (!email || !token) {
      this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Please enter email and the token from your email.', life: 3000 });
      return;
    }
    if (!newPwd || newPwd.length < 6) {
      this.messageService.add({ severity: 'warn', summary: 'Password', detail: 'New password must be at least 6 characters.', life: 3000 });
      return;
    }
    if (newPwd !== confirm) {
      this.messageService.add({ severity: 'warn', summary: 'Password mismatch', detail: 'New password and confirmation do not match.', life: 3000 });
      return;
    }
    this.forgotLoading = true;
    this.auth.resetPassword({ email, resetPasswordToken: token, newPassword: newPwd }).subscribe({
      next: (res) => {
        this.forgotLoading = false;
        this.messageService.add({
          severity: res.isSuccess ? 'success' : 'error',
          summary: res.isSuccess ? 'Password updated' : 'Reset failed',
          detail: res.message,
          life: 5000
        });
        if (res.isSuccess) {
          this.forgotPasswordVisible = false;
        }
      },
      error: (err: { message?: string }) => {
        this.forgotLoading = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Reset failed',
          detail: err?.message ?? 'Password reset failed. Please check the token and try again.',
          life: 5000
        });
      }
    });
  }

  closeForgotPassword(): void {
    this.forgotPasswordVisible = false;
    this.forgotStep = 'request';
    this.forgotRequestSent = false;
  }
}
