import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// Для работы с файловой системой и путями
import * as fs from 'fs';
import * as path from 'path';
// Для управления диалогами и другими элементами браузера
import type { Page, ElementHandle, BrowserContext, Locator, Browser, Dialog } from 'playwright';
// Нам не нужен полный импорт Accessibility, используем более простой тип для снимка
// Типы для fastmcp
import type { ContentResult, ImageContent, TextContent } from 'fastmcp';
// Определяем типы для HTTP middleware
interface Request {
  headers?: Record<string, string | undefined>;
}

interface Response {
  status: (code: number) => Response;
  json: (data: any) => void;
}

type NextFunction = () => Promise<void> | void;

// Добавляем stealth плагин к playwright и правильно его настраиваем
const stealthPlugin = StealthPlugin();
// Отключаем webdriver, чтобы избежать обнаружения
stealthPlugin.enabledEvasions.delete('webdriver');
chromium.use(stealthPlugin);

// Создаем новый FastMCP сервер
const server = new FastMCP({
  name: 'stealth-browser-mcp',
  version: '1.0.0'
});

// Создаем функцию-обертку для работы с запросами и обработкой таймаутов
// Эта функция заменит все запросы к MCP и добавит обработку таймаутов
async function safeExecute<T>(fn: () => Promise<T>, timeoutMs = 30000, retries = 3): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Создаем промис с таймаутом
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Таймаут запроса после ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      // Используем Promise.race для ограничения времени выполнения
      const result = await Promise.race([fn(), timeoutPromise]);
      return result as T;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Попытка ${attempt + 1}/${retries} выполнения запроса не удалась:`, error);
      
      // Если ошибка таймаута, очищаем ресурсы
      if (error instanceof Error && error.message.includes('Таймаут') || 
          error instanceof Error && error.message.includes('timed out')) {
        console.warn('Обнаружен таймаут запроса, очистка ресурсов...');
        
        // Закрываем браузер, если он открыт
        if (globalBrowser) {
          try {
            await globalBrowser.close();
            globalBrowser = null;
            globalPage = null;
            console.warn('Браузер успешно закрыт после таймаута');
          } catch (err) {
            console.error('Ошибка при закрытии браузера:', err);
          }
        }
        
        // Сбрасываем состояние сервера
        lastSnapshot = null;
      }
      
      // Если остались попытки, ждем перед следующей
      if (attempt < retries - 1) {
        const delayMs = 1000 * (attempt + 1); // Увеличиваем задержку с каждой попыткой
        console.log(`Ожидание ${delayMs}ms перед следующей попыткой...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  // Если все попытки неудачны
  throw lastError || new Error('Все попытки выполнения запроса неудачны');
}

// Импортируем профили браузеров для ротации отпечатков
import { getRandomProfile, getProfileByIndex } from './browser-profiles';
import type { BrowserProfile } from './browser-profiles';

// Импортируем функции имитации человеческого поведения
import { 
  humanDelay, 
  humanType, 
  humanClick, 
  humanMouseMovement, 
  humanScroll,
  randomMouseMovements,
  humanPageInteraction
} from './human-behavior';

// Глобальные переменные для хранения состояния браузера
let globalBrowser: Browser | null = null;
let globalPage: Page | null = null;
let lastSnapshot: any = null; // Используем any для снимка доступности
let currentProfileIndex = 0; // Индекс текущего профиля для ротации

// Типы результатов для инструментов
type SuccessResult = ContentResult | string | { content: (ImageContent | TextContent)[] };
type ElementInfo = { element: string; ref: string };

