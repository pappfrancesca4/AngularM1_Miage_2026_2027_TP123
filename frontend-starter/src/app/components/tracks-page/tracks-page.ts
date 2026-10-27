import { Component, inject, OnDestroy, signal } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];
const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Component({
  imports: [ReactiveFormsModule, MatPaginatorModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly limit = signal(5);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly loadError = signal('');

  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal(false);
  readonly uploadProgress = signal(0);
  readonly fileError = signal('');

  readonly currentTrack = signal<Track | null>(null);
  readonly audioUrl = signal('');
  readonly audioError = signal('');

  readonly coverUrls = signal<Record<string, string>>({});
  readonly coverError = signal('');

  readonly confirmId = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);

  readonly title = new FormControl('', { nonNullable: true });
  readonly search = new FormControl('', { nonNullable: true });
  file?: File;
  coverFile?: File;
  private fileInput?: HTMLInputElement;
  private coverInput?: HTMLInputElement;
  private searchSub?: Subscription;

  constructor() {
    this.load();
    this.searchSub = this.search.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    ).subscribe(() => {
      this.page.set(1);
      this.load();
    });
  }

  ngOnDestroy(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
    this.revokeCovers();
    this.searchSub?.unsubscribe();
  }

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fileInput = input;
    const selected = input.files?.[0];
    this.fileError.set('');

    if (!selected) return;

    if (!ACCEPTED_TYPES.includes(selected.type)) {
      this.fileError.set('Format non accepté. Utilisez MP3, WAV, OGG ou M4A.');
      this.file = undefined;
      input.value = '';
      return;
    }

    if (selected.size > MAX_SIZE_BYTES) {
      this.fileError.set('Fichier trop volumineux (maximum 25 Mo).');
      this.file = undefined;
      input.value = '';
      return;
    }

    this.file = selected;
    console.debug('[TracksPage] Fichier sélectionné', selected.name, selected.type, selected.size);
  }

  chooseCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.coverInput = input;
    const selected = input.files?.[0];
    this.coverError.set('');

    if (!selected) {
      this.coverFile = undefined;
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(selected.type)) {
      this.coverError.set('Image non acceptée. Utilisez JPEG, PNG ou WebP.');
      this.coverFile = undefined;
      input.value = '';
      return;
    }

    if (selected.size > MAX_IMAGE_BYTES) {
      this.coverError.set('Image trop volumineuse (maximum 5 Mo).');
      this.coverFile = undefined;
      input.value = '';
      return;
    }

    this.coverFile = selected;
    console.debug('[TracksPage] Couverture sélectionnée', selected.name, selected.type, selected.size);
  }

  private revokeCovers(): void {
    for (const url of Object.values(this.coverUrls())) {
      URL.revokeObjectURL(url);
    }
    this.coverUrls.set({});
  }

  private loadCovers(tracks: Track[]): void {
    for (const track of tracks) {
      if (!track.hasCover) continue;
      this.service.cover(track.id).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          this.coverUrls.update((map) => ({ ...map, [track.id]: url }));
        },
        error: (error) => {
          console.error('[TracksPage] Couverture illisible', track.id, error);
        },
      });
    }
  }

  load(): void {
    this.loadError.set('');
    this.loading.set(true);
    this.service.list(this.page(), this.limit(), this.search.value).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées', response.docs.length);
        this.revokeCovers();
        this.tracks.set(response.docs);
        this.pages.set(response.totalPages);
        this.total.set(response.totalDocs);
        this.loading.set(false);
        this.loadCovers(response.docs);
      },
      error: (error) => {
        console.error('[TracksPage] Chargement impossible', error);
        this.loadError.set(error.error?.message ?? 'Impossible de charger les pistes.');
        this.loading.set(false);
      },
    });
  }

  pageChange(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.load();
  }

  changePageSize(size: number): void {
    this.limit.set(size);
    this.page.set(1);
    this.load();
  }

  upload(): void {
    if (!this.file) return;

    this.uploadError.set('');
    this.uploadSuccess.set(false);
    this.uploading.set(true);
    this.uploadProgress.set(0);

    this.service.upload(this.file, this.title.value || this.file.name, this.coverFile).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          // loaded/total = octets envoyés sur octets totaux → pourcentage.
          this.uploadProgress.set(Math.round((event.loaded / event.total) * 100));
        } else if (event.type === HttpEventType.Response && event.body) {
          const track = event.body;
          console.debug('[TracksPage] Piste envoyée', track.id);
          this.uploading.set(false);
          this.uploadSuccess.set(true);
          this.title.setValue('');
          this.file = undefined;
          this.coverFile = undefined;
          this.coverError.set('');
          if (this.fileInput) this.fileInput.value = '';
          if (this.coverInput) this.coverInput.value = '';
          this.page.set(1);
          this.load();
        }
      },
      error: (error) => {
        console.error('[TracksPage] Envoi impossible', error);
        this.uploading.set(false);
        this.uploadError.set(error.error?.message ?? 'Erreur lors de l\'envoi.');
      },
    });
  }

  play(track: Track): void {
    this.audioError.set('');
    this.currentTrack.set(track);

    this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Audio chargé', track.id);
        const previousUrl = this.audioUrl();
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        this.audioUrl.set(URL.createObjectURL(blob));
      },
      error: (error) => {
        console.error('[TracksPage] Lecture impossible', error);
        this.currentTrack.set(null);
        this.audioError.set('Impossible de lire ce morceau.');
      },
    });
  }

  askDelete(id: string): void {
    this.confirmId.set(id);
  }

  cancelDelete(): void {
    this.confirmId.set(null);
  }

  confirmDelete(id: string): void {
    this.confirmId.set(null);
    this.deletingId.set(id);

    this.service.delete(id).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée', id);
        this.deletingId.set(null);
        if (this.currentTrack()?.id === id) {
          const url = this.audioUrl();
          if (url) URL.revokeObjectURL(url);
          this.audioUrl.set('');
          this.currentTrack.set(null);
        }
        if (this.tracks().length === 1 && this.page() > 1) {
          this.page.set(this.page() - 1);
        }
        this.load();
      },
      error: (error) => {
        console.error('[TracksPage] Suppression impossible', error);
        this.deletingId.set(null);
      },
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
