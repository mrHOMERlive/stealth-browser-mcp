// Профили браузеров для ротации отпечатков
export interface BrowserProfile {
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  locale: string;
  timezone: string;
  platform: string;
  webglVendor?: string;
  webglRenderer?: string;
  acceptLanguage: string;
  deviceScaleFactor: number;
  colorDepth: number;
  hasTouch: boolean;
}

// Коллекция различных профилей браузеров для ротации
export const browserProfiles: BrowserProfile[] = [
  // Windows 10 + Chrome
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.25 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezone: 'America/New_York',
    platform: 'Win32',
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    acceptLanguage: 'en-US,en;q=0.9',
    deviceScaleFactor: 1,
    colorDepth: 24,
    hasTouch: false
  },
  // Windows 10 + Firefox
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    viewport: { width: 1680, height: 1050 },
    locale: 'en-GB',
    timezone: 'Europe/London',
    platform: 'Win32',
    webglVendor: 'Mozilla',
    webglRenderer: 'Mozilla',
    acceptLanguage: 'en-GB,en;q=0.9,de;q=0.8',
    deviceScaleFactor: 1,
    colorDepth: 24,
    hasTouch: false
  },
  // MacOS + Safari
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    viewport: { width: 2560, height: 1600 },
    locale: 'fr-FR',
    timezone: 'Europe/Paris',
    platform: 'MacIntel',
    webglVendor: 'Apple Inc.',
    webglRenderer: 'Apple GPU',
    acceptLanguage: 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    deviceScaleFactor: 2,
    colorDepth: 30,
    hasTouch: false
  },
  // iPad + Safari
  {
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 1024, height: 1366 },
    locale: 'it-IT',
    timezone: 'Europe/Rome',
    platform: 'iPad',
    acceptLanguage: 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    deviceScaleFactor: 2,
    colorDepth: 24,
    hasTouch: true
  },
  // Android Phone + Chrome
  {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.25 Mobile Safari/537.36',
    viewport: { width: 412, height: 915 },
    locale: 'de-DE',
    timezone: 'Europe/Berlin',
    platform: 'Linux armv8l',
    webglVendor: 'Google Inc.',
    webglRenderer: 'ANGLE (Samsung, Mali-G78 MP14, OpenGL ES 3.2 v1.r32p1.9604e17)',
    acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8',
    deviceScaleFactor: 2.625,
    colorDepth: 24,
    hasTouch: true
  }
];

// Функция для получения случайного профиля
export function getRandomProfile(): BrowserProfile {
  const randomIndex = Math.floor(Math.random() * browserProfiles.length);
  return browserProfiles[randomIndex];
}

// Функция для получения профиля по индексу
export function getProfileByIndex(index: number): BrowserProfile {
  const safeIndex = index % browserProfiles.length;
  return browserProfiles[safeIndex];
}
