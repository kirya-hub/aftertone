# AFTERTONE — архитектура полной выставки

Реализован вариант B из [утверждённой Phase A](full-experience-phase-a.md). Astro static + TypeScript + GSAP. Добавлены точно закреплённые `three` и `@types/three` 0.187.0. Нет backend, хранилища, React, аудио или внешних runtime-запросов.

## Границы

- `ImmersiveHero.astro` и `immersive-hero.ts` сохранены побайтно. Hero сам управляет своим WebGL1-контекстом и lifecycle.
- `Journey.astro` — семантические пять глав, DOM scene-slots, текст и доступное управление. Небольшой массив описывает контент; сцены имеют разные композиции через CSS, а не универсальный UI-builder.
- `exhibition/index.ts` — lazy import при приближении к Journey и защита от завершения import после disposal.
- `renderer.ts` — один WebGL2 canvas, viewport/scissor по полным DOM bounds с clipping видимой части; event-driven invalidation, context loss/restoration, ResizeObserver и visibility cleanup.
- `scenes.ts` — процедурные ленты с замкнутой оболочкой, 16 инстансированных рёбер камеры, три соосные perspective-апертуры, три открытых переплетённых пути Common Ground и финальная дуга с двумя удаляющимися следами. Камера использует 9 draw calls вместо 48 отдельных mesh. Геометрия и normals вычисляются при создании сцены, анимация меняет group/camera/material.
- `state.ts` — границы азимута, presets, toggle-selection. `fallback.ts` — переключение реальных poster-ракурсов без WebGL.
- `exhibition.css` — scoped layout, typography, controls, mobile/reduced-motion. Старый global CSS и архивная motion-система сохраняются для прототипов.

## Рендер и ресурсы

Canvas прозрачен вне видимых scene-slots, не принимает pointer events. DOM принимает жесты и владеет focus. Сцены дальше 500px от viewport уничтожаются; их shared environment принадлежит renderer. При близком стыке несколько scene regions рисуются в одном контексте.

Нет бесконечного animation loop: scroll/resize/явный ввод вызывают invalidate, requestAnimationFrame объединяет события. Hidden document прекращает кадры. `pagehide`, BFCache, HMR очищают и восстанавливают модули. AbortController снимает listeners; геометрия/material/environment/renderer освобождаются при disposal. При context loss видны posters и preset-переключение, при restoration GPU-ресурсы создаются заново.

После visual polish материал — MeshPhysicalMaterial с clearcoat, умеренной metalness и transmission, толщиной/attenuation и локальным PMREM-окружением из четырёх цветных softbox-плоскостей. Ленты имеют переднюю и заднюю поверхности, боковые стенки и торцы открытых путей. Transmission используется выборочно вне многослойной Chamber и использует половинное разрешение промежуточного буфера; это растровая экранная рефракция Three.js, без ray tracing и без гарантии корректного многослойного преломления. Основная глубина создаётся перспективой, отражениями и перекрытием реальной геометрии. Постпроцессинг не добавлен. Hero использует прежний независимый материал и не изменён.

DPR ограничен 2 desktop / 1.5 mobile. Только при явно определённом software renderer (`llvmpipe`, `SwiftShader`, `software`) применяется scale 0.65: реакция на подтверждённый риск медленного программного рендера, без изменения объектов и desktop hardware-режима. Для подтверждённого software backend экранная transmission отключена; оболочки используют 180 сегментов / 8 поперечных делений вместо аппаратных 240 / 10, сохраняя траектории, толщину, цветное окружение и clearcoat. Это не гарантия 60 FPS.

## История и архивы

Главная теперь использует выставку. Старое дерево страницы перенесено в `/archive/`; A/B routes импортируют архив вместо новой главной. Header и Layout получают явный `exhibition` prop; их поведение по умолчанию остаётся прежним. HeroDirections, остальные старые секции и reference materials сохранены.
