# FlowCast

Windows-приложение для поиска музыки в Yandex Music, прослушивания в динамиках и одновременной отправки потока в микрофонный тракт.

## Запуск

```powershell
npm install
npm run dev
```

Production preview:

```powershell
npm run build
npm run preview
```

## Полные треки Yandex Music

Поиск работает без токена, но полное воспроизведение и плейлисты аккаунта требуют OAuth-доступ к Yandex Music API. Иначе Яндекс возвращает только preview-поток на 30 секунд.

Для dev-сборки есть два варианта:

```powershell
$env:YANDEX_MUSIC_TOKEN="oauth-token"
npm run preview
```

или OAuth-окно через client id:

```powershell
$env:FLOWCAST_YANDEX_CLIENT_ID="client-id"
npm run preview
```

В production это должен быть внутренний client id FlowCast, чтобы пользователь просто нажимал "Войти" и не видел токены.

## Аудио

Кнопка Play запускает один общий аудиопоток и отправляет его:

- в динамики/наушники Windows для прослушивания;
- в виртуальный микрофонный тракт, если установлен `CABLE Input` или будущий `FlowCast Microphone`;
- вместе с выбранным физическим микрофоном, чтобы в приложениях был голос + музыка.

Без виртуального аудио-устройства Windows не дает обычному приложению записывать звук прямо в физический микрофон.

## Проверки

```powershell
npm test
npm run typecheck
npm run build
```

Подробная инструкция по production-драйверу: [docs/DRIVER_RELEASE_GUIDE.md](docs/DRIVER_RELEASE_GUIDE.md).
