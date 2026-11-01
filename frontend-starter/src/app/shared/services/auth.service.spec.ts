import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('login() envoie POST /api/auth/login avec email et mot de passe', () => {
    service.login('user@example.com', 'secret123').subscribe();

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'user@example.com', password: 'secret123' });

    req.flush({ token: 'jwt_token', user: { id: '1', name: 'Test', email: 'user@example.com' } });
  });

  it('login() stocke le token reçu dans le signal token()', () => {
    service.login('user@example.com', 'secret123').subscribe();

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ token: 'jwt_token', user: { id: '1', name: 'Test', email: 'user@example.com' } });

    expect(service.token()).toBe('jwt_token');
  });
});