// Функция для получения или создания браузера и страницы с ротацией отпечатков
async function getOrCreateBrowserAndPage(headless: boolean = true, useRandomProfile: boolean = true): Promise<{ browser: Browser; page: Page }> {
  // Выбираем профиль: случайный или следующий по очереди
  const profile = useRandomProfile ? getRandomProfile() : getProfileByIndex(currentProfileIndex);
  
  // Увеличиваем индекс для следующего вызова
  if (!useRandomProfile) {
    currentProfileIndex = (currentProfileIndex + 1) % 5; // 5 - количество профилей в массиве
  }
  
  // Создаем новый браузер при каждом вызове, чтобы применить новый профиль
  if (globalBrowser) {
    await globalBrowser.close();
    globalBrowser = null;
    globalPage = null;
  }
  
  // Запускаем браузер с настройками stealth-плагина
  globalBrowser = await chromium.launch({ 
    headless,
    args: [
      `--user-agent=${profile.userAgent}`,
      `--lang=${profile.locale}`,
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  // Создаем страницу с настроенными параметрами
  globalPage = await globalBrowser.newPage();
  
  // Устанавливаем параметры страницы согласно профилю
  await globalPage.setViewportSize(profile.viewport);
  
  // Устанавливаем дополнительные параметры через JavaScript
  await globalPage.addInitScript(({ userAgent, platform, webglVendor, webglRenderer }) => {
    // Переопределяем navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      get: () => userAgent
    });
    
    // Переопределяем navigator.platform
    Object.defineProperty(navigator, 'platform', {
      get: () => platform
    });
    
    // Переопределяем WebGL, если указаны параметры
    if (webglVendor && webglRenderer) {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        // UNMASKED_VENDOR_WEBGL
        if (parameter === 37445) {
          return webglVendor;
        }
        // UNMASKED_RENDERER_WEBGL
        if (parameter === 37446) {
          return webglRenderer;
        }
        return getParameter.call(this, parameter);
      };
    }
    
    // Скрываем следы автоматизации
    delete (window as any).navigator.webdriver;
  }, profile);
  
  // Устанавливаем HTTP-заголовки
  await globalPage.setExtraHTTPHeaders({
    'Accept-Language': profile.acceptLanguage
  });
  
  if (!globalBrowser || !globalPage) {
    throw new Error('Не удалось создать браузер или страницу');
  }
  
  return { browser: globalBrowser, page: globalPage };
}

// Функция для получения элемента по ссылке
async function getElementByRef(page: Page, ref: string): Promise<ElementHandle | null> {
  // Простая реализация - здесь вы можете расширить, чтобы обрабатывать более сложные ссылки
  try {
    return await page.$(ref);
  } catch (error) {
    console.error(`Error finding element with ref ${ref}:`, error);
    return null;
  }
}

// Функция для преобразования результата в формат ContentResult
function formatResult(result: any): ContentResult {
  if (typeof result === 'string') {
    return { content: [{ type: 'text', text: result }] };
  }
  
  if (result && result.content) {
    return result;
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result)
      }
    ]
  };
}

