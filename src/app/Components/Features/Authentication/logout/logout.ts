import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthenticationService } from '../Service/authentication';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { RippleModule } from 'primeng/ripple';

@Component({
  selector: 'app-logout',
  standalone: true,
  imports: [CardModule, ButtonModule, RippleModule],
  templateUrl: './logout.html',
  styleUrl: './logout.scss',
})
export class Logout {
  constructor(
    private auth: AuthenticationService,
    private router: Router
  ) {}

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
