import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let auth: AuthService;

  const fakeRoute = {} as ActivatedRouteSnapshot;
  const fakeState = {} as RouterStateSnapshot;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
      ],
    });
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => localStorage.clear());

  it('redirige vers /login quand aucun token', () => {
    auth.token.set(null);

    const result = TestBed.runInInjectionContext(() =>
      authGuard(fakeRoute, fakeState)
    );

    expect(result instanceof UrlTree).toBe(true);
  });

  it("autorise l'accès quand un token valide existe", () => {
    auth.token.set('valid_jwt');

    const result = TestBed.runInInjectionContext(() =>
      authGuard(fakeRoute, fakeState)
    );

    expect(result).toBe(true);
  });
});