// Добавляем инструмент для скриншотов
server.addTool({
  name: 'screenshot',
  description: 'Navigate to a URL and take a screenshot of the webpage',
  parameters: z.object({
    url: z.string().describe('URL to navigate to'),
    fullPage: z.boolean().default(true).describe('Whether to take a screenshot of the full page'),
    selector: z.string().optional().describe('CSS selector to screenshot a specific element'),
    headless: z.boolean().default(true).describe('Whether to run browser in headless mode (default) or visible mode'),
    useRandomProfile: z.boolean().default(true).describe('Использовать случайный профиль браузера')
  }),
  execute: async ({ url, fullPage = true, selector, headless = true, useRandomProfile = true }) => {
    let browser = null;
    let page = null;
    
    try {
      // Используем функцию getOrCreateBrowserAndPage для общего подхода к созданию браузера
      const result = await getOrCreateBrowserAndPage(headless, useRandomProfile);
      browser = result.browser;
      page = result.page;
      
      // Переходим по URL
      console.error(`Переход по адресу ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      
      // Добавляем случайные задержки для имитации человеческого поведения
      await humanDelay(1000, 2000);
      
      // Выполняем случайные движения мышью для имитации просмотра
      await randomMouseMovements(page, 1000);
      
      // Делаем скриншот
      const screenshotOptions = { fullPage };
      let screenshot;
      
      if (selector) {
        // Скриншот конкретного элемента, если указан селектор
        const element = await page.$(selector);
        if (element) {
          // Имитируем наведение на элемент перед скриншотом
          await humanMouseMovement(page, element);
          screenshot = await element.screenshot();
        } else {
          throw new Error(`Элемент с селектором '${selector}' не найден`);
        }
      } else {
        // Скриншот всей страницы
        // Добавляем прокрутку перед скриншотом для имитации человеческого поведения
        await humanScroll(page);
        screenshot = await page.screenshot(screenshotOptions);
      }
      
      // Save screenshot to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screenshot-${timestamp}.png`;
      const filePath = path.join(screenshotsDir, filename);
      
      // Write the screenshot to disk
      fs.writeFileSync(filePath, screenshot);
      
      // Return screenshot as base64 data with content type and file info
      return {
        content: [
          {
            type: 'image',
            data: screenshot.toString('base64'),
            mimeType: 'image/png'
          }
        ]
      };
    } catch (error: unknown) {
      console.error('Ошибка при создании скриншота:', error);
      // Правильная типизация ошибки
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Ошибка при создании скриншота: ${errorMessage}`);
    } finally {
      // Корректно закрываем ресурсы браузера
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('Ошибка при закрытии браузера:', closeError);
        }
      }
    }
  }
});

// Get configuration from environment variables or use defaults
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0';
const TRANSPORT_TYPE = process.env.TRANSPORT_TYPE || 'http';

// Function to create directory for screenshots if it doesn't exist
const screenshotsDir = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Сервер запускается без аутентификации - все запросы разрешены

// Функция для запуска сервера в зависимости от типа транспорта
async function startServer() {
  if (TRANSPORT_TYPE === 'http') {
    // Для HTTP транспорта используем sse (Server-Sent Events), который лучше совместим с Windsurf
    return server.start({
      transportType: 'sse',
      sse: {
        endpoint: '/mcp',
        port: PORT
      }
    });
  } else {
    // Для stdio используем стандартную конфигурацию
    return server.start({
      transportType: 'stdio'
    });
  }
}

// Добавляем новые инструменты из microsoft/playwright-mcp

// 1. browser_snapshot - получение снимка доступности страницы
server.addTool({
  name: 'browser_snapshot',
  description: 'Capture accessibility snapshot of the current page, this is better than screenshot',
  parameters: z.object({}),
  execute: async () => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      // Получаем снэпшот доступности страницы
      const snapshot = await page.accessibility.snapshot();
      lastSnapshot = snapshot;
      
      return formatResult({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              snapshot,
              title: await page.title(),
              url: page.url()
            })
          }
        ]
      });
    } catch (error) {
      console.error('Error capturing page snapshot:', error);
      throw error;
    }
  }
});

// 2. browser_click - клик по элементу на странице
server.addTool({
  name: 'browser_click',
  description: 'Perform click on a web page',
  parameters: z.object({
    element: z.string().describe('Human-readable element description used to obtain permission to interact with the element'),
    ref: z.string().describe('Exact target element reference from the page snapshot')
  }),
  execute: async ({ element, ref }) => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      const elementHandle = await getElementByRef(page, ref);
      
      if (!elementHandle) {
        throw new Error(`Element with reference '${ref}' not found on the page`);
      }
      
      await elementHandle.click();
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Clicked on element: ${element}`
          }
        ]
      });
    } catch (error) {
      console.error('Error clicking element:', error);
      throw error;
    }
  }
});

