# Как сделать FlowCast Microphone: инструкция по-человечески

Сразу честно: приложение на Electron не может само создать настоящий микрофон в Windows. Чтобы Discord, игра, Zoom или Windows видели устройство ввода `FlowCast Microphone`, нужен аудиодрайвер. Без драйвера это будет только звук внутри приложения, но не микрофон в системе.

## Что должно получиться

В конце правильной реализации в Windows появится устройство:

```text
FlowCast Microphone
```

Схема работы:

```text
FlowCast app
  -> декодирует музыку
  -> смешивает музыку + голос, если включен режим music-plus-voice
  -> отправляет PCM-звук в FlowCastBridge
  -> FlowCastBridge пишет звук в драйвер
  -> Windows видит это как микрофон FlowCast Microphone
```

## Важная развилка

Есть два режима:

1. **Тестовый режим для разработки.**
   Работает только на твоей тестовой Windows с включенным `TESTSIGNING`. Так можно проверить драйвер, но так нельзя нормально отдавать приложение пользователям.

2. **Нормальный релиз.**
   Драйвер подписан Microsoft через Hardware Dev Center. Только такой вариант ставится у обычных людей без отключения защит Windows.

## Часть 1. Что установить

На ПК для разработки драйвера установи:

1. **Visual Studio 2022**
   - Workload: `Desktop development with C++`
   - Компоненты C++ build tools и MSVC.

2. **Windows SDK**
   - Обычно ставится вместе с Visual Studio, но проверь в Visual Studio Installer.

3. **Windows Driver Kit, WDK**
   - Нужен именно WDK под твою версию Windows/SDK.

4. **WDK Visual Studio extension**
   - Без него проекты драйверов могут не открываться/не собираться нормально.

5. **Отдельная тестовая Windows**
   - Лучше VM или второй ПК.
   - Не делай первые эксперименты с kernel-driver на основной системе.

## Часть 2. Взять основу драйвера

Не пиши аудиодрайвер с нуля. Бери Microsoft SYSVAD:

```text
https://learn.microsoft.com/en-us/samples/microsoft/windows-driver-samples/sysvad-virtual-audio-device-driver-sample/
```

SYSVAD - это пример виртуального аудиодрайвера. Нам нужна его часть, которая умеет показывать виртуальное аудиоустройство в Windows.

Что сделать:

1. Скачай/клонируй Microsoft Windows driver samples.
2. Найди sample `audio/sysvad`.
3. Открой проект SYSVAD в Visual Studio.
4. Убедись, что sample собирается без изменений.
5. Только после этого переименовывай и вырезай лишнее.

## Часть 3. Превратить SYSVAD в FlowCast Microphone

Нужна не колонка, а **capture endpoint**, то есть устройство ввода.

Минимальный план:

1. Оставить виртуальный capture endpoint.
2. Friendly name устройства заменить на:

```text
FlowCast Microphone
```

3. В INF-файле указать имя устройства `FlowCast Microphone`.
4. Убрать всё лишнее из sample, если оно не нужно:
   - virtual speaker;
   - keyword detector;
   - лишние APO/эффекты;
   - sample-only endpoints.

5. Внутри драйвера сделать ring buffer.
   Это буфер, из которого Windows будет читать “микрофонный” звук.

6. Если FlowCast ничего не отправляет, драйвер должен отдавать тишину.
   Иначе приложения могут видеть сломанный микрофон.

## Часть 4. Сделать FlowCastBridge

Electron не должен напрямую разговаривать с kernel-driver. Нужен маленький native bridge.

FlowCastBridge делает вот это:

1. Запускается вместе с приложением или как Windows service.
2. Получает PCM-звук от FlowCast app.
3. Приводит звук к нужному формату.
4. Пишет звук в драйвер.

Рекомендуемый первый формат:

```text
48000 Hz
stereo или mono
16-bit PCM или 32-bit float
```

Самый простой транспорт для первой версии:

```text
Named Pipe
```

Потом можно заменить на shared memory/ring buffer, если будет задержка.

## Часть 5. Проверить драйвер локально

На тестовой машине открой **Command Prompt от имени администратора**.

Включи тестовую подпись:

```cmd
bcdedit /set TESTSIGNING ON
```

Перезагрузи Windows.

