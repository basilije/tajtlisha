# Tajtlisha Documentation

Tajtlisha je mali Linux-first desktop alat za pravljenje, prevodjenje i export titlova na kratkim MP4 snimcima. Prva verzija cilja kreatore kratkih social video klipova kojima treba brz lokalni workflow: import videa, trim pocetka i kraja, AI transkripcija, prevod, rucna korekcija, styling i export.

## Status

Projekat je u fazi projektne dokumentacije. Jos nema aplikacionog koda.

## MVP u jednoj recenici

Korisnik ubaci kratak MP4, trimuje ga, aplikacija auto-detekuje jezik govora, generise originalne i prevedene titlove, korisnik ih stilizuje i izveze SRT i MP4 sa urezanim titlovima.

## Platforme

- MVP: Linux desktop.
- Kasnije: Windows, ako se arhitektura i dependency izbor pokazu prenosivim.

## UI jezici

UI aplikacije mora biti multijezican od pocetka. Pocetni jezici:

- engleski,
- srpski latinica,
- srpski cirilica.

Preporuceni i18n sistem je `i18next`, uz `react-i18next` ako renderer bude React.

## Dokumenti

- [Product Spec](./product-spec.md) - proizvodni scope, korisnici, MVP i faze.
- [Technical Architecture](./technical-architecture.md) - Electron, moduli, ffmpeg i lokalni workflow.
- [AI Providers](./ai-providers.md) - OpenAI/OpenRouter, auth pristup i provider interfejs.
- [Settings Page](./settings-page.md) - podesavanja aplikacije i AI konektor.
- [Subtitle Export Spec](./subtitle-export-spec.md) - subtitle model, styling i export pravila.
- [Roadmap](./roadmap.md) - faze razvoja i kriterijumi za prelazak iz faze u fazu.

## Osnovne odluke

- Ovo je jedan projekat, ne kolekcija nepovezanih ideja.
- App je desktop-first i local-first: originalni video se ne menja, export pravi nove fajlove.
- Video editing u MVP-u znaci samo trim pocetka i kraja, ne full video editor.
- AI funkcije u MVP-u su transkripcija, detekcija jezika, prevod i subtitle polish.
- UI internacionalizacija je deo osnovne arhitekture, ne kasniji dodatak.
- Settings stranica je deo MVP-a, sa posebnim AI konektor panelom.
- Voiceover/dubbing je druga faza, ne deo MVP-a.
