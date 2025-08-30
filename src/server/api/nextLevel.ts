import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { preValidation } from "./middleware/preValidation";
import config from "../../config";
const prisma = new PrismaClient();

module.exports = (app: FastifyInstance) => {
  app.get<{ Body: { nickname: string } }>(
    "/api/level/next",
    {
      config: {
        rateLimit: {
          max: config.maxRPM,
          timeWindow: "1 minute",
        },
      },
      schema: {
        security: [{ apiToken: [] }],
        tags: ["Level"],
        summary: "Переключиться на следующий уровень",
        description: "После вызова, пользователю становится доступен следующий уровень, действие нельзя отменить",
        response: {
          200: {
            type: "object",
            properties: {
              level: { type: "number" },
            },
          },
        },
      },
      preValidation,
    },
    async (request, reply) => {
      if (request.user) {
        const currentLevel = request.user?.level;
        let newLevel = currentLevel;
        console.log("currentLevelt", currentLevel, "maxlbl", config.levels);
        if (config.levels > currentLevel) {
          newLevel = currentLevel + 1;
        }
        //Переводим пользователя на новый уровень
        await prisma.user.update({
          where: { id: request.user.id },
          data: {
            level: newLevel,
          },
        });
        //Создаем запись про новый уровень
        const userLevel = await prisma.level.create({
          data: {
            userId: request.user.id,
            level: newLevel,
            shots: 0,
            miss: 0,
            score: 0,
          },
        });
        reply.status(200).send({ level: newLevel });
      } else {
        reply.status(401).send({ error: "Invalid user" });
      }
    }
  );
};
