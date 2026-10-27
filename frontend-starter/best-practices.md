# Angular 22 coding instructions

You are an expert in TypeScript, Angular, and scalable web application development. Write functional, maintainable, performant, and accessible code.

## TypeScript and Angular

- Use strict type checking and avoid `any`; use `unknown` when the type is uncertain.
- Use standalone components. Do not set `standalone: true`: it is the default in Angular 22.
- Do not explicitly set `ChangeDetectionStrategy.OnPush`: it is the default in Angular 22.
- Use Signals for local state, `computed()` for derived state, and `inject()` for dependency injection.
- Prefer lazy-loaded feature routes where appropriate.
- Use native control flow (`@if`, `@for`, `@switch`) instead of structural directives.
- Prefer Reactive Forms (or Signal Forms for new forms) and keep templates simple.
- Use external templates/styles when a component is not trivial; paths are relative to its TypeScript file.

## Components and services

- Keep components small and focused on one responsibility.
- Use `input()` and `output()` functions instead of decorators for new APIs.
- Use `providedIn: 'root'` for singleton services.
- Organize reusable services, guards, interceptors, and models under `src/app/shared`.
- Never put passwords, API keys, or JWT secrets in Angular source code.

## Accessibility

- Follow WCAG AA minimums, including keyboard focus, labels, semantic HTML, and sufficient color contrast.
- Use `NgOptimizedImage` for static images.

## AI assistant workflow — required steps for every feature

Before writing any code, the assistant must follow these steps for **every** feature, no matter how small.

### Step 1 — Explain the plan and confirm

Before touching any file, explain:
1. **What the feature does** — one sentence describing the user-facing behaviour.
2. **Which files will be changed** — list every file (component, service, backend route, model, CSS, contract).
3. **Architecture diagram** — a text diagram showing the data flow end to end, for example:

```
User types in search input
  → FormControl.valueChanges (debounceTime 300ms, distinctUntilChanged)
  → page.set(1) + load()
    → TrackService.list(page, limit, search)
      → GET /api/tracks?page=1&limit=5&search=blues   [HTTP, JWT]
        → MongoDB: { title: { $regex: "blues", $options: "i" } }
        → { items: [...], pages: 3 }
      → tracks.set(items), pages.set(pages)
  → @for renders updated list
```

4. **Wait for confirmation** — do not write any code until the user says "yes" or "ok".

### Step 2 — Explain every code change line by line

After the user confirms, make the changes file by file. For each file:
- State the filename and which section was changed.
- Go through every line or block that was added or modified and explain **what it does** and **why it is written that way** — not just a summary of the file. If a line could have been written differently, explain why this version was chosen.
- Flag any trade-off or future limitation.

Example explanation format:

> **`track.service.ts` — `list()` method**
>
> `search = ''` — third parameter with an empty string default so existing callers don't need to pass it.
>
> `if (search) params['search'] = search` — the field is only added to the params object when non-empty. Why: passing `search=` as an empty string would reach the backend and trigger a regex match against `""`, which matches every document — adding noise without filtering anything. Omitting it keeps the URL clean and skips the regex entirely.

### Step 3 — Write the feature into the active rapport

After implementing and explaining a feature, add a section to the active `RAPPORT_TP{n}.md` (or `RAPPORT_FEATURE_{name}.md` for free development). The section must include:

- The feature name and a one-sentence description of what it does.
- The architecture diagram shown in Step 1.
- The file-by-file explanation written in Step 2: every file that changed, what was modified, why that approach was chosen, what the trade-offs are.
- The verification result (build output, manual test scenarios and outcomes).

**Priority is completeness and explanation, not format.** The goal is to note every change and explain in detail why each decision was made. Short code snippets are acceptable when they help illustrate a specific point (a method signature, a key expression, a configuration line) — what to avoid is pasting large blocks of code without any explanation around them. The explanation is what matters, not the presence or absence of code.

**Also update `RAPPORT_IA_MODELE.md`** after each feature with the following sections:

