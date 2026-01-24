import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';

import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { AuthenticationService } from '../Service/authentication';
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
    ToastModule,
    AppFloatingConfigurator
  ],
  providers: [MessageService],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  email = '';
  password = '';
  checked = false;

  isLoading = false;

  constructor(
    private auth: AuthenticationService,
    private router: Router,
    private messageService: MessageService
  ) {}

 onLogin() {
  this.isLoading = true;

  this.auth.login(this.email, this.password).subscribe({
    next: (res) => {
      this.isLoading = false;

      // ✅ token missing/null check
      if (!res?.token) {
        this.messageService.add({
          severity: 'error',
          summary: 'Login Failed',
          detail: 'Token not found. Please try again.',
          life: 3000
        });
        return;
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Login Successful',
        detail: 'Welcome back! Redirecting to dashboard...',
        life: 2000
      });

      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 800);
    },

    error: (err) => {
      this.isLoading = false;

      this.messageService.add({
        severity: 'error',
        summary: 'Login Failed',
        detail: err?.error?.message || 'Invalid email or password. Try again.',
        life: 3000
      });
    }
  });
}

}