// 3. browser_drag - перетаскивание элементов
server.addTool({
  name: 'browser_drag',
  description: 'Perform drag and drop between two elements',
  parameters: z.object({
    startElement: z.string().describe('Human-readable source element description'),
    startRef: z.string().describe('Exact source element reference from the page snapshot'),
    endElement: z.string().describe('Human-readable target element description'),
    endRef: z.string().describe('Exact target element reference from the page snapshot')
  }),
  execute: async ({ startElement, startRef, endElement, endRef }) => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      const sourceElement = await getElementByRef(page, startRef);
      const targetElement = await getElementByRef(page, endRef);
      
      if (!sourceElement || !targetElement) {
        throw new Error('Source or target element not found');
      }
      
      const sourceBound = await sourceElement.boundingBox();
      const targetBound = await targetElement.boundingBox();
      
      if (!sourceBound || !targetBound) {
        throw new Error('Cannot get element boundaries');
      }
      
      // Выполняем перетаскивание
      await page.mouse.move(sourceBound.x + sourceBound.width / 2, sourceBound.y + sourceBound.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBound.x + targetBound.width / 2, targetBound.y + targetBound.height / 2);
      await page.mouse.up();
      
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Dragged from ${startElement} to ${endElement}`
          }
        ]
      });
    } catch (error) {
      console.error('Error during drag and drop:', error);
      throw error;
    }
  }
});

// 4. browser_hover - наведение на элемент
server.addTool({
  name: 'browser_hover',
  description: 'Hover over element on page',
  parameters: z.object({
    element: z.string().describe('Human-readable element description'),
    ref: z.string().describe('Exact target element reference from the page snapshot')
  }),
  execute: async ({ element, ref }) => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      const elementHandle = await getElementByRef(page, ref);
      
      if (!elementHandle) {
        throw new Error(`Element with reference '${ref}' not found on the page`);
      }
      
      await elementHandle.hover();
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Hovered over element: ${element}`
          }
        ]
      });
    } catch (error) {
      console.error('Error hovering over element:', error);
      throw error;
    }
  }
});

// 5. browser_type - ввод текста
server.addTool({
  name: 'browser_type',
  description: 'Type text into editable element',
  parameters: z.object({
    element: z.string().describe('Human-readable element description'),
    ref: z.string().describe('Exact target element reference from the page snapshot'),
    text: z.string().describe('Text to type into the element'),
    submit: z.boolean().optional().describe('Whether to submit entered text (press Enter after)'),
    slowly: z.boolean().optional().describe('Whether to type one character at a time')
  }),
  execute: async ({ element, ref, text, submit = false, slowly = false }) => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      const elementHandle = await getElementByRef(page, ref);
      
      if (!elementHandle) {
        throw new Error(`Element with reference '${ref}' not found on the page`);
      }
      
      // Очищаем поле перед вводом
      await elementHandle.fill('');
      
      if (slowly) {
        // Вводим текст по одному символу
        for (const char of text) {
          await elementHandle.type(char, { delay: 100 });
        }
      } else {
        // Вводим весь текст сразу
        await elementHandle.fill(text);
      }
      
      if (submit) {
        await page.keyboard.press('Enter');
      }
      
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Typed "${text}" into element: ${element}${submit ? ' and submitted' : ''}`
          }
        ]
      });
    } catch (error) {
      console.error('Error typing text:', error);
      throw error;
    }
  }
});

// 6. browser_select_option - выбор опции из выпадающего списка
server.addTool({
  name: 'browser_select_option',
  description: 'Select an option in a dropdown',
  parameters: z.object({
    element: z.string().describe('Human-readable element description'),
    ref: z.string().describe('Exact target element reference from the page snapshot'),
    values: z.array(z.string()).describe('Array of values to select in the dropdown')
  }),
  execute: async ({ element, ref, values }) => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      const elementHandle = await getElementByRef(page, ref);
      
      if (!elementHandle) {
        throw new Error(`Element with reference '${ref}' not found on the page`);
      }
      
      await elementHandle.selectOption(values);
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Selected values [${values.join(', ')}] in dropdown: ${element}`
          }
        ]
      });
    } catch (error) {
      console.error('Error selecting options:', error);
      throw error;
    }
  }
});

