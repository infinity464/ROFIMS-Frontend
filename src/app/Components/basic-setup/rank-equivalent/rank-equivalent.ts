import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-rank-equivalent',
  imports: [ReactiveFormsModule],
  templateUrl: './rank-equivalent.html',
  styleUrl: './rank-equivalent.scss',
})
export class RankEquivalent {

    rankEquvilentForm! :FormGroup;
    constructor(private fb: FormBuilder){}


}
