import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 5, search = '') {
    const params: Record<string, string | number> = { page, limit };
    if (search) params['search'] = search;
    return this.http.get<Page<Track>>('/api/tracks', { params });
  }

  upload(file: File, title: string, cover?: File) {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    if (cover) body.append('coverImage', cover);
    // reportProgress + observe:'events' : au lieu d'une seule réponse finale,
    // l'Observable émet des événements successifs, dont la progression d'upload.
    return this.http.post<Track>('/api/tracks', body, {
      reportProgress: true,
      observe: 'events',
    });
  }

  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  cover(id: string) {
    return this.http.get(`/api/tracks/${id}/cover`, {
      responseType: 'blob',
    });
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }
}
