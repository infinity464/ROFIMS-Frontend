import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { AuthenticationService } from '../Service/authentication';

@Component({
    selector: 'app-change-password',
    imports: [FormsModule, ButtonModule, PasswordModule, ToastModule],
    providers: [MessageService],
    templateUrl: './change-password.html'
})
export class ChangePassword {
    currentPassword = '';
    newPassword = '';
    confirmPassword = '';
    isLoading = false;
    currentPasswordTouched = false;

    constructor(
        private auth: AuthenticationService,
        private messageService: MessageService,
        private router: Router
    ) {}

    get hasUppercase(): boolean {
        return /[A-Z]/.test(this.newPassword);
    }

    get hasLowercase(): boolean {
        return /[a-z]/.test(this.newPassword);
    }

    get hasNumber(): boolean {
        return /[0-9]/.test(this.newPassword);
    }

    get hasSpecial(): boolean {
        return /[^A-Za-z0-9]/.test(this.newPassword);
    }

    get passwordErrors(): string[] {
        const errors: string[] = [];
        const pwd = this.newPassword;
        if (!pwd) return errors;
        if (pwd.length < 8) errors.push('At least 8 characters');
        if (!this.hasUppercase) errors.push('At least one uppercase letter');
        if (!this.hasLowercase) errors.push('At least one lowercase letter');
        if (!this.hasNumber) errors.push('At least one number');
        if (!this.hasSpecial) errors.push('At least one special character');
        return errors;
    }

    get isPasswordStrong(): boolean {
        return this.newPassword.length > 0 && this.passwordErrors.length === 0;
    }

    get passwordsMatch(): boolean {
        return this.newPassword === this.confirmPassword && this.confirmPassword.length > 0;
    }

    get strengthLevel(): number {
        if (!this.newPassword) return 0;
        let score = 0;
        if (this.newPassword.length >= 8) score++;
        if (this.hasUppercase) score++;
        if (this.hasLowercase) score++;
        if (this.hasNumber || this.hasSpecial) score++;
        if (this.hasNumber && this.hasSpecial) score++;
        return Math.min(score, 4);
    }

    get strengthLabel(): string {
        switch (this.strengthLevel) {
            case 0:
            case 1:
                return 'Weak';
            case 2:
                return 'Fair';
            case 3:
                return 'Good';
            case 4:
                return 'Strong';
            default:
                return '';
        }
    }

    get canSubmit(): boolean {
        return this.currentPassword.length > 0 && this.isPasswordStrong && this.passwordsMatch && !this.isLoading;
    }

    onCurrentPasswordBlur(): void {
        this.currentPasswordTouched = true;
    }

    onCancel(): void {
        this.router.navigate(['/dashboard']);
    }

    onSubmit(): void {
        this.currentPasswordTouched = true;
        if (!this.canSubmit) return;

        if (this.currentPassword === this.newPassword) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Same password',
                detail: 'New password must be different from the current password.',
                life: 4000
            });
            return;
        }

        this.isLoading = true;
        this.auth
            .changePassword({
                currentPassword: this.currentPassword,
                newPassword: this.newPassword
            })
            .subscribe({
                next: (res) => {
                    this.isLoading = false;
                    this.messageService.add({
                        severity: res.isSuccess ? 'success' : 'error',
                        summary: res.isSuccess ? 'Password updated' : 'Failed',
                        detail: res.message,
                        life: 4000
                    });
                    if (res.isSuccess) {
                        this.currentPassword = '';
                        this.newPassword = '';
                        this.confirmPassword = '';
                        this.currentPasswordTouched = false;
                    }
                },
                error: (err: { message?: string }) => {
                    this.isLoading = false;
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.message ?? 'Failed to change password. Please try again.',
                        life: 5000
                    });
                }
            });
    }
}