Собери драйвер в Visual Studio. На выходе должны быть примерно такие файлы:

```text
FlowCastVirtualMic.sys
FlowCastVirtualMic.inf
FlowCastVirtualMic.cat
```

Установи драйвер:

```cmd
pnputil /add-driver FlowCastVirtualMic.inf /install
```

Проверь, что устройство появилось:

```powershell
Get-PnpDevice -Class Media | Where-Object FriendlyName -like "*FlowCast*"
```

И в списке аудиоустройств:

```powershell
Get-CimInstance Win32_SoundDevice | Where-Object Name -like "*FlowCast*"
```

Потом открой:

```text
Параметры Windows -> Система -> Звук -> Ввод
```

Там должен быть `FlowCast Microphone`.

## Часть 6. Проверить в Discord/игре

1. Запусти FlowCast.
2. Включи трек.
3. В Discord выбери input device:

```text
FlowCast Microphone
```

4. Проверь режим `music-only`.
   Должна идти только музыка.

5. Проверь режим `music-plus-voice`.
   Должны идти музыка + твой физический микрофон.

6. Если звука нет:
   - проверь, что FlowCastBridge запущен;
   - проверь формат PCM;
   - проверь, что драйвер читает из ring buffer;
   - проверь, не отдаёт ли драйвер тишину из-за underrun.

## Часть 7. Выключить тестовый режим

Когда закончил тесты:

```cmd
bcdedit /set TESTSIGNING OFF
```

Перезагрузи Windows.

Важно: после этого неподписанный драйвер перестанет нормально загружаться. Это ожидаемо.

## Часть 8. Сделать релиз для обычных пользователей

Чтобы драйвер ставился “без проблем”, нужен Microsoft-signed package.

Что нужно:

1. Аккаунт Microsoft Partner Center.
2. Доступ к Hardware Dev Center.
3. Code signing certificate, который принимает Microsoft dashboard.
4. Собранный драйверный пакет:

```text
.sys
.inf
.cat
```

5. Сабмит пакета в Microsoft Hardware Dev Center.
6. Получить подписанный Microsoft пакет.
7. Вшить этот подписанный пакет в установщик FlowCast.

Только после этого инсталлятор FlowCast сможет нормально ставить `FlowCast Microphone` на чистый Windows 10/11 x64.

## Часть 9. Что должен делать установщик FlowCast

Установщик должен:

1. Установить Electron-приложение.
2. Установить FlowCastBridge.
3. Установить Microsoft-signed драйвер:

```cmd
pnputil /add-driver FlowCastVirtualMic.inf /install
```

4. Проверить, что `FlowCast Microphone` появился.
5. Если драйвер не появился, показать понятную ошибку:
   - нет прав администратора;
   - драйвер не подписан;
   - Windows заблокировал установку;
   - нужна перезагрузка.

## Часть 10. Почему нельзя просто “сделать микрофон из приложения”

Потому что Windows audio input device - это системное устройство. Оно находится ниже уровня обычного приложения. Electron/React/Node могут:

1. Играть звук.
2. Захватывать микрофон.
3. Микшировать Web Audio.
4. Отправлять звук в уже существующее устройство.

Но они не могут зарегистрировать новый настоящий input endpoint, который увидят другие приложения как микрофон. Это делает только драйверный уровень Windows.

## Минимальный план работ по проекту

Чтобы довести FlowCast до рабочего состояния:

1. Оставить текущий UI и поиск.
2. Сделать preview/full playback стабильным внутри приложения.
3. Написать FlowCastBridge.
4. Поднять SYSVAD-derived virtual mic.
5. Связать Bridge -> Driver.
6. Собрать test-signed driver.
7. Проверить в Discord.
8. Отдать драйвер на Microsoft signing.
9. Вшить подписанный драйвер в installer.

## Официальные ссылки

- SYSVAD virtual audio driver sample: https://learn.microsoft.com/en-us/samples/microsoft/windows-driver-samples/sysvad-virtual-audio-device-driver-sample/
- Sample audio drivers: https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/sample-audio-drivers
- Driver signing: https://learn.microsoft.com/en-us/windows-hardware/drivers/install/driver-signing
- Code signing requirements: https://learn.microsoft.com/en-gb/windows-hardware/drivers/dashboard/code-signing-reqs