// 7. browser_press_key - нажатие клавиши
server.addTool({
  name: 'browser_press_key',
  description: 'Press a key on the keyboard',
  parameters: z.object({
    key: z.string().describe('Name of the key to press or a character to generate, such as ArrowLeft or a')
  }),
  execute: async ({ key }) => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      await page.keyboard.press(key);
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Pressed key: ${key}`
          }
        ]
      });
    } catch (error) {
      console.error('Error pressing key:', error);
      throw error;
    }
  }
});

// 8. browser_wait_for - ожидание текста или времени
server.addTool({
  name: 'browser_wait_for',
  description: 'Wait for text to appear or disappear or a specified time to pass',
  parameters: z.object({
    time: z.number().optional().describe('The time to wait in seconds'),
    text: z.string().optional().describe('The text to wait for'),
    textGone: z.string().optional().describe('The text to wait for to disappear')
  }),
  execute: async ({ time, text, textGone }) => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      
      if (time) {
        await page.waitForTimeout(time * 1000);
      }
      
      if (text) {
        await page.waitForSelector(`text=${text}`);
      }
      
      if (textGone) {
        await page.waitForSelector(`text=${textGone}`, { state: 'detached' });
      }
      
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Wait completed` + 
                  (time ? ` for ${time} seconds` : '') +
                  (text ? ` for text "${text}" to appear` : '') +
                  (textGone ? ` for text "${textGone}" to disappear` : '')
          }
        ]
      });
    } catch (error) {
      console.error('Error during wait:', error);
      throw error;
    }
  }
});

// 9. browser_file_upload - загрузка файлов
server.addTool({
  name: 'browser_file_upload',
  description: 'Upload one or multiple files',
  parameters: z.object({
    element: z.string().describe('Human-readable element description'),
    ref: z.string().describe('Exact target element reference from the page snapshot'),
    paths: z.array(z.string()).describe('The absolute paths to the files to upload')
  }),
  execute: async ({ element, ref, paths }) => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      const elementHandle = await getElementByRef(page, ref);
      
      if (!elementHandle) {
        throw new Error(`Element with reference '${ref}' not found on the page`);
      }
      
      // Проверяем существование файлов перед загрузкой
      for (const filePath of paths) {
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }
      }
      
      await elementHandle.setInputFiles(paths);
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Uploaded ${paths.length} file(s) to element: ${element}`
          }
        ]
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      throw error;
    }
  }
});

// 10. browser_handle_dialog - обработка диалогов
server.addTool({
  name: 'browser_handle_dialog',
  description: 'Handle a dialog',
  parameters: z.object({
    accept: z.boolean().describe('Whether to accept the dialog'),
    promptText: z.string().optional().describe('The text of the prompt in case of a prompt dialog')
  }),
  execute: async ({ accept, promptText }) => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      
      // Настраиваем обработчик диалогов
      page.on('dialog', async dialog => {
        if (accept) {
          if (dialog.type() === 'prompt' && promptText) {
            await dialog.accept(promptText);
          } else {
            await dialog.accept();
          }
        } else {
          await dialog.dismiss();
        }
      });
      
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Dialog handler set: ${accept ? 'accept' : 'dismiss'}${promptText ? ` with text: ${promptText}` : ''}`
          }
        ]
      });
    } catch (error) {
      console.error('Error setting dialog handler:', error);
      throw error;
    }
  }
});

