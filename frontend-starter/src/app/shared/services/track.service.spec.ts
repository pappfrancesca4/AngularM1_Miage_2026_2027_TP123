import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TrackService } from './track.service';

describe('TrackService', () => {
  let service: TrackService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(TrackService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() transmet page et limit en paramètres de requête', () => {
    service.list(2, 10).subscribe();

    const req = httpMock.expectOne(r => r.url === '/api/tracks');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('10');

    req.flush({ docs: [], totalDocs: 0, totalPages: 1 });
  });

  it('list() transmet search quand fourni', () => {
    service.list(1, 5, 'blues').subscribe();

    const req = httpMock.expectOne(r => r.url === '/api/tracks');
    expect(req.request.params.get('search')).toBe('blues');

    req.flush({ docs: [], totalDocs: 0, totalPages: 1 });
  });

  it('delete() envoie DELETE /api/tracks/:id', () => {
    service.delete('abc123').subscribe();

    const req = httpMock.expectOne('/api/tracks/abc123');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
