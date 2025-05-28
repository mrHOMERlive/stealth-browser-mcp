/**
 * Утилиты для имитации человеческого поведения в браузере
 * Помогают избежать обнаружения автоматизации за счет естественных задержек и паттернов движения
 */
import type { Page, ElementHandle } from 'playwright';

/**
 * Функция для случайной задержки с нормальным распределением
 * Имитирует человеческие задержки между действиями
 * @param min Минимальная задержка в миллисекундах
 * @param max Максимальная задержка в миллисекундах
 */
export async function humanDelay(min: number = 100, max: number = 500): Promise<void> {
  // Используем нормальное распределение для более реалистичных задержек
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 4; // Стандартное отклонение
  
  // Функция Box-Muller для генерации нормально распределенного случайного числа
  const random = () => {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0;
  };
  
  // Генерируем задержку с нормальным распределением
  let delay = Math.round(random() * stdDev + mean);
  delay = Math.max(min, Math.min(max, delay)); // Ограничиваем диапазоном
  
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Имитация человеческого ввода текста с разной скоростью и паузами
 * @param page Страница браузера
 * @param element Элемент для ввода текста
 * @param text Текст для ввода
 */
export async function humanType(page: Page, element: ElementHandle, text: string): Promise<void> {
  // Средняя скорость печати (символов в минуту)
  const avgTypingSpeed = Math.floor(Math.random() * 300) + 200; // 200-500 символов в минуту
  
  // Перевод в миллисекунды на символ
  const baseDelay = 60000 / avgTypingSpeed;
  
  // Очистим поле ввода перед вводом нового текста
  try {
    await element.fill('');
  } catch (error) {
    // Если fill не поддерживается, попробуем очистить через клавиши
    try {
      await element.click({ clickCount: 3 }); // Выделить весь текст
      await page.keyboard.press('Backspace'); // Удалить выделенный текст
    } catch (innerError) {
      console.warn('Не удалось очистить поле перед вводом текста');
    }
  }
  
  // Случайные вариации скорости для каждого символа
  for (const char of text) {
    // Более долгие паузы для определенных символов (пробел, запятая и т.д.)
    const factor = /[\s,.?!;:]/.test(char) ? 2.0 : 1.0;
    
    // Добавляем случайность к задержке
    const variation = (Math.random() * 0.5) + 0.75; // 0.75 - 1.25
    const delay = Math.floor(baseDelay * factor * variation);
    
    // Вводим символ через keyboard.press вместо element.type для большей надежности
    try {
      await page.keyboard.press(char);
    } catch (error) {
      // Если не удалось использовать keyboard.press, вернемся к type
      await element.type(char, { delay: 0 });
    }
    
    await humanDelay(delay, delay + 50);
  }
  
  // Имитация короткой паузы после ввода текста
  await humanDelay(300, 800);
}

/**
 * Имитация человеческих движений мышью
 * @param page Страница браузера
 * @param element Целевой элемент
 */
export async function humanMouseMovement(page: Page, element: ElementHandle): Promise<void> {
  // Получаем координаты и размер элемента
  const box = await element.boundingBox();
  if (!box) return;
  
  // Текущее положение мыши (предполагаем, что оно в верхнем левом углу)
  const viewport = page.viewportSize() || { width: 1024, height: 768 };
  const startX = Math.random() * viewport.width;
  const startY = Math.random() * viewport.height;
  
  // Конечная точка (случайная точка внутри элемента)
  const targetX = box.x + box.width * (0.25 + Math.random() * 0.5);
  const targetY = box.y + box.height * (0.25 + Math.random() * 0.5);
  
  // Количество шагов для движения
  const steps = Math.floor(Math.random() * 5) + 5; // 5-10 шагов
  
  // Добавляем небольшое дрожание пути для реалистичности
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    
    // Базовое линейное движение от начальной к конечной точке
    let moveX = startX + (targetX - startX) * progress;
    let moveY = startY + (targetY - startY) * progress;
    
    // Добавляем небольшое случайное отклонение (имитация человеческого дрожания)
    // Отклонение максимально в середине пути и уменьшается к началу и концу
    const jitterFactor = Math.sin(progress * Math.PI); // 0->1->0
    const jitterX = (Math.random() - 0.5) * 20 * jitterFactor;
    const jitterY = (Math.random() - 0.5) * 20 * jitterFactor;
    
    moveX += jitterX;
    moveY += jitterY;
    
    // Перемещаем курсор
    await page.mouse.move(moveX, moveY);
    await humanDelay(20, 50);
  }
}

/**
 * Выполняет клик с человеческими характеристиками
 * @param page Страница браузера
 * @param element Элемент для клика
 */
export async function humanClick(page: Page, element: ElementHandle): Promise<void> {
  // Сначала двигаем мышь к элементу с человеческой траекторией
  await humanMouseMovement(page, element);
  
  // Небольшая пауза перед кликом
  await humanDelay(50, 150);
  
  // Выполняем клик
  await element.click();
  
  // Пауза после клика
  await humanDelay(150, 400);
}

/**
 * Имитация случайных движений мыши для анализа страницы
 * Полезно вызывать время от времени для имитации человеческого поведения
 * @param page Страница браузера
 * @param duration Продолжительность случайных движений (мс)
 */
export async function randomMouseMovements(page: Page, duration: number = 2000): Promise<void> {
  const startTime = Date.now();
  const viewport = page.viewportSize() || { width: 1024, height: 768 };
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;
  
  while (Date.now() - startTime < duration) {
    // Случайная точка в области просмотра
    const targetX = Math.random() * viewportWidth;
    const targetY = Math.random() * viewportHeight;
    
    // Случайная скорость движения
    const speed = Math.random() * 50 + 50; // 50-100ms
    
    await page.mouse.move(targetX, targetY);
    await humanDelay(speed, speed + 30);
  }
}

/**
 * Имитация случайной прокрутки страницы
 * @param page Страница браузера
 */
export async function humanScroll(page: Page): Promise<void> {
  // Получаем высоту страницы
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = page.viewportSize()?.height || 800;
  
  // Случайное количество прокруток
  const scrollCount = Math.floor(Math.random() * 3) + 2; // 2-4 прокрутки
  
  for (let i = 0; i < scrollCount; i++) {
    // Случайное расстояние прокрутки (примерно размер видимой области)
    const scrollDistance = (Math.random() * 0.5 + 0.75) * viewportHeight;
    
    // Случайное направление (обычно вниз, но иногда вверх)
    const direction = Math.random() > 0.2 ? 1 : -1;
    
    // Выполняем прокрутку
    await page.evaluate((distance) => {
      window.scrollBy(0, distance);
    }, scrollDistance * direction);
    
    // Пауза между прокрутками
    await humanDelay(500, 1500);
  }
}

/**
 * Проверка содержимого страницы с имитацией человеческого поведения
 * @param page Страница браузера
 */
export async function humanPageInteraction(page: Page): Promise<void> {
  // Имитация просмотра страницы
  await humanDelay(1000, 2000);
  
  // Случайные движения мышью
  await randomMouseMovements(page, Math.random() * 1000 + 1000);
  
  // Прокрутка страницы как человек
  await humanScroll(page);
  
  // Еще немного случайных движений после прокрутки
  await randomMouseMovements(page, Math.random() * 500 + 500);
  
  // Дополнительная пауза для имитации чтения содержимого
  await humanDelay(1500, 3000);
}