// 11. browser_navigate - навигация по URL с ротацией отпечатков и поддержкой подключения через URL и порт
server.addTool({
  name: 'browser_navigate',
  description: 'Navigate to a URL with advanced stealth features',
  parameters: z.object({
    url: z.string().describe('The URL to navigate to'),
    rotateFingerprint: z.boolean().optional().describe('Whether to rotate browser fingerprint before navigating'),
    humanBehavior: z.boolean().optional().describe('Whether to simulate human-like behavior'),
    proxyUrl: z.string().optional().describe('Proxy URL in format http(s)://user:pass@host:port or socks5://host:port'),
    customHeaders: z.record(z.string()).optional().describe('Custom HTTP headers to use for the request'),
    timeout: z.number().optional().describe('Navigation timeout in milliseconds')
  }),
  execute: async ({ url, rotateFingerprint = true, humanBehavior = true, proxyUrl, customHeaders, timeout = 30000 }) => {
    let browser = null;
    let page = null;
    
    try {
      // Настраиваем опции запуска браузера с прокси, если указан
      const launchOptions: any = { headless: true };
      
      if (proxyUrl) {
        launchOptions.proxy = { server: proxyUrl };
        console.log(`Используем прокси: ${proxyUrl}`);
      }
      
      // Получаем или создаем браузер с указанными опциями
      if (globalBrowser) {
        await globalBrowser.close();
        globalBrowser = null;
        globalPage = null;
      }
      
      // Выбираем профиль браузера
      const profile = rotateFingerprint ? getRandomProfile() : getProfileByIndex(currentProfileIndex);
      
      // Обновляем индекс для следующего вызова, если не используем случайный профиль
      if (!rotateFingerprint) {
        currentProfileIndex = (currentProfileIndex + 1) % 5;
      }
      
      // Добавляем аргументы браузера из профиля
      launchOptions.args = [
        `--user-agent=${profile.userAgent}`,
        `--lang=${profile.locale}`,
        '--disable-blink-features=AutomationControlled'
      ];
      
      // Запускаем браузер с настройками
      browser = await chromium.launch(launchOptions);
      globalBrowser = browser;
      
      // Создаем контекст браузера с настройками профиля
      const context = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        locale: profile.locale,
        timezoneId: profile.timezone,
        hasTouch: profile.hasTouch,
        colorScheme: 'light',
        javaScriptEnabled: true,
        bypassCSP: true // Обходим CSP для лучшей совместимости
      });
      
      // Создаем страницу
      page = await context.newPage();
      globalPage = page;
      
      // Устанавливаем пользовательские HTTP-заголовки, если указаны
      if (customHeaders) {
        await page.setExtraHTTPHeaders(customHeaders);
      } else {
        // Устанавливаем заголовки из профиля
        await page.setExtraHTTPHeaders({
          'Accept-Language': profile.acceptLanguage
        });
      }
      
      // Устанавливаем дополнительные параметры через JavaScript
      await page.addInitScript(({ userAgent, platform, webglVendor, webglRenderer }) => {
        // Переопределяем navigator.userAgent
        Object.defineProperty(navigator, 'userAgent', { get: () => userAgent });
        
        // Переопределяем navigator.platform
        Object.defineProperty(navigator, 'platform', { get: () => platform });
        
        // Переопределяем WebGL, если указаны параметры
        if (webglVendor && webglRenderer) {
          const getParameter = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = function(parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) return webglVendor;
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) return webglRenderer;
            return getParameter.call(this, parameter);
          };
        }
        
        // Скрываем следы автоматизации
        delete (window as any).navigator.webdriver;
        
        // Имитируем plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            return [{
              name: 'Chrome PDF Plugin',
              description: 'Portable Document Format',
              filename: 'internal-pdf-viewer'
            }];
          }
        });
      }, profile);
      
      // Навигация по URL с таймаутом
      console.log(`Навигация на ${url} с ${rotateFingerprint ? 'ротацией отпечатка' : 'статическим отпечатком'}`);
      
      // Используем случайную задержку перед навигацией для более естественного поведения
      await humanDelay(500, 1500);
      
      // Переходим по URL с ожиданием загрузки страницы и механизмом повторных попыток
      let attempts = 0;
      const maxAttempts = 3;
      let lastError = null;
      
      while (attempts < maxAttempts) {
        try {
          console.log(`Попытка ${attempts + 1}/${maxAttempts} перехода по URL: ${url}`);
          await page.goto(url, { 
            waitUntil: 'domcontentloaded', // Используем domcontentloaded вместо networkidle для ускорения
            timeout: timeout / maxAttempts // Уменьшаем таймаут для каждой попытки
          });
          
          // Если дошли до этой точки, значит переход успешен
          break;
        } catch (error) {
          lastError = error;
          attempts++;
          
          if (attempts < maxAttempts) {
            console.warn(`Ошибка при переходе, повторная попытка ${attempts + 1}/${maxAttempts}:`, error);
            // Пауза перед следующей попыткой
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      // Если все попытки неудачны, выбрасываем последнюю ошибку
      if (attempts === maxAttempts && lastError) {
        throw lastError;
      }
      
      // Имитация человеческого поведения после загрузки страницы
      if (humanBehavior) {
        console.log('Имитация человеческого поведения на странице');
        await humanPageInteraction(page);
      }
      
      // Получаем дополнительную информацию о текущем профиле
      const userAgent = await page.evaluate(() => navigator.userAgent);
      const platform = await page.evaluate(() => navigator.platform);
      const language = await page.evaluate(() => navigator.language);
      const cookies = await context.cookies();
      
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Выполнен переход на: ${url} | Заголовок страницы: ${await page.title()}`
          },
          {
            type: 'text',
            text: rotateFingerprint ? `Используется ротация отпечатков: ${userAgent.substring(0, 50)}... на ${platform} (${language})` : ''
          },
          {
            type: 'text',
            text: `Cookies: ${cookies.length} (${cookies.map(c => c.name).join(', ').substring(0, 100)}${cookies.length > 5 ? '...' : ''})`
          }
        ]
      });
    } catch (error: unknown) {
      console.error('Ошибка при навигации по URL:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Ошибка при навигации по URL: ${errorMessage}`);
    } finally {
      // Не закрываем браузер, так как он может использоваться в других инструментах
      // Для глобального браузера закрытие происходит при создании нового или в обработчике ошибок процесса
    }
  }
});

