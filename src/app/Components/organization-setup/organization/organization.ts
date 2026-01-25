import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Fluid } from "primeng/fluid";

@Component({
    selector: 'app-organization',
    imports: [Fluid, ReactiveFormsModule],
    templateUrl: './organization.html',
    styleUrl: './organization.scss'
})
export class Organization implements OnInit {
    ngOnInit(): void {
        // Initialization logic here
    }
}
