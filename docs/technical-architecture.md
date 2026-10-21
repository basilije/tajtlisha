# Technical Architecture

## Cilj arhitekture

Arhitektura treba da podrzi mali desktop MVP bez servera, ali da ne blokira kasnije dodavanje Windows build-a, dodatnih AI providera i voiceover funkcije.

## Tehnoloski pravac

- Desktop shell: Electron.
- UI: web renderer unutar Electron aplikacije.
- Video/audio obrada: `ffmpeg`.
- AI integracije: modularni provider layer.
- UI internacionalizacija: `i18next`; ako renderer bude React, koristiti `react-i18next`.
- Credential storage: OS keychain abstraction.
- Primarna platforma: Linux.

## Electron procesi

### Main process

Odgovornosti:

- file picker,
- pristup lokalnim fajlovima,
- kontrolisani lokalni media protokol za video preview bez direktnog `file://` pristupa iz renderer-a,
- pokretanje `ffmpeg` procesa,
- credential storage,
- user settings storage,
- AI provider pozivi kada credential ne treba izlagati renderer-u,
- IPC kanali prema renderer-u.

### Renderer process

Odgovornosti:

- video preview,
- trim UI,
- subtitle editor,
- styling UI,
- i18n language switcher,
- settings page,
- export controls,
- status i progress prikaz.

### Preload bridge

Odgovornosti:

- siguran, ogranicen API izmedju renderer-a i main process-a,
- bez direktnog Node pristupa iz UI sloja,
- tipizirani IPC pozivi.

## Predlozeni moduli

```txt
app/
  main/
    ffmpeg/
      trim-service
      audio-extract-service
      subtitle-burn-service
    ai/
      provider-registry
      openai-provider
      openrouter-provider
    credentials/
      credential-store
    projects/
      project-store
    settings/
      settings-store
  renderer/
    i18n/
      index
      locales/
        en/
        sr-Latn/
        sr-Cyrl/
    video-preview
    trim-editor
    subtitle-editor
    style-editor
    export-panel
    settings-page
  shared/
    types
    subtitle
    export
    settings
```

Ovo je konceptualna struktura, ne obavezan finalni folder layout.

## Internacionalizacija UI-a

Koristiti `i18next` kao osnovni i18n sistem. Ako renderer bude React, koristiti `react-i18next` za hook/component integraciju.

Razlozi:

- zreo JavaScript i18n framework,
- radi u browser/desktop okruzenju,
- ima React integraciju,
- podrzava namespace-e, interpolation, pluralizaciju i fallback jezike,
- ima TypeScript smernice i ekosistem alata za kasniji extraction/validation workflow.

Pocetni locale kodovi:

```txt
en
sr-Latn
sr-Cyrl
```

Predlozena struktura prevoda:

```txt
app/renderer/i18n/locales/
  en/
    common.json
    editor.json
    export.json
    errors.json
    settings.json
  sr-Latn/
    common.json
    editor.json
    export.json
    errors.json
    settings.json
  sr-Cyrl/
    common.json
    editor.json
    export.json
    errors.json
    settings.json
```

Minimalni namespace-i:

- `common` - osnovni button-i, label-e i statusi,
- `editor` - video, trim, subtitle i style editor,
- `export` - export panel i format poruke,
- `errors` - greske i recovery poruke,
- `settings` - podesavanja aplikacije i jezika.

Pravila:

- Ne hardkodovati korisnicki vidljive stringove u komponentama.
- Koristiti stabilne translation key-eve, ne cele recenice kao key.
- `en` je fallback locale.
- UI locale cuvati u user settings.
- OS locale koristiti samo kao pocetnu vrednost ako korisnik nije izabrao jezik.
- Meniji i sistemske poruke iz main process-a takodje moraju koristiti isti locale izbor.
- UI jezik ne sme uticati na detektovani jezik videa ili target jezik prevoda.

Izvori:

- i18next dokumentacija: https://www.i18next.com/
- react-i18next dokumentacija: https://react.i18next.com/
- i18next TypeScript smernice: https://www.i18next.com/overview/typescript

## Settings arhitektura

Settings stranica je deo renderer-a, ali sve operacije koje dodiruju fajl sistem, credential-e ili provider konekciju idu preko main process-a.

Podela odgovornosti:

- Renderer prikazuje forme, validaciju i status.
- Main process cuva podesavanja i credential-e.
- AI provider registry cita aktivni provider i model settings iz settings store-a.
- Credential store cuva tajne odvojeno od obicnih podesavanja.

