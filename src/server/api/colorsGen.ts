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
        description: `Генерирует ${config.genColorsCount} случайных цветов за 1 ход`,
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
        let genColorsCount = config.genColorsCount;

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
