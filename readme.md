### Battle colors gameton

- [Репозиторий](https://github.com/webislife/colors-gameton)
- [Swagger](https://colors.stroko.beget.tech/api)
- [Таблица лидеров](https://colors.stroko.beget.tech/)

## Краткая инструкция по установке локально
1. Клонируем репозиторий
2. Конфигурируем под себя src/config.ts
3. Закидываем в папку level PNG изображения своих уровней (важно чтобы они были одинакового размера) сам размер также можно изменить через config.ts
4. Генерируете клиент Prisma и пушите в бд `npx prisma generate && npx prisma db push`
5. В папке `dist/server/api` создаете пустую папку images  - там будут складывать холсты пользователей
6. Запускаете сервер `node dist/server/index.js`

## RoadMap
 - ✅ Разработать основные API для игры
 - ✅ Интегрировать rate limit для ограничения кол-ва запросов
 - ✅ Мультитред вычисления worker for users
 - ✅ Написать vue таблицу лидеров
 - ✅ Причесать всю документацию
 - ✅ Сервер с игрой
 - ⌛ Хабр статья