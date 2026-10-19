import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly loadError = signal('');

  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal(false);
  readonly fileError = signal('');

  readonly currentTrack = signal<Track | null>(null);
  readonly audioUrl = signal('');
  readonly audioError = signal('');

  readonly title = new FormControl('', { nonNullable: true });
  file?: File;
  private fileInput?: HTMLInputElement;

  constructor() {
    this.load();
  }

  ngOnDestroy(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
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

  load(): void {
    this.loadError.set('');
    this.loading.set(true);
    this.service.list(this.page()).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées', response.items.length);
        this.tracks.set(response.items);
        this.pages.set(response.pages);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('[TracksPage] Chargement impossible', error);
        this.loadError.set(error.error?.message ?? 'Impossible de charger les pistes.');
        this.loading.set(false);
      },
    });
  }

  go(page: number): void {
    this.page.set(page);
    this.load();
  }

  upload(): void {
    if (!this.file) return;

    this.uploadError.set('');
    this.uploadSuccess.set(false);
    this.uploading.set(true);

    this.service.upload(this.file, this.title.value || this.file.name).subscribe({
      next: (track) => {
        console.debug('[TracksPage] Piste envoyée', track.id);
        this.uploading.set(false);
        this.uploadSuccess.set(true);
        this.title.setValue('');
        this.file = undefined;
        if (this.fileInput) this.fileInput.value = '';
        this.page.set(1);
        this.load();
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

  formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
