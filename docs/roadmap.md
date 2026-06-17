# Roadmap

## Phase 0 - Validacija i odluke

Cilj: smanjiti najvece rizike pre implementacije UI-a.

Zadaci:

- OpenAI OAuth/login auth spike.
- Proveriti da li Codex CLI auth moze legalno i stabilno da se koristi bez citanja internog cache fajla.
- Proveriti OpenRouter transcription API i format odgovora.
- Proveriti `ffmpeg` komande za trim, audio extract i burned-in subtitles.
- Izabrati Electron setup.
- Potvrditi i18n stack: `i18next` plus `react-i18next` ako renderer bude React.
- Izabrati credential storage biblioteku za Linux.

Exit criteria:

- poznat default AI auth flow,
- poznat fallback auth flow,
- potvrdjen `ffmpeg` workflow,
- potvrdjena UI lokalizacija za `en`, `sr-Latn` i `sr-Cyrl`,
- poznat minimalni data model.

## Phase 1 - MVP

Cilj: jedan korisnik moze lokalno da napravi titlove i exportuje video.

Funkcije:

- import MP4,
- video preview,
- UI language switcher za engleski, srpski latinicu i srpski cirilicu,
- trim pocetka i kraja,
- audio extraction,
- AI provider connect,
- auto-detekcija jezika,
- transkripcija,
- biranje ciljnog jezika,
- prevod,
- subtitle editor,
- style editor,
- original SRT export,
- translated SRT export,
- MP4 export sa izabranim subtitle track-om.

Exit criteria:

- workflow radi end-to-end na Linux-u,
- UI moze da se prebaci izmedju `en`, `sr-Latn` i `sr-Cyrl`,
- greske su citljive,
- originalni video se ne menja,
- export fajlovi se mogu otvoriti u standardnim playerima.

## Phase 1.5 - Polish

Cilj: uciniti aplikaciju prijatnijom za realan rad.

Funkcije:

- subtitle preset-i,
- autosave projekta,
- recent files,
- bolji progress UI,
- provera nedostajucih translation key-eva,
- validacija pre exporta,
- upozorenja za preduge segmente,
- rucno biranje input jezika ako auto-detekcija pogresi.

## Phase 2 - Voiceover / dubbing

Cilj: opcioni glas na ciljnom jeziku preko videa.

Funkcije:

- TTS provider abstraction,
- generisanje glasa iz translated track-a,
- replace original audio,
- duck original audio,
- export voiceover audio separately,
- MP4 export sa novim glasom.

Rizici:

- kvalitet TTS-a,
- timing glasa u odnosu na video,
- trosak,
- prava/licence za glasove,
- audio miksovanje.

## Phase 3 - Windows i dodatni provideri

Cilj: prosiriti dostupnost i fleksibilnost.

Funkcije:

- Windows build,
- provider settings UI,
- dodatni AI provideri,
- batch export,
- vise target jezika odjednom,
- dodatni subtitle preset-i,
- napredniji format exporta.

## Namerno odlozeno

- Full timeline video editor.
- Multi-cut montage.
- Efekti i tranzicije.
- SaaS nalog/billing sistem.
- Team collaboration.
- Cloud storage.
