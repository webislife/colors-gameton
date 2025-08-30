import { FastifyInstance, FastifyRequest } from "fastify";
import { PrismaClient } from "@prisma/client";
import { preValidation } from "./middleware/preValidation";
import config from "../../config";
const prisma = new PrismaClient();
module.exports = (app: FastifyInstance) => {
  app.get(
    "/api/colors/list",
    {
      config: {
        rateLimit: {
          max: config.maxRPM,
          timeWindow: "1 minute",
        },
      },
      schema: {
        summary: "Список цветов",
        description: "Список доступных цветов для игрока",
        tags: ["Colors"],
        security: [{ apiToken: [] }],
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
      const user = request.user;
      if (user) {
        const colors = await prisma.color.findMany({
          where: {
            userId: +user.id,
          },
        });
        reply.code(200).send({ colors: colors.map((color) => color.color) });
      } else {
        reply.code(401).send({ error: "Invalid user" });
      }
    }
  );
};
