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
