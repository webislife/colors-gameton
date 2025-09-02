import { FastifyInstance, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client";
import { createCanvas, loadImage } from "canvas";
import path from "path";
import fs from "fs";
import { preValidation } from "./middleware/preValidation";
import { Worker } from "worker_threads";
import config from "../../config";

const prisma = new PrismaClient();
const countColors = (colors: string[]) => {
  const colorCount: Record<string, number> = {};
  colors.forEach((color: string) => {
    colorCount[color] = (colorCount[color] || 0) + 1;
  });
  return colorCount;
};

// Храним таймеры и последние данные выстрелов по пользователям
const userTimers = new Map<number, NodeJS.Timeout>();
// Информация о последнем выстреле пользователя
const lastShots = new Map<number, { level: number; userId: number }>();
// Воркеры для вычислений выстрела
const workers = new Map<number, Worker>;

// Собственная реализация debounce
function debounce(userId: number, callback: () => void, delay: number) {
  // Очищаем предыдущий таймер для этого пользователя
  if (userTimers.has(userId)) {
    clearTimeout(userTimers.get(userId));
  }

  // Устанавливаем новый таймер
  const timer = setTimeout(() => {
    callback();
    userTimers.delete(userId);
  }, delay);

  userTimers.set(userId, timer);
}

module.exports = (app: FastifyInstance) => {
  app.post(
    "/api/game/shoot",
    {
      config: {
        rateLimit: {
          max: config.maxRPM,
          timeWindow: "1 minute",
        },
      },
      schema: {
        security: [{ apiToken: [] }],
        summary: "Выстрел",
        description: "Выстрел",
        tags: ["Game"],
        body: {
          type: "object",
          required: ["colors", "angleX", "angleY", "power"],
          properties: {
            colors: {
              type: "array",
              maxItems: 100, // Максимум 100 цветов
              items: {
                type: "string",
                pattern: "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$", // Валидация HEX-цвета
              },
              description:
                "Массив цветов снаряда в HEX-формате (максимум 100 цветов)",
            },
            angleX: {
              type: "number",
              minimum: -90,
              maximum: 90,
              description:
                "Горизонтальный угол выстрела (от -90 до 90 градусов)",
            },
            angleY: {
              type: "number",
              minimum: 0,
              maximum: 90,
              description: "Вертикальный угол выстрела (от 0 до 90 градусов)",
            },
            power: {
              type: "number",
              minimum: 0,
              maximum: 1000000,
              description: "Сила выстрела (от 0 до 1 000 000 условных единиц)",
            },
          },
        },
        response: {
          200: {
            description: "Успешный выстрел (возвращает PNG-изображение)",
            headers: {
              "Content-Type": { type: "string", enum: ["image/png"] },
            },
            type: "string",
            format: "binary",
          },
          400: {
            description: "Ошибка валидации или промах",
            type: "object",
            properties: {
              error: {
                type: "string",
                example: "Промах: снаряд не достиг цели",
              },
              targetX: {
                type: "number",
                description: "X-координата цели",
                example: 45.2,
              },
              targetY: {
                type: "number",
                description: "Y-координата цели",
                example: 78.9,
              },
            },
          },
        },
      },
      preValidation,
    },
    async (request, reply) => {
      const user = request.user;
      const { colors, power, angleX, angleY } = request.body as {
        colors: string[];
        power: number;
        angleX: number;
        angleY: number;
      };
      //Переводим градусы в радианы для дальнейших расчетов
      const radianAngleX = angleX * (Math.PI / 180);
      const radianAngleY = angleY * (Math.PI / 180);
      if (!user) {
        return reply.status(401).send({ error: "Invalid token" });
      }
      const imagePath = path.join(
        __dirname,
        "images",
        `${user.id}-${user.level}.png`
      );

      //Если файла с уровнем нету, то создаем пустой холст
      if (!fs.existsSync(imagePath)) {
        // Создаем canvas с нужными размерами
        const canvas = createCanvas(config.canvasWidth, config.canvasHeight);
        const context = canvas.getContext("2d");
        context.fillStyle = "rgba(255, 255, 255, 1)";
        context.fillRect(0, 0, config.canvasWidth, config.canvasHeight);
        // Сохраняем в файл
        fs.writeFileSync(
          imagePath,
          new Uint8Array(canvas.toBuffer("image/png"))
        );
      }

      // Validation for max colors
      if (colors.length > 100) {
        return reply
          .status(400)
          .send({ error: "Максимум 100 цветов на выстрел" });
      }
      //Проверяем доступность цветов у пользователя и удаляем их при наличии
      const requestColorCounts = countColors(colors);
      const colorsTransaction = await prisma.$transaction(async (prisma) => {
        // Получаем актуальные количества цветов
        const colorEntries = await prisma.color.groupBy({
          by: ["color"],
          where: { userId: user.id },
          _count: { color: true },
        });

        const dbColorCounts = colorEntries.reduce(
          (acc: Record<string, number>, entry) => {
            acc[entry.color] = entry._count.color;
            return acc;
          },
          {}
        );

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

          return {
            availableColors: colorsToDelete.map((c) => c.color),
            unavailableColors,
          };
        }
      });

      if (colorsTransaction.unavailableColors.length > 0) {
        return reply.status(400).send({
          error: `Цвета не обнаружены: ${colorsTransaction.unavailableColors.join(
            ", "
          )}`,
        });
      }

      // Считаем баллистическую траекторию
      const canvasWidth = config.canvasWidth;
      const canvasHeight = config.canvasHeight;
      //Кеф гравитации
      const g = 1; 
      //Дистанция до полотна
      const L = 200; 
      const V0 = power / colors.length;
      const cosY = Math.cos(radianAngleY);
      const sinY = Math.sin(radianAngleY);
      const cosX = Math.cos(radianAngleX);
      const sinX = Math.sin(radianAngleX);
      const Vz = V0 * cosY * cosX;
      const Vx = V0 * cosY * sinX;
      const Vy = -V0 * sinY;
      const t = L / Vz;
      const targetY = canvasHeight + Vy * t + (g * t ** 2) / 2;
      const targetX = canvasWidth / 2 + Vx * t;

      // Смешиваем цвета
      const mixedColor = mixColors(colors);

      // Create the canvas
      console.log("shoot", "x", targetX, "y", targetY);
      // Проверяем, что попал в область канваса
      if (
        targetX < 0 ||
        targetX > canvasWidth ||
        targetY < 0 ||
        targetY > canvasHeight
      ) {
        //Если попал, обновляем данные о уровне
        updateLevel(user.id, user.level, true);
        return reply.status(400).send({ error: "Промах!", targetX, targetY });
      }
      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = canvas.getContext("2d");
      // Размер круга попадания зависит от количества красок
      const circleSize = colors.length - 3 > 0 ? colors.length - 3 : 1;
      const image = await loadImage(imagePath);
      ctx.drawImage(image, 0, 0);

      // Рисуем круг в месте попадания
      ctx.fillStyle = mixedColor;
      ctx.beginPath();
      ctx.arc(targetX, targetY, circleSize, 0, Math.PI * 2);
      ctx.fill();
      // Сохраняем канвас как изображение
      const buffer = canvas.toBuffer("image/png");
      fs.writeFileSync(imagePath, new Uint8Array(buffer));
      reply.header("Content-Type", "image/png").send(buffer);

      updateLevel(user.id, user.level);

      // Добавляем выстрел в очередь на обработку
      lastShots.set(user.id, { level: user.level, userId: user.id });

      //Запускаем отлоежжный расчет выстрела
      debounce(
        user.id,
        () => {
          if (!lastShots.has(user.id)) return;
          const shotData = lastShots.get(user.id);
          const worker = workers.get(user.id) ?? new Worker("./dist/server/calculateRateWorker.js");
          worker.postMessage(shotData);
          worker.on("message", (result: any) => {
            console.log(`Calculated result for user ${user.id}:`, result);
          });
        },
        config.rateCalcTimeout
      );
    }
  );
};

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

/**
 * Обновление данных о уровне после выстрела
 * @param userId
 * @param level
 * @param miss
 */
async function updateLevel(
  userId: number,
  level: number,
  miss: boolean = false
) {
  const currentLevel = await prisma.level.findFirst({
    where: {
      userId,
      level,
    },
  });
  let data: Record<string, { increment: number }> = {
    shots: {
      increment: 1,
    },
  };
  if (miss) {
    data.miss = {
      increment: 1,
    };
  }
  //Записываем выстрел и промах
  if (currentLevel) {
    await prisma.level.update({
      where: {
        id: currentLevel.id,
      },
      data,
    });
  }
}