// 12. browser_navigate_back - назад по истории
server.addTool({
  name: 'browser_navigate_back',
  description: 'Go back to the previous page',
  parameters: z.object({}),
  execute: async () => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      await page.goBack();
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Navigated back to: ${page.url()} | Page title: ${await page.title()}`
          }
        ]
      });
    } catch (error) {
      console.error('Error navigating back:', error);
      throw error;
    }
  }
});

// 13. browser_navigate_forward - вперед по истории
server.addTool({
  name: 'browser_navigate_forward',
  description: 'Go forward to the next page',
  parameters: z.object({}),
  execute: async () => {
    try {
      const { page } = await getOrCreateBrowserAndPage();
      await page.goForward();
      return formatResult({
        content: [
          {
            type: 'text',
            text: `Navigated forward to: ${page.url()} | Page title: ${await page.title()}`
          }
        ]
      });
    } catch (error) {
      console.error('Error navigating forward:', error);
      throw error;
    }
  }
});

// Улучшенная обработка необработанных ошибок в Node.js
process.on('uncaughtException', (error: Error) => {
  console.warn('Необработанное исключение:', error);
});

// Патч для предотвращения необработанных ошибок в @modelcontextprotocol/sdk
try {
  // Пытаемся найти модуль и патчировать его
  const sdkModule = require('@modelcontextprotocol/sdk');
  if (sdkModule) {
    // Патчим класс McpError, чтобы предотвратить необработанные ошибки
    const originalMcpError = sdkModule.McpError;
    if (originalMcpError) {
      sdkModule.McpError = function(...args: any[]) {
        const error = new originalMcpError(...args);
        
        // Добавляем свойство для отслеживания и предотвращения необработанных ошибок
        error.isHandled = false;
        
        // Добавляем обработчик для установки флага обработки
        const originalToString = error.toString;
        error.toString = function() {
          // Помечаем ошибку как обработанную
          this.isHandled = true;
          return originalToString.call(this);
        };
        
        // Добавляем конструктор и прототип
        Object.setPrototypeOf(error, originalMcpError.prototype);
        return error;
      };
      
      // Копируем прототип и свойства
      sdkModule.McpError.prototype = originalMcpError.prototype;
      Object.defineProperty(sdkModule.McpError, 'name', { value: 'McpError' });
      
      console.log('Модуль @modelcontextprotocol/sdk успешно патчирован для предотвращения необработанных ошибок');
    } else {
      console.warn('Не удалось найти класс McpError в @modelcontextprotocol/sdk');
    }
  } else {
    console.warn('Не удалось загрузить модуль @modelcontextprotocol/sdk');
  }
} catch (error) {
  console.warn('Ошибка при патчировании @modelcontextprotocol/sdk:', error);
}

// Дополнительная обработка необработанных промисов
process.on('unhandledRejection', (reason, promise) => {
  // Проверяем, является ли ошибка объектом McpError и помечена ли она как обработанная
  if (reason && typeof reason === 'object') {
    if ('isHandled' in reason && !reason.isHandled) {
      console.warn('Обнаружено необработанное отклонение Promise:', reason);
      reason.isHandled = true; // Помечаем как обработанную
    }
    
    // Проверяем на наличие кода ошибки таймаута
    if ('code' in reason && reason.code === -32001) {
      console.warn('Обнаружена ошибка таймаута MCP, очистка ресурсов...');
      
      // Закрываем браузер, если он открыт
      if (globalBrowser) {
        try {
          globalBrowser.close().catch(err => {
            console.error('Ошибка при закрытии браузера после таймаута:', err);
          });
          globalBrowser = null;
          globalPage = null;
          console.warn('Браузер успешно закрыт после таймаута');
        } catch (err) {
          console.error('Ошибка при закрытии браузера:', err);
        }
      }
      
      // Сбрасываем состояние сервера
      lastSnapshot = null;
      
      // Пробуем преобразовать Promise в успешный, чтобы избежать необработанного отклонения
      (promise as any)._then = (promise as any).then;
      (promise as any).then = function() {
        // Отменяем дальнейшие обработчики и завершаем Promise
        return Promise.resolve();
      };
    }
  } else {
    console.warn('Необработанное отклонение Promise с неожиданным форматом:', reason);
  }
});

// Для других критических ошибок можно завершить процесс, но мы решаем продолжать работу

// Патчируем метод _handleRequest для обработки таймаутов
const originalHandleRequest = (server as any)._handleRequest;
if (originalHandleRequest) {
  (server as any)._handleRequest = async function(...args: any[]) {
    try {
      // Создаем промис с таймаутом
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Таймаут запроса MCP'));
        }, 45000); // Таймаут 45 секунд вместо 60
      });
      
      // Запускаем оригинальный обработчик и промис таймаута параллельно
      return await Promise.race([
        originalHandleRequest.apply(this, args),
        timeoutPromise
      ]);
    } catch (error) {
      console.warn('Перехвачена ошибка в _handleRequest:', error);
      
      // Проверяем, является ли это ошибкой таймаута
      if (error instanceof Error && 
          (error.message.includes('Таймаут') || error.message.includes('timed out'))) {
        console.warn('Обнаружен таймаут запроса MCP, очистка ресурсов...');
        
        // Закрываем браузер, если он открыт
        if (globalBrowser) {
          try {
            await globalBrowser.close();
            globalBrowser = null;
            globalPage = null;
            console.warn('Браузер успешно закрыт после таймаута');
          } catch (err) {
            console.error('Ошибка при закрытии браузера:', err);
          }
        }
        
        // Сбрасываем состояние сервера
        lastSnapshot = null;
        
        // Возвращаем сообщение об ошибке
        return {
          id: args[0]?.id,
          result: formatResult({
            content: [
              {
                type: 'text',
                text: 'Произошел таймаут запроса. Ресурсы очищены. Пожалуйста, повторите запрос.'
              }
            ]
          })
        };
      }
      
      // Если это не ошибка таймаута, пробрасываем дальше
      throw error;
    }
  };
  console.log('Метод _handleRequest успешно патчирован для обработки таймаутов');
} else {
  console.warn('Не удалось найти метод _handleRequest для патчирования');
}

// Запускаем сервер
startServer().then(() => {
  if (TRANSPORT_TYPE === 'http') {
    console.log(`MCP server started on http://${HOST}:${PORT} (без аутентификации)`);
  } else {
    console.log('MCP server started with stdio transport and waiting for commands...');
  }
}).catch((error: any) => {
  console.error('Failed to start MCP server:', error);
});