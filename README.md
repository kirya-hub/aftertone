# AFTERTONE

Премиальный frontend-прототип вымышленного SaaS для совместной работы с пространственным звуком. Визуальное направление — **Acoustic Stage**: редакционная типографика, проецированные SVG-контуры, источники и точка прослушивания.

**Astro · TypeScript · GSAP / ScrollTrigger · CSS · SVG.** Статический сайт без backend, аккаунтов, загрузок, платежей, аудиодвижка и внешних сервисов. Ничего не опубликовано.

## Запуск

Требуется **Node.js 24.22.1** (зафиксирован в `.node-version`). В текущем окружении он уже установлен локально:

```bash
cd /home/fefe/promptProjects/saas-landing
export PATH="/home/fefe/promptProjects/tasks/.tools/node/bin:$PATH"
node --version # v24.22.1
npm ci
npm run dev
```

Открыть **http://127.0.0.1:4321**. `npm ci` нужен при первом запуске или изменении lockfile; зависимости уже установлены в этой рабочей папке. Системный Node.js 18 не подходит. На другой машине используйте Node.js из `.node-version` через ваш менеджер версий.

Production-версия:

```bash
npm run build
npm run preview -- --port 4173
```

Открыть **http://127.0.0.1:4173**. Astro 7 запускает сервер фоновым процессом; остановка: `ASTRO_TELEMETRY_DISABLED=1 npx astro dev stop` / `ASTRO_TELEMETRY_DISABLED=1 npx astro preview stop`. Телеметрия отключена только в командах проекта, глобальные настройки не меняются.

## Навигация и демо

- **The approach** — сравнение плоских дорожек и пространственного контекста.
- **In space** — три главы; на desktop сцена меняет перспективу и отношения между источниками при естественной прокрутке.
- **Enter / Explore the playground** — переход к интерактивному полю.
- Выберите Atmosphere, Voice или Signal. Перетащите маркер, используйте стрелки на выбранном маркере или подписанные ползунки. **Shift + стрелка** перемещает на пять шагов. Все источники также доступны через переключатель над инспектором, даже если маркеры совпадают.
- **Reset the scene** восстанавливает начальное состояние. Изменения не сохраняются после refresh. Контуры и координаты иллюстративны и не являются акустическими расчётами.
- **Capabilities** — три разные иллюстрации концептуальных функций. **Questions** — нативные раскрывающиеся ответы.

Без JavaScript остаются весь контент, SVG, якоря, мобильная навигация и FAQ; контролы демо отключены с пояснением. Reduced motion отключает GSAP-хореографию и плавные якорные переходы. На экранах до 800 px пространственный рассказ статичен, главы доступны последовательно.

## Проверки

```bash
npm run check          # Astro + строгий TypeScript
npm test               # 5 тестов состояния без отдельного test framework
npm run format:check   # Prettier + Astro plugin (это не ESLint)
npm run build
npm run measure        # реальные raw/gzip размеры dist → docs/performance.json
```

Для браузерной проверки используются уже установленные Firefox и geckodriver; Selenium, Playwright и новый браузер не устанавливались:

```bash
geckodriver --host 127.0.0.1 --port 4445
# В другом терминале, с Node.js 24 в PATH и работающим preview:
npm run test:browser
node scripts/verify-demo.mjs
```

По умолчанию тесты открывают `http://127.0.0.1:4173`, WebDriver — `http://127.0.0.1:4445`. Переопределение: `AFTERTONE_URL` и `WEBDRIVER_URL`. Скрипт `browser.mjs` проверяет точный CSS viewport через Firefox BiDi и собирает сообщения консоли. В ограниченном sandbox подключение к loopback может требовать разрешения.

- [Архитектура и motion map](docs/architecture.md)
- [Фактические результаты проверок](docs/verification.md)
- [Браузерные результаты и доступные метрики](docs/browser-results.json)
- [Размеры ресурсов](docs/performance.json)
- Скриншоты: `screenshots/final-{1440,1280,768,390,360}-{hero,approach,experience,story-mid,story-end,demo,notes,context,evolution,faq,closing,footer}.png`. На мобильных также `hero-field`, `inspector`, `menu`. Артефакты локальные, PNG исключены из Git.

## Устройство проекта

Секции находятся в `src/components`; `scene-state.ts` содержит чистую модель поля, `demo.ts` — ввод и рендер состояния, `motion.ts` — GSAP-контексты, `navigation.ts` — закрытие мобильного меню. Нативная CSS sticky-сцена не требует ScrollTrigger pinning. `main.ts` очищает модули на pagehide/HMR и восстанавливает их при возврате из BFCache.

Manrope и IBM Plex Mono размещены локально в WOFF2. Лицензии шрифтов — в `public/fonts`. Растровых изображений и сторонних трекеров нет. Все npm-версии закреплены в `package-lock.json`.

## Границы проверки

Браузерная автоматизация выполняется в Firefox на локальной машине. Touch проверяется эмулированными pointer actions, а не физическим телефоном. Другие движки, реальные мобильные устройства, скринридеры и замедленные сети не проверялись. Числа производительности относятся только к указанному локальному запуску; FPS и Lighthouse score не заявляются. LCP/CLS публикуются только при наличии соответствующих Performance API в браузере.

Независимая проверка в другом агенте или сессии не выполнялась согласно заданию; выполнены собственный просмотр кода и браузерные проверки.
