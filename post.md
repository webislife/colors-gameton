Сегодня мы разработаем с 0 собственный геймтон и запустим соревнования среди хабравчан и всех желающих just for fun.  А также дадим возможность запустить свой геймтон локально по своим правилам Под катом вас ждет разработка геймтона на стеке nodejs + prisma + vuejs + fastify. А также пример разработки фулстек приложения с различными тонкостями построения API.
---

## Общая концепция игры
Существует виртуальный холст (canvas) размером 1024 х 768px на условном удалении от холста в 1000px по центру относительно холста находится катапульта которая может стрелять цветами (условно как пейнтбольное ружье). Есть 5 уровней с разными изображениями. Игрок сам выбирает какие цвета зарядить для выстрела (цвета будут смешаны в момент выстрела) а также выбрать угол наводки оружия на холст по Y и X координатам и силу выстрела. Чем больше цветов в 1 выстреле тем больше итоговое пятно выстрела (работает когда цветов более 3). Игрок имеет ограниченный набор цветов (по умолчанию в конфиге максимум 2000 цветов) и может генерировать и добавлять себе в набор по 5 цветов за 1 запрос. Задача игрока используя управление катапультой изобразить на холсте максимально приближенное изображение к изображению уровня.
Возможно получилось сумбурно, но если коротко - ваша задача с помощью выстрелов нарисовать изображение уровня на холсте. Выиграл тот, у кого наиболее похожее изображение.

## Технологический стек
Т.к. в основном я занимаюсь frontend разработкой выбор для меня был очевиден это TypeScript + nodejs + fastify + vuejs и еще несколько библиотек, напишу о каждой по порядку
- `fastify` - Выступает в роли http сервера, думаю в представлении не нуждается
- `@fastify/cors` - будет использоваться для регулирования кроссдоменных запросов
- `@fastify/rate-limit` - ограничивает количество запросов от 1 пользователя. Является частью игровой механики для искуственного ограничения скорости запросов к серверу, что помогает не уложить сервер от DDOS а также уравнять пользователей с разным пингом по умолчанию я установил скорость запросов для 1 токена в 120 запросов в минуту.
- `@fastify/static` - через static будем раздавать статику нашего vue SPA приложения с таблицей лидеров
- `@fastify/swagger` - с помощью аннотаций к нашим API методам будем сразу выстраивать swagger UI документацию для удобства игроков``
- `prisma` - ORM в которой мы составим основные схемы сущностей, а также избежим по максимум написания голых запросов.
- `sqlite3` - для асинхронного неблокирующего биндинга с БД для Prisma
- `canvas` - Импементация web canvas API для nodejs
Ну и `tsc` с `typescript` думаю в представлении не нуждаются)

## Готовим основные сущности в БД  с Prisma Schema
Сущностей\таблиц в проекте всего 3 это сам пользователь, цвета которые генерирует пользователь во время игры и сущность уровня пользователя в которой мы храним статистику по уровню - количество выстрелов, промахов и общий счет баллов.

```
model User {
  id  Int @id @default(autoincrement())
  nickname    String   @unique
  token String @unique
  level Int
  colors Color[]
  levels Level[]
}

model Color {
  id  Int @id @default(autoincrement())
  user  User @relation(fields: [userId], references: [id])
  userId Int
  color String
}

model Level {
  id  Int @id @default(autoincrement())
  level Int
  user  User @relation(fields: [userId], references: [id])
  userId Int
  score Int
  miss  Int
  shots Int
}
```
После описания схемы в проекте необходимо выполнить команды `npx prisma generate` для генерации клиента Prisma и `npx prisma db push` для применения схемы к текущей базе данных.

