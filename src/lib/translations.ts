// Multi-language support for display page
export type Locale = 'en' | 'pl';

export interface DisplayTranslations {
    queueStatus: string;
    pos: string;
    plateNumber: string;
    dockStatus: string;
    weighing: string;
    loading: string;
    atScales: string;
    atDock: string;
    goToScales: string; // Keep for backward compat if needed, or remove if unused in main table
    proceedTo: string;  // Keep for backward compat
    dock: string;       // NEW
    scales: string;     // NEW
    proceedNow: string;
    waiting: string;
    noTrucks: string;
}

const translations: Record<Locale, DisplayTranslations> = {
    en: {
        queueStatus: 'Queue Status',
        pos: 'Pos',
        plateNumber: 'Plate Number',
        dockStatus: 'Dock / Status',
        weighing: 'WEIGHING',
        loading: 'LOADING',
        atScales: 'AT SCALES',
        atDock: 'AT DOCK',
        goToScales: 'GO TO SCALES',
        proceedTo: 'PROCEED TO',
        dock: 'DOCK',
        scales: 'SCALES',
        proceedNow: 'PROCEED NOW!',
        waiting: 'WAITING',
        noTrucks: 'NO TRUCKS IN QUEUE',
    },
    pl: {
        queueStatus: 'Status Kolejki',
        pos: 'Poz',
        plateNumber: 'Numer Rejestracyjny',
        dockStatus: 'Dok / Status',
        weighing: 'WAŻENIE',
        loading: 'ŁADOWANIE',
        atScales: 'NA WADZE',
        atDock: 'PRZY DOKU',
        goToScales: 'IDŹCIE NA WAGĘ',
        proceedTo: 'PRZEJDŹ DO',
        dock: 'DOK',
        scales: 'WAGA',
        proceedNow: 'JEDŹ TERAZ!',
        waiting: 'OCZEKIWANIE',
        noTrucks: 'BRAK CIĘŻARÓWEK W KOLEJCE',
    },
};

export function getTranslations(locale: Locale): DisplayTranslations {
    return translations[locale] || translations.en;
}

export function isValidLocale(locale: string | null): locale is Locale {
    return locale === 'en' || locale === 'pl';
}
