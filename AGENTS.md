# AGENTS.md

## Projekat

Tajtlisha je Linux-first Electron desktop aplikacija za titlove na kratkim MP4 klipovima. Ciljni MVP tok je: import MP4, trim pocetka/kraja, audio extraction, AI transkripcija, prevod, rucna korekcija titlova, styling, SRT export i MP4 export sa urezanim titlovima.

Ovo je jedan projekat. Ne razdvajati ideje u zasebne aplikacije osim ako korisnik eksplicitno promeni smer.

## Trenutno stanje

Repo vise nije samo dokumentacija. Postoji Electron/Vite/React/TypeScript kostur sa main, preload, renderer, shared types i testovima. `docs/README.md` moze biti zastareo ako kaze da nema aplikacionog koda.

Implementirano ili zapoceto:

- Electron main process u `src/main/index.ts`.
- Siguran preload bridge u `src/preload/index.ts`, tipizovan kroz `src/shared/types/ipc.ts`.
- Renderer shell, Editor i Settings stranice u `src/renderer/src/`.
- Editor ima rucnu korekciju teksta/timinga, trim kontrole, AI generate akciju, style editor i export akciju.
- i18n preko `i18next` i `react-i18next`, sa jezicima `en`, `sr-Latn`, `sr-Cyrl`.
- Settings store u `src/main/settings/`, sa zabranom cuvanja tajni u settings patch-u.
- AI provider registry, OpenAI API-key provider za transcription/translation/polish i placeholder OpenRouter provider.
- Subtitle workflow servis koji iz trim range-a ekstraktuje privremeni audio, poziva aktivni AI provider i vraca original/translated track.
- Credential store u main procesu koristi Electron `safeStorage` i perzistentan encrypted fajl u `userData`; testovi i dalje koriste memorijski/fake crypto store.
- ffmpeg/ffprobe servis za status, probe, trim i audio extraction.
- SRT serializacija, timing validacija i filename helper-i.
- `burnSubtitles` koristi ffmpeg subtitles filter sa privremenim SRT fajlom za stvarni burned-in export.
- Project export servis pise original/translated SRT, po potrebi trimuje privremeni video, pomera subtitle timeline na `00:00:00` i eksportuje burned-in MP4.

## Komande