## Реализация API
[Ссылка на Swagger](https://colors.stroko.beget.tech/api)
В проекте всего 8 API давайте рассмотрим каждую из них + я покажу пару моментов при реализации APIшек
Для удоства я все API буду складывать в папку `src/server/api` и с помощью простого кода
```typescript
/**
 * Регистрируем API роуты
 */
app.register(async (app) => {
  // Автоматически вычитываем файлы из папки /api
  const apiDirectory = path.join(__dirname, "api"); 
  const apiRoutes = fs
    .readdirSync(apiDirectory)
    .filter((file) => file.endsWith(".js")) 
    .map((file) => file.replace(".js", ""));
  apiRoutes.forEach((route) => {
    console.log("Register route", route);
    require("./api/" + route)(app);
  });
});
```
Буду регистрировать файлы как API роуты, это избавляет от необходимости каждый раз в ручную регистрировать файлы роутов в fastify приложении
1. Регистрация - POST `/api/user/register` - тут ничего сложного, пользователь отправляем нам nickname в запросе и получает в ответ token который будет использоваться для доступа ко всем игровым API

<spoiler title="Реализация API /user/register">

```typescript
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import config from "../../config";
import { response400 } from "./schemas/response400";
const prisma = new PrismaClient();

module.exports = (app: FastifyInstance) => {
  app.post<{ Body: { nickname: string } }>(
    "/api/user/register",
    {
      config: {
        rateLimit: {
          max: config.maxRPM,
          timeWindow: "1 minute",
        },
      },
      schema: {
        body: {
          type: "object",
          required: ["nickname"],
          properties: {
            nickname: { type: "string" },
          },
        },
        tags: ["User"],
        response: {
          200: {
            type: "object",
            properties: {
              nickname: { type: "string" },
              level: { type: "number" },
              token: { type: "string" },
            },
          },
          ...response400
        },
      },
    },
    async (request, reply) => {
      const { nickname } = request.body;
      const token = crypto
        .createHash("sha256")
        .update(nickname + Date.now())
        .digest("hex");
      //Проверяем есть ли  пользователь с таким ником
      const existUser = await prisma.user.findFirst({
        where: {
          nickname,
        },
      });
      if (existUser) {
        reply
          .status(400)
          .send({
            error: "Пользователь с таким никнеймом уже зарегестрирован",
          });
      }
      //Создаем пользователя
      const user = await prisma.user.create({
        data: {
          nickname,
          level: 1,
          token,
        },
      });

      //Создаем запись о первом уровне
      const usreLevel = await prisma.level.create({
        data: {
          userId: user.id,
          level: 1,
          shots: 0,
          miss: 0,
          score: 0,
        },
      });

      reply.status(200).send({ nickname, level: 1, token });
    }
  );
};

```

</spoiler>



2. Получение текущего холста пользователя - GET `/api/user/level` - для того чтобы получить свой текущий холст и результаты выстрелов, пользователь может запросить свой уровень передав токен в заголовках полученный при регистрации. Для всех API где мы получаем пользователя по токену, я вынес функцию валидации и проверки токена в отдельный файл `src/server/api/middleware/preValidation.ts`  c его помощью, при успешной авторизации, нам всегда будет доступен пользователь в текущем запросе `req.user` - это очень удобно при работе с API требующими данные пользователя

<spoiler title="Реализация middleware/preValidation.ts">


```typescript
import { PrismaClient } from '@prisma/client';
import { FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { FastifyRequest } from 'fastify/types/request';

const prisma = new PrismaClient();

export const preValidation = async function(request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) {
    const token = request.headers["token"] as string;
    // Check if the token exists in the headers
    if (!token) {
      reply.code(401).send({ error: "Token is missing in headers" });
      done();
      return;
    }
    // Check if the token exists in the Prisma user table
    const user = await prisma.user.findUnique({
      where: {
        token: token,
      },
    });
    if (!user) {
      reply.code(401).send({ error: "Invalid token" });
      done();
      return;
    }
    request.user = user;
  };
```
Главное не забыть еще расширить тип FastifyRequest новыми данными
```typescript
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: number;
      nickname: string;
      token: string;
      level: number;
    };
    rateLimit: {
      current: number;
      remaining: number;
    };
  }
}
```

</spoiler>

Ну и сама реализация получения холста пользователя, ничего сложного, просто получаем холст (png изображение) на основе текущего уровня и ID пользователя

<spoiler title="Реализация /user/level">

```typescript
import { FastifyInstance, FastifyRequest } from "fastify";
import path from "path";
import fs from "fs";
import config from "../../config";
module.exports = (app: FastifyInstance) => {
  app.get(
    "/api/user/level",
    {
      config: {
        rateLimit: {
          max: config.maxRPM,
          timeWindow: '1 minute'
        }
      },
      schema: {
        summary: "Получить текущий уровень пользователя",
        description:
          "Возвращает PNG-изображение уровня пользователя",
        tags: ["User"],
        querystring: {
          type: "object",
          required: ["userId", "level"],
          properties: {
            userId: {
              type: "string",
              description: "ID пользователя",
            },
            level: {
              type: "string",
              description: "Номер уровня",
            },
          },
        },
        response: {
          200: {
            description: "PNG-изображение",
            headers: {
              "Content-Type": { type: "string", enum: ["image/png"] },
            },
            type: "string",
            format: "binary",
          },
          404: {
            description: "Изображение не найдено",
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          400: {
            description: "Ошибка валидации параметров",
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    /**
     * Возвращаем изображение текущего уровня пользователю
     */
    async (
      request: FastifyRequest<{
        Querystring: { userId: string; level: string };
      }>,
      reply
    ) => {
      const { userId, level } = request.query;

      // Валидация параметров
      if (!userId || !level) {
        return reply.status(400).send({
          error: "Validation Error",
          message: "Параметры userId и level обязательны",
        });
      }

      const imageName = `${userId}-${level}.png`;
      const imagePath = path.join(__dirname, "../api/images", imageName);

      if (fs.existsSync(imagePath)) {
        return reply
          .header("Content-Type", "image/png")
          .send(fs.readFileSync(imagePath));
      } else {
        return reply.status(404).send({
          error: "Image not found",
          message: `Изображение ${imageName} не найдено`,
        });
      }
    }
  );
};

```

</spoiler>

3. После регистрации, знакомства со своим холстом стоит познакомиться с изображением уровня которое нам необходимо будет изобразить на холсте. Для этого служит API GET `/api/level/source` в целом API не отличается от предыдущей за исключением того, что возвращает PNG изображение текущего уровня пользователя, а не его холста.

<spoiler title="Реализация /api/level.source">

```typescript
import { FastifyInstance, FastifyRequest } from "fastify";
import path from "path";
import fs from "fs";
import config from "../../config";
import { preValidation } from "./middleware/preValidation";
import { response400 } from "./schemas/response400";

module.exports = (app: FastifyInstance) => {
  app.get(
    "/api/level/source",
    {
      config: {
        rateLimit: {
          max: config.maxRPM,
          timeWindow: '1 minute'
        }
      },
      preValidation,
      schema: {
        security: [{ apiToken: [] }],
        summary: "Получить изображение текущего уровня",
        description:
          "Возвращает PNG-изображение текущего уровня пользователя",
        tags: ["Level"],
        response: {
          200: {
            description: "PNG-изображение",
            headers: {
              "Content-Type": { type: "string", enum: ["image/png"] },
            },
            type: "string",
            format: "binary",
          },
          404: {
            description: "Изображение не найдено",
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          ...response400
        },
      },
    },
    /**
     * Возвращаем изображение текущего уровня пользователю
     */
    async (
      request,
      reply
    ) => {
      const imageName = `${request.user?.level}.png`;
      const imagePath = path.join(__dirname, "../../../levels", imageName);

      if (fs.existsSync(imagePath)) {
        return reply
          .header("Content-Type", "image/png")
          .send(fs.readFileSync(imagePath));
      } else {
        return reply.status(404).send({
          error: "404",
          message: `Изображение ${imagePath} не найдено`,
        });
      }
    }
  );
};

```

</spoiler>

4. Теперь, когда мы научились работать с текущим уровнем и холстом, настало время подготовиться к первому выстрелу, но прежде чем мы совершим первый выстрел, нам необходимо сгенерировать себе первый набор цветов. Для этого служит API GET `/api/colors/generate` - в результате вызова API вы получите в свое распоряжение 5 hex цветов которые уже можно использовать для выстрела по холсту. Функция генерации рандомных цветов и их запись в БД достаточно проста, по этому не будем останавливаться на ней.

<spoiler title="Реализация colors/generate">

```typescript
import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { preValidation } from "./middleware/preValidation";
import config from "../../config";

const prisma = new PrismaClient();

// Function to generate a random color in RGB HEX format
function generateRandomColor() {
  return (
    "#" +
    Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "0")
  );
}

module.exports = (app: FastifyInstance) => {
  app.get(
    "/api/colors/generate",
    {
      config: {
        rateLimit: {
          max: config.maxRPM,
          timeWindow: "1 minute",
        },
      },
      schema: {
        security: [{ apiToken: [] }],
        summary: "Генерация цветов",
        description: "Генерирует 5 случайных цветов за 1 ход",
        tags: ["Colors"],
        response: {
          200: {
            type: "object",
            properties: {
              colors: { type: "array" },
            },
          },
        },
      },
      preValidation,
    },
    async (request, reply) => {
      let user = request.user;
      if (user) {
        const userColorsCount = await prisma.color.count({
          where: { userId: +user.id },
        });
        let genColorsCount = 5;

        if (userColorsCount === config.colorsLimit) {
          reply.code(400).send({ error: "Limit colors reached" });
        }
        if (userColorsCount + 5 > config.colorsLimit) {
          genColorsCount = config.colorsLimit - userColorsCount;
        }

        // Generate random colors
        const colors = Array.from({ length: genColorsCount }, () =>
          generateRandomColor()
        );
        // Add the generated colors to the database using Prisma
        await Promise.all(
          colors.map(async (color) => {
            return prisma.color.create({
              data: {
                color,
                userId: +user.id,
              },
            });
          })
        );
        reply.code(200).send({ colors });
      } else {
        reply.code(401).send({ error: "Invalid user" });
      }
    }
  );
};

```

</spoiler>

5. После того, как мы нагенерировали себе множество цветов, мы можем получить их все запросом GET /api/colors/list из которых мы уже можем выбирать какие цвета будем использовать для выстрела. При выстреле, цвета будут смешиваться в один цвет.
Как математически выглядит смешивание цветов? На самом деле достаточно просто, по сути смешанный цвет это среднее арифметическое от цветов и высчитывается достаточно просто

```typescript
/**
 * Смешивание цветов
 * @param colors массив hex цветов
 * @returns hex смешанный цвет
 */
const mixColors = (colors: string[]): string => {
  let r = 0,
    g = 0,
    b = 0;

  colors.forEach((hex) => {
    const bigint = parseInt(hex.slice(1), 16);
    r += (bigint >> 16) & 255;
    g += (bigint >> 8) & 255;
    b += bigint & 255;
  });

  const colorCount = colors.length;
  r = Math.floor(r / colorCount);
  g = Math.floor(g / colorCount);
  b = Math.floor(b / colorCount);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

```

Сумму цветов по каждому каналу делим на количество цветов и получаем итоговый цвет. Easy)

