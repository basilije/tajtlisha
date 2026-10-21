import { captionsStrings } from './strings/captions';
import { previewStrings } from './strings/preview';
import { shellStrings } from './strings/shell';

const baseResources = {
  en: {
    translation: {
      app: {
        name: 'Tajtlisha',
        tagline: 'Subtitle workspace for short video clips'
      },
      nav: {
        settings: 'Settings'
      },
      language: {
        label: 'Interface language',
        system: 'System',
        en: 'English',
        srLatn: 'Srpski latinica',
        srCyrl: 'Srpski cirilica'
      },
      settings: {
        title: 'Settings',
        general: 'General',
        localization: 'Language & localization',
        aiConnector: 'AI connector',
        exportDefaults: 'Export defaults',
        advanced: 'Advanced/diagnostics',
        defaultOutputFolder: 'Default output folder',
        workingFolder: 'Working folder',
        autosave: 'Autosave projects',
        recentFiles: 'Remember recent files',
        neverModifyOriginal: 'Original videos are never modified',
        targetLanguage: 'Default target language',
        detectLanguage: 'Auto-detect input language',
        activeProvider: 'Active provider',
        authMode: 'Authentication mode',
        connectionState: 'Connection state',
        credentialStored: 'Credential stored',
        connected: 'Connected',
        disconnected: 'Disconnected',
        apiKey: 'API key',
        replaceCredential: 'Replace stored credential',
        connect: 'Connect',
        replace: 'Replace',
        disconnect: 'Disconnect',
        testConnection: 'Test connection',
        connectSucceeded: 'Provider connected.',
        connectFailed: 'Provider connection failed.',
        disconnectSucceeded: 'Provider disconnected.',
        testSucceeded: 'Connection test passed.',
        testFailed: 'Connection test failed.',
        credential: 'Stored credential',
        noCredential: 'No credential stored',
        transcriptionModel: 'Transcription model',
        textModel: 'Text model',
        modelDefault: 'Provider default',
        modelsLoading: 'Loading models…',
        modelsError: 'Models unavailable',
        exportOriginal: 'Export original SRT',
        exportTranslated: 'Export translated SRT',
        burnedInTrack: 'Burned-in subtitle track',
        originalTrack: 'Original subtitles',
        translationTrack: 'Translated subtitles',
        overwritePolicy: 'Overwrite policy',
        overwriteAsk: 'Ask before overwriting',
        overwriteExisting: 'Overwrite existing file',
        createCopy: 'Create a copy',
        fileNamePattern: 'File name pattern',
        enabled: 'Enabled',
        ffmpeg: 'FFmpeg',
        ffmpegNotChecked: 'Not checked yet',
        diagnostics: 'Diagnostics bundle',
        diagnosticsValue: 'Mock renderer diagnostics only'
      }
    }
  },
  'sr-Latn': {
    translation: {
      app: {
        name: 'Tajtlisha',
        tagline: 'Radni prostor za titlove kratkih video klipova'
      },
      nav: {
        settings: 'Podešavanja'
      },
      language: {
        label: 'Jezik interfejsa',
        system: 'Sistemski',
        en: 'Engleski',
        srLatn: 'Srpski (latinica)',
        srCyrl: 'Srpski (ćirilica)'
      },
      settings: {
        title: 'Podešavanja',
        general: 'Opšte',
        localization: 'Jezik i lokalizacija',
        aiConnector: 'AI konektor',
        exportDefaults: 'Podrazumevani izvoz',
        advanced: 'Napredno/dijagnostika',
        defaultOutputFolder: 'Podrazumevani folder izvoza',
        workingFolder: 'Radni folder',
        autosave: 'Automatsko čuvanje projekata',
        recentFiles: 'Pamti skorašnje fajlove',
        neverModifyOriginal: 'Originalni video se nikada ne menja',
        targetLanguage: 'Podrazumevani ciljni jezik',
        detectLanguage: 'Automatski prepoznaj ulazni jezik',
        activeProvider: 'Aktivni provajder',
        authMode: 'Način autentikacije',
        connectionState: 'Stanje veze',
        credentialStored: 'Kredencijal je sačuvan',
        connected: 'Povezano',
        disconnected: 'Nije povezano',
        apiKey: 'API ključ',
        replaceCredential: 'Zameni sačuvani kredencijal',
        connect: 'Poveži',
        replace: 'Zameni',
        disconnect: 'Isključi',
        testConnection: 'Testiraj konekciju',
        connectSucceeded: 'Provajder je povezan.',
        connectFailed: 'Povezivanje provajdera nije uspelo.',
        disconnectSucceeded: 'Provajder je isključen.',
        testSucceeded: 'Test konekcije je uspeo.',
        testFailed: 'Test konekcije nije uspeo.',
        credential: 'Sačuvan kredencijal',
        noCredential: 'Nema sačuvanog kredencijala',
        transcriptionModel: 'Model za transkripciju',
        textModel: 'Tekstualni model',
        modelDefault: 'Podrazumevani model provajdera',
        modelsLoading: 'Učitavanje modela…',
        modelsError: 'Modeli nisu dostupni',
        exportOriginal: 'Izvezi originalni SRT',
        exportTranslated: 'Izvezi prevedeni SRT',
        burnedInTrack: 'Ugrađena traka titla',
        originalTrack: 'Originalni titlovi',
        translationTrack: 'Prevedeni titlovi',
        overwritePolicy: 'Politika prepisivanja',
        overwriteAsk: 'Pitaj pre prepisivanja',
        overwriteExisting: 'Prepiši postojeći fajl',
        createCopy: 'Napravi kopiju',
        fileNamePattern: 'Šablon naziva fajla',
        enabled: 'Uključeno',
        ffmpeg: 'FFmpeg',
        ffmpegNotChecked: 'Još nije provereno',
        diagnostics: 'Dijagnostički paket',
        diagnosticsValue: 'Samo simulirana dijagnostika prikaza'
      }
    }
  },
  'sr-Cyrl': {
    translation: {
      app: {
        name: 'Тајтлиша',
        tagline: 'Радни простор за титлове кратких видео клипова'
      },
      nav: {
        settings: 'Подешавања'
      },
      language: {
        label: 'Језик интерфејса',
        system: 'Системски',
        en: 'Енглески',
        srLatn: 'Српски (латиница)',
        srCyrl: 'Српски (ћирилица)'
      },
      settings: {
        title: 'Подешавања',
        general: 'Опште',
        localization: 'Језик и локализација',
        aiConnector: 'AI конектор',
        exportDefaults: 'Подразумевани извоз',
        advanced: 'Напредно/дијагностика',
        defaultOutputFolder: 'Подразумевани фолдер извоза',
        workingFolder: 'Радни фолдер',
        autosave: 'Аутоматско чување пројеката',
        recentFiles: 'Памти скорашње фајлове',
        neverModifyOriginal: 'Оригинални видео се никада не мења',
        targetLanguage: 'Подразумевани циљни језик',
        detectLanguage: 'Аутоматски препознај улазни језик',
        activeProvider: 'Активни провајдер',
        authMode: 'Начин аутентикације',
        connectionState: 'Стање везе',
        credentialStored: 'Креденцијал је сачуван',
        connected: 'Повезано',
        disconnected: 'Није повезано',
        apiKey: 'API кључ',
        replaceCredential: 'Замени сачувани креденцијал',
        connect: 'Повежи',
        replace: 'Замени',
        disconnect: 'Искључи',
        testConnection: 'Тестирај конекцију',
        connectSucceeded: 'Провајдер је повезан.',
        connectFailed: 'Повезивање провајдера није успело.',
        disconnectSucceeded: 'Провајдер је искључен.',
        testSucceeded: 'Тест конекције је успео.',
        testFailed: 'Тест конекције није успео.',
        credential: 'Сачуван креденцијал',
        noCredential: 'Нема сачуваног креденцијала',
        transcriptionModel: 'Модел за транскрипцију',
        textModel: 'Текстуални модел',
        modelDefault: 'Подразумевани модел провајдера',
        modelsLoading: 'Учитавање модела…',
        modelsError: 'Модели нису доступни',
        exportOriginal: 'Извези оригинални SRT',
        exportTranslated: 'Извези преведени SRT',
        burnedInTrack: 'Уграђена трака титла',
        originalTrack: 'Оригинални титлови',
        translationTrack: 'Преведени титлови',
        overwritePolicy: 'Политика преписивања',
        overwriteAsk: 'Питај пре преписивања',
        overwriteExisting: 'Препиши постојећи фајл',
        createCopy: 'Направи копију',
        fileNamePattern: 'Шаблон назива фајла',
        enabled: 'Укључено',
        ffmpeg: 'FFmpeg',
        ffmpegNotChecked: 'Још није проверено',
        diagnostics: 'Дијагностички пакет',
        diagnosticsValue: 'Само симулирана дијагностика приказа'
      }
    }
  }
} as const;

type UiLang = keyof typeof baseResources;

function withAreaStrings<L extends UiLang>(language: L) {
  return {
    translation: {
      ...baseResources[language].translation,
      preview: previewStrings[language],
      captions: captionsStrings[language],
      shell: shellStrings[language]
    }
  };
}

export const resources = {
  en: withAreaStrings('en'),
  'sr-Latn': withAreaStrings('sr-Latn'),
  'sr-Cyrl': withAreaStrings('sr-Cyrl')
};
