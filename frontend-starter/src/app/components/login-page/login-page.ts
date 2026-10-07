import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly submitting = signal(false);
  readonly form = new FormGroup({
    email: new FormControl('demo@example.com', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('Demo1234!', {
      nonNullable: true,
      validators: [Validators.required],
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
    this.auth.login(values.email, values.password).subscribe({
      next: () => {
        console.debug('[LoginPage] Connexion réussie');
        this.submitting.set(false);
        void this.router.navigateByUrl('/tracks');
      },
      error: (error: HttpErrorResponse) => {
        // On logue l'objet erreur (statut, URL), jamais le mot de passe.
        console.error('[LoginPage] Échec de connexion', error.status, error.error?.message);
        this.submitting.set(false);
        this.error.set(
          error.status === 0
            ? 'Serveur injoignable : vérifiez que le backend est lancé.'
            : (error.error?.message ?? 'Erreur de connexion'),
        );
      },
    });
  }
}