Koristi `pnpm`.

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm test:main:local
pnpm test:main:ai
pnpm test:renderer
pnpm test:e2e
```

Napomene:

- `pnpm dev` i `pnpm test:e2e` skidaju `ELECTRON_RUN_AS_NODE` preko `env -u ELECTRON_RUN_AS_NODE`.
- `pnpm test:e2e` ocekuje build output u `out/main/index.js`; prvo pokreni `pnpm build`.
- `pnpm lint` je trenutno alias za `tsc --noEmit`.

## Arhitektura

Glavne granice:

- `src/main/` je jedino mesto za filesystem, ffmpeg, credentials, settings persistence, AI provider pozive i IPC handler-e.
- `src/preload/` izlozi samo mali, tipizovan API preko `contextBridge`.
- `src/renderer/` nema direktan Node pristup i ne sme citati fajlove, environment ili credential-e.
- `src/shared/types/` je ugovor izmedju main/preload/renderer slojeva. Kada menjas IPC ili domain model, prvo azuriraj shared tipove.
- `docs/` sadrzi proizvodne i arhitektonske odluke. Ako promenis scope ili ugovor, azuriraj relevantan dokument.

IPC pravilo: dodaj kanal u main IPC modulu, zatim preload bridge, zatim `TajtlishaApi` tip. Nemoj uvoditi ad hoc string kanale direktno iz renderer-a.

## Product pravila

- Originalni video se nikad ne menja direktno.
- MVP video editing znaci trim pocetka i kraja, ne full timeline editor.
- App radi sa najmanje dva subtitle track-a: `original` i `translation`.
- Nakon trimovanja finalni timeline pocinje od `00:00:00`.
- Originalni i prevedeni track treba da dele timing kada je moguce.
- Voiceover/dubbing je Phase 2, nije MVP.
- Windows build je kasniji cilj, ali ne biraj resenja koja nepotrebno zakljucavaju projekat za Linux ako postoji razuman cross-platform put.

## i18n pravila

- Ne hardkodovati korisnicki vidljive stringove u komponentama.
- Svi button-i, label-e, tooltip-ovi, error poruke, empty states i settings tekstovi idu kroz i18n.
- Pocetni UI jezici su `en`, `sr-Latn`, `sr-Cyrl`; `en` je fallback.
- UI jezik ne sme uticati na input jezik videa ili target jezik prevoda.
- Kada dodas key, dodaj ga u sva tri jezika u `src/renderer/src/i18n/resources.ts`.
- Pazi na duze srpske stringove; layout ne sme pucati na latinici ili cirilici.

## AI i tajne

- OpenAI i OpenRouter moraju ostati modularni provider-i. UI i subtitle logika ne smeju zavisiti od jednog providera.
- Provider capability model je obavezan: ne pretpostavljaj da svaki provider podrzava transkripciju, timestamp-e, prevod, polish ili TTS.
- Tajne ne smeju u settings store, repo, docs primerima sa realnim vrednostima, logovima, test snapshot-ovima ili renderer state-u.
- Settings store sme da cuva samo ne-tajne opcije: aktivni provider, model IDs, export defaults, UI language i slicno.
- Credential vrednosti idu kroz credential store. Production main proces koristi Electron `safeStorage`; ne cuvati tajne u settings store-u, repo-u ili renderer state-u osim privremenog input polja.
- Ne citati `~/.codex/auth.json` kao production auth mehanizam. Postojeci registry eksplicitno odbija `codex_auth_experimental`.
- OpenAI OAuth/login je spike dok se ne potvrdi javno podrzan desktop flow. API key fallback ostaje validan MVP pravac.

## ffmpeg i export

- Koristi `FfmpegService` i `MediaService`; ne pokreci ffmpeg direktno iz renderer-a.
- `getStatus` koristi kratak timeout od 3000 ms jer ffmpeg zavisnost treba brzo da fail-uje.
- Validiraj putanje i timing pre ffmpeg poziva.
- `serializeSrt` mora proci kroz timing validaciju.
- `burnSubtitles` je stvarni ffmpeg burned-in export preko subtitles filtera; preview i finalni export i dalje treba da dele isti style model.
- Preview i finalni export treba da dele isti style model, cak i ako rendering engine nije identican.

## Testiranje

Za promene u:

- shared tipovima ili main logici: pokreni `pnpm typecheck` i relevantan `pnpm test:main:*`.
- renderer UI-u ili i18n-u: pokreni `pnpm test:renderer`.
- Electron launch/navigation-u: pokreni `pnpm build`, zatim `pnpm test:e2e`.
- cross-layer ugovorima: pokreni `pnpm test`.

Dodaj ili prosiri test tamo gde se menja ponasanje, posebno za tajne, IPC ugovore, timing, filename generation i i18n fallback.

## Stil koda

- TypeScript strict pristup; zadrzi tipove u shared modelima umesto `any`.
- Preferiraj male servise i eksplicitne request/result tipove.
- Ne uvodi novu biblioteku ako lokalni pattern ili standardni Node/React API resava problem.
- Koristi postojece lucide icon deep import-e u renderer-u.
- CSS treba da cuva profesionalan, gust ali citljiv desktop-tool layout. Ne praviti marketing landing page.
- ASCII je podrazumevan za nove fajlove osim kada vec radis sa srpskom cirilicom u i18n resursima.

## Dokumentacija

Relevantni dokumenti:

- `docs/product-spec.md` - proizvodni scope i MVP.
- `docs/technical-architecture.md` - procesi, moduli, i18n, settings i lokalni workflow.
- `docs/ai-providers.md` - provider model, auth odluke i spike kriterijumi.
- `docs/settings-page.md` - Settings i AI connector zahtevi.
- `docs/subtitle-export-spec.md` - subtitle model, timing, SRT i burned-in export.
- `docs/roadmap.md` - faze razvoja.

Ako kod i docs dodju u konflikt, proveri aktuelni kod i azuriraj docs samo kada promena stvarno menja odluku ili scope.

## Git i radno stablo

Radni direktorijum moze biti prljav. Ne revertovati tudje izmene bez izricitog zahteva. Pre vecih izmena proveri relevantne fajlove i radi usko po zadatku.
