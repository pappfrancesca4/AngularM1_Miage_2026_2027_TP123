import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly submitting = signal(false);
  
  // Les règles reprennent celles du backend : nom de 2 caractères minimum
  // (models/User.js) et mot de passe de 8 caractères minimum (app.js).
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

    submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set('');
    this.submitting.set(true);
    const values = this.form.getRawValue();

    this.auth.register(values.name, values.email, values.password).subscribe({
      next: () => {
        console.debug('[RegisterPage] Inscription réussie');
        this.submitting.set(false);
        void this.router.navigateByUrl('/profile');
      },
      error: (error: HttpErrorResponse) => {
        console.error('[RegisterPage] Échec de l’inscription', error.status, error.error?.message);
        this.submitting.set(false);
        // 409 = email déjà utilisé (voir API_CONTRACT.md).
        this.error.set(
          error.status === 409
            ? 'Cet email est déjà utilisé. Connectez-vous ou choisissez un autre email.'
            : error.status === 0
              ? 'Serveur injoignable : vérifiez que le backend est lancé.'
              : (error.error?.message ?? 'Erreur d’inscription'),
        );
      },
    });
  }
}
