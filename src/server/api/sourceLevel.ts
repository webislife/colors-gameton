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
      request: FastifyRequest<{
        Querystring: { userId: string; level: string };
      }>,
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
          error: "Image not found",
          message: `Изображение ${imagePath} не найдено`,
        });
      }
    }
  );
};