Settings store sme da cuva:

- UI language,
- default output folder,
- export defaults,
- selected AI provider,
- selected model IDs,
- subtitle polish preferences,
- non-secret provider options.

Settings store ne sme da cuva:

- API key,
- OAuth access token,
- refresh token,
- bilo koju drugu tajnu.

Predlozeni tipovi:

```ts
type AppSettings = {
  uiLanguage: 'en' | 'sr-Latn' | 'sr-Cyrl' | 'system';
  defaultOutputFolder?: string;
  workingFolder?: string;
  autosaveEnabled: boolean;
  recentFilesEnabled: boolean;
  exportDefaults: ExportSettings;
  aiConnector: AiConnectorSettings;
};

type ExportSettings = {
  exportOriginalSrt: boolean;
  exportTranslatedSrt: boolean;
  defaultBurnedInTrack: 'original' | 'translation';
  overwritePolicy: 'ask' | 'overwrite' | 'create_copy';
  fileNamePattern: string;
};

type AiConnectorSettings = {
  activeProviderId?: 'openai' | 'openrouter';
  authModeByProvider: Partial<Record<'openai' | 'openrouter', AuthMode>>;
  transcriptionModelByProvider: Partial<Record<'openai' | 'openrouter', string>>;
  textModelByProvider: Partial<Record<'openai' | 'openrouter', string>>;
  defaultTargetLanguage?: string;
  autoDetectInputLanguage: boolean;
  conservativePolish: boolean;
  socialCaptionPolish: boolean;
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};
```

Settings IPC treba da bude eksplicitan:

- `settings:get`
- `settings:update`
- `settings:reset`
- `ai:listProviders`
- `ai:getProviderStatus`
- `ai:connectProvider`
- `ai:disconnectProvider`
- `ai:testConnection`
- `ai:listModels`

`settings:update` ne sme primati credential vrednosti. Tajne idu samo kroz provider connect flow i credential store.

## Lokalni workflow

Originalni MP4 se nikad ne menja direktno. App pravi radne fajlove i finalne export fajlove.

Primer toka:

1. User bira `input.mp4`.
2. App cuva referencu ka originalu.
3. App trimuje u temporary working file ili koristi trim offset pri audio extraction-u.
4. App ekstraktuje audio.
5. AI provider vraca transkript.
6. App generise subtitle track-ove.
7. Export pravi nove fajlove u odabranom output folderu.

## `ffmpeg` uloga

`ffmpeg` treba koristiti za:

- trim pocetka i kraja,
- audio extraction,
- transcode samo kada je potrebno,
- H.264/AAC preview proxy kao automatski fallback kada Chromium odbije codec izvornog klipa,
- burned-in subtitle export,
- kasnije miksovanje TTS voiceover-a.

Potrebno je imati wrapper servis koji:

- gradi argumente,
- prati progress,
- hvata greske,
- vraca citljive error poruke UI-u.

## Trim odluka

Trim se radi pre transkripcije.

Razlog:

- manje audio materijala za AI,
- manji trosak,
- cistiji transkript,
- finalni subtitle timeline pocinje od `00:00:00`.

## Credential storage

Na Linux-u koristiti OS-backed credential encryption kroz Electron `safeStorage` ili Secret Service/libsecret preko odgovarajuce Node/Electron biblioteke. Ne cuvati API key-eve ili access token-e u plain text JSON fajlovima projekta.

Trenutni main process koristi `SecureCredentialStore`: tajne se sifruju kroz Electron `safeStorage` i cuvaju u aplikacionom `userData/credentials.json` fajlu kao encrypted payload. Ako OS credential encryption nije dostupna, store fail-uje zatvoreno umesto da upise plain text.

Credential store mora podrzati:

- save credential,
- get credential,
- delete credential,
- list connected providers.

## Windows kompatibilnost

Iako Windows nije MVP, izbegavati odluke koje ga blokiraju:

- ne hardkodovati Linux path separator,
- izolovati `ffmpeg` path discovery,
- credential storage apstrahovati iza interfejsa,
- ne oslanjati se na shell-specific komande u core logici.

## Error handling

UI treba da prikazuje greske po oblasti:

- import failed,
- ffmpeg missing,
- audio extraction failed,
- AI provider auth failed,
- transcription failed,
- translation failed,
- export failed,
- missing font.

Svaka greska treba da ima:

- kratak opis,
- tehnicki detalj za debug,
- predlozen sledeci korak.

Sve korisnicki vidljive greske moraju ici kroz `errors` translation namespace.
