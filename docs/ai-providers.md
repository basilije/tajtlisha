# AI Providers

## Cilj

AI sloj mora biti modularan. Aplikacija ne sme da zavisi od jednog providera u UI i subtitle logici.

Prvi prioritet je OpenAI auth/login istrazivanje. OpenRouter se tretira kao dodatni API provider.

## Trenutno stanje iz dokumentacije

OpenAI API referenca navodi Bearer autentikaciju preko API keys ili kratkotrajnih access token-a iz workload identity federation:

- https://developers.openai.com/api/reference/overview/

OpenAI production best practices naglasavaju da API key ne treba izlagati u browserima ili aplikacijama i da se tajne cuvaju server-side ili u key management sistemu:

- https://developers.openai.com/api/docs/guides/production-best-practices

Codex ima poseban auth model za Codex CLI:

- https://developers.openai.com/codex/auth

OpenRouter koristi Bearer token / API key auth i ima API referencu:

- https://openrouter.ai/docs/api/reference/authentication
- https://openrouter.ai/docs/api/reference/overview

OpenRouter takodje ima STT endpoint za transkripciju:

- https://openrouter.ai/docs/guides/overview/multimodal/stt
- https://openrouter.ai/docs/api/api-reference/transcriptions/create-audio-transcriptions

## Auth strategija

### Prioritet: OpenAI OAuth/login spike

Pre implementacije OpenAI auth-a proveriti:

1. Da li postoji zvanicno podrzan OpenAI/ChatGPT OAuth ili login flow za third-party desktop aplikaciju koja treba da poziva potrebne API-je.
2. Da li taj token sme i moze da poziva audio/transcription/translation/model endpoint-e.
3. Da li token refresh radi stabilno.
4. Da li je flow dozvoljen za distribuiranu desktop aplikaciju.
5. Da li je potrebno imati backend.

### Codex CLI auth reuse

Na lokalnom sistemu moze postojati `~/.codex/auth.json`, ali aplikacija ne treba da cita taj fajl direktno kao production auth mehanizam.

Razlog:

- to je interni auth cache Codex CLI-a,
- format nije javni ugovor za ovu aplikaciju,
- moze se promeniti,
- moze imati security i policy implikacije.

Dozvoljeno za istrazivanje:

- proveriti da li Codex CLI nudi podrzan nacin da izlozi access token,
- proveriti da li je takav token validan za potrebne API pozive,
- dokumentovati ogranicenja.

### Fallback: OpenAI API key

Ako OAuth/login nije stabilan za MVP, OpenAI provider mora imati API key auth fallback.

Credential se cuva u OS keychain-u, ne u projektu.

### OpenRouter provider

OpenRouter je API provider preko Bearer token-a. Koristi se kao alternativni provider za:

- transcription,
- translation/polish preko kompatibilnih modela,
- kasnije mozda TTS ako provider/model podrzi kvalitet koji treba.

## Provider capability model

Svaki provider mora eksplicitno da prijavi sta podrzava.

```ts
type AiProviderId = 'openai' | 'openrouter';

type AuthMode =
  | 'oauth_or_chatgpt_login'
  | 'api_key'
  | 'codex_auth_experimental';

type AiProviderCapabilities = {
  detectLanguage: boolean;
  transcription: boolean;
  segmentTimestamps: boolean;
  wordTimestamps: boolean;
  translation: boolean;
  subtitlePolish: boolean;
  textToSpeech: boolean;
};
```

## Core AI tipovi

```ts
type LanguageCode = string;

type TranscriptSegment = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  language: LanguageCode;
  confidence?: number;
};

type SubtitleTrackKind = 'original' | 'translation';

type SubtitleTrack = {
  id: string;
  kind: SubtitleTrackKind;
  language: LanguageCode;
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
  segments: TranscriptSegment[];
};

type TranscriptionRequest = {
  audioPath: string;
  audioFormat: 'wav' | 'mp3' | 'm4a';
  expectedLanguage?: LanguageCode;
  autoDetectLanguage: boolean;
  clipDurationMs: number;
};

type TranscriptionResult = {
  detectedLanguage: LanguageCode;
  text: string;
  segments: TranscriptSegment[];
  providerMetadata?: unknown;
};

type TranslationRequest = {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  segments: TranscriptSegment[];
  preserveTiming: true;
};

type SubtitlePolishRequest = {
  track: SubtitleTrack;
  mode: 'conservative' | 'social_caption';
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};
```

## Provider interfejs

```ts
type AiProvider = {
  id: AiProviderId;
  displayName: string;
  authModes: AuthMode[];
  capabilities: AiProviderCapabilities;
  connect(authMode: AuthMode): Promise<void>;
  disconnect(): Promise<void>;
  detectLanguage?(request: TranscriptionRequest): Promise<LanguageCode>;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
  translate(request: TranslationRequest): Promise<SubtitleTrack>;
  polishSubtitles(request: SubtitlePolishRequest): Promise<SubtitleTrack>;
};
```

## Timestamp fallback

Ako provider vrati samo tekst bez segment ili word timestamp-a:

1. App generise provisional segmente po trajanju klipa i duzini teksta.
2. Segmente oznacava kao low confidence.
3. UI jasno dozvoljava rucno popravljanje timing-a.
4. Export ne sme da puca zbog nedostatka provider timestamp-a.

## Auth spike acceptance criteria

OpenAI OAuth/login moze postati default samo ako:

- postoji stabilan public flow,
- flow radi bez citanja privatnih Codex cache fajlova,
- token pristupa potrebnim AI endpoint-ima,
- refresh token ili session renewal radi,
- moze da se objasni korisniku bez komplikovanog setup-a,
- nema ocigledan policy/security rizik.

Ako ovo ne prodje, MVP koristi OpenAI API key i OpenRouter API key kao podrzane provider tokove.

