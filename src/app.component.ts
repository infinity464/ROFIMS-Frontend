import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterModule, Toast, ConfirmDialog],
    template: ` <router-outlet>
        <p-toast position="center" [life]="2000"></p-toast>
        <p-confirm-dialog></p-confirm-dialog>
    </router-outlet>`
})
export class AppComponent {}