- **Déclenchement** — what was asked and why, in proper written French.
- **Plan proposé par l'agent** — what the agent said it would do before touching any file.
- **Erreurs ou propositions corrigées** — every correction round, described as a human–AI interaction: what was observed in the browser, how it was reported to the agent, what the agent proposed, whether it was applied and worked or needed another iteration. Each round gets its own paragraph. Reference `RAPPORT_TP2.md` for technical details.
- **Fichiers effectivement modifiés** — the final list of changed files as a table.
- **Ce que l'étudiant sait expliquer sans l'agent** — bullet list of concepts now understood independently.

**When writing rapport IA: never copy prompts word for word.** The conversation uses informal, spoken language. A school report requires proper written French. Describe what was asked and why, not the exact wording of the message. For example, instead of copying « t as rien corrige ca rentre encore », write: "Une deuxième correction était nécessaire car le problème de superposition persistait après la première tentative."

This keeps both rapports in sync with the code without needing a separate documentation pass.

### Step 4 — Verify before closing

After making the changes, always run:

```bash
cd frontend-starter && ng build
```

Report zero TypeScript errors and zero Angular warnings before marking the feature done.

---

## Testing — every feature must be tested

Every feature added to the project must be verified at the three levels below, in order.

### 1. Clean build

Before considering a feature complete, run:

```bash
cd frontend-starter
ng build
```

Zero TypeScript errors and zero Angular warnings is the minimum bar. A passing build does not guarantee correctness, but a failing build means the feature is incomplete.

### 2. Manual browser testing

For each feature, test at minimum:

- **Happy path:** the action produces the expected result (UI updated, correct HTTP request, 2xx status).
- **Error cases:** invalid form, unreachable server (status 0), not found (404), unauthorized (401), bad input (400/409).
- **Loading state:** the button is disabled during the request, the indicator appears, then disappears.
- **Persistence:** hard reload (F5) — is the state consistent?

Always open **DevTools → Network tab** (filter XHR/Fetch) and check for each request:
- method and URL;
- request body (Request Payload);
- response status;
- presence or absence of the `Authorization` header.

Also open the **console** to confirm the absence of unexpected errors.

### 3. Unit tests (`.spec.ts`)

For services and guards, create a `.spec.ts` file in the same folder as the file under test. Simple components can be tested manually; services with HTTP logic or guards with conditions must have an automated test. Run:

```bash
ng test
```

A minimal unit test for a service verifies:
- that the correct URL and HTTP method are used;
- that the Signal or return value is correct on success;
- that the error is propagated on failure.

> **Priority:** build → manual test → unit test. Do not block a delivery on missing unit tests, but never leave a feature without a documented manual test.

---

## Progress reports

### TP 1, 2 and 3

Create a `RAPPORT_TP{n}.md` file at the repository root for each TP (e.g. `RAPPORT_TP1.md`, `RAPPORT_TP2.md`, `RAPPORT_TP3.md`). This file must contain:

- answers to the questions in `SUJET_ETUDIANT_TP{n}.md` (missions, mapping, routes, mechanism explanations);
- the list of modified files and the role of each change;
- verifications performed (build, Network, manual tests);
- proof of working (DevTools screenshots, scenario descriptions);
- a link to `RAPPORT_IA_MODELE.md` for the AI usage section.

### After the guided TPs — free development

Once the TP assignment no longer dictates the content, continue documenting work in regular reports. Two accepted formats:

**Per feature:** create a `RAPPORT_FEATURE_{name}.md` file for each new feature added (e.g. `RAPPORT_FEATURE_player.md`). Describe:
- the functional goal and the files involved;
- the technical choices made and the alternatives discarded;
- the API routes created or modified (`API_CONTRACT.md` must be updated at the same time);
- verifications and proof of working.

**Per working day:** keep a `JOURNAL.md` file at the root with one entry per session, in the format:
```
## YYYY-MM-DD
- Feature worked on: …
- Files modified: …
- Problems encountered and solutions: …
- What remains to do: …
```

In both cases, update `RAPPORT_IA_MODELE.md` with the prompts used, the files read or modified by the assistant, and the verifications performed without the agent.
