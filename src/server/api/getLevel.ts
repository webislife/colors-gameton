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