6. Наконец, когда мы уже можем приступить к самой интересной части геймтона - стрельбе по холсту POST `/api/game/shoot`. Я реализовал механику таким образом, что снаряд в нашем киберпространстве не имеет сопротивления и при любом значении силы выстрела power ваш снаряд долетит до холста рано или поздно т.к. в формуле баллистики не учитывается сопротивление таким образом вам всегда гарантирован долет до линии холста и промах или попадание. Если вы попали - в ответ API вернет вам PNG изображения обновленного холста, а если вы промажете - API вернет вам координаты промаха, чтобы вам было проще пристреляться. Готовой формулы расчета и перевода целевых координат пикселя в выстрел я приводить не буду ради сохранения спортивного интереса, хотя весь код расчета выстрела доступен на гитхабе и любая ИИшка расскажет вам секрет расчета правильного выстрела)
Остановлюсь на механике выстрела более подробно.
Первым делом мы проверяем, если у пользователя цвета, которые он передал для выстрела. Т.к. один и тотже цвет в выстреле может присутствовать более 1 раза, необходимо проверить не только наличие цвета в таблице, но и количество записей с таким цветов у пользователя
```typescript
// Получаем актуальные количества цветов
        const colorEntries = await prisma.color.groupBy({
          by: ["color"],
          where: { userId: user.id },
          _count: { color: true },
        });
```
Для подсчета количества в Prisma добавляем параметр `_count: { color: true },` при запросе.
Далее удаляем каждый цвет из БД но т.к. цвета могут повторяться, необходимо удалить только нужное количество цветов из таблицы пользователя, в этом моменте инструментов Prisma не хватает, по этому пришлось написать raw SQL запрос удаляющий определенный цвет в определенном количестве
```typescript
// Проверяем доступность и готовим удаление
        const colorsToDelete = [];
        const unavailableColors = [];

        for (const [color, requestedCount] of Object.entries(
          requestColorCounts
        )) {
          const availableCount = dbColorCounts[color] || 0;

          if (availableCount >= requestedCount) {
            colorsToDelete.push({ color, count: requestedCount });
          } else {
            unavailableColors.push(color);
          }
        }
        //Если есть недоступные цвета, отменяем удаление
        if (unavailableColors.length > 0) {
          return { availableColors: [], unavailableColors };
        } else {
          // Удаляем доступные цвета
          for (const { color, count } of colorsToDelete) {
            await prisma.$executeRaw`
              DELETE FROM Color
              WHERE id IN (
                SELECT id FROM Color
                WHERE userid = ${user.id} 
                  AND color = ${color}
                ORDER BY id
                LIMIT ${count}
              );
            `;
          }
```

Получив от пользователя X, Y углы выстрела, а также цвета и силу выстрела, путем расчета примитивной баллистики мы получаем 
