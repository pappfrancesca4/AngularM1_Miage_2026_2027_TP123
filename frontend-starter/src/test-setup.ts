import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

// Dans les workers vitest, globalThis.localStorage est undefined car le localStorage
// expérimental de Node.js 22 nécessite --localstorage-file. On fournit un polyfill
// en mémoire pour que AuthService puisse appeler localStorage.getItem() sans erreur.
if (typeof globalThis.localStorage === 'undefined') {
  let _store: Record<string, string> = {};
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => _store[k] ?? null,
      setItem: (k: string, v: string) => { _store[k] = String(v); },
      removeItem: (k: string) => { delete _store[k]; },
      clear: () => { _store = {}; },
      get length() { return Object.keys(_store).length; },
      key: (n: number) => Object.keys(_store)[n] ?? null,
    } as Storage,
    writable: true,
    configurable: true,
  });
}

getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
  { errorOnUnknownElements: true, errorOnUnknownProperties: true },
);
