import fastify, { FastifyServerOptions } from "fastify";
import { FastifyInstance, FastifyRequest } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from '@fastify/static';
import config from "../config";
import cors from "@fastify/cors";
import path from "path";
import fs from "fs";

const app = fastify({
  logger: true,
  https: config.ssl ? {
    key: fs.readFileSync(path.join(__dirname, 'server.key')),
    cert: fs.readFileSync(path.join(__dirname, 'server.cert'))
  } : null
});

/**
 * Раздаем статику (таблицу лидеров по главному пути)
 */
app.register(fastifyStatic, {
  root: path.join(__dirname, '../../frontend/dist'),
  prefix: '/', 
  decorateReply: false
});


/**
 * Настройки CORS
 */
app.register(cors, {
  origin: config.allowedOrigins,
});

/**
 * Глобальный обработчик ошибок в API
 */
app.setErrorHandler((error, request, reply) => {
  console.log(error);
  reply.status(500).send({
    error: "Ошибка сервера 500",
    requestId: request.id,
  });
});

/**
 * Ограничения по запросам RPS
 */
app.register(fastifyRateLimit, {
  global: false,
  max: config.maxRPM,
  timeWindow: "1 minute",
  keyGenerator: (req: FastifyRequest) => {
    // Используем токен пользователя как ключ для лимита
    return req.user?.token || req.ip; // fallback на IP если токена нет
  },
  errorResponseBuilder: (req, context) => {
    console.log("errorResponseBuilder", req.rateLimit);
    return {
      statusCode: 429,
      error: "Too Many Requests",
      message: `Превышен лимит запросов (${config.maxRPM} в минуту). Попробуйте через ${context.after}`,
    };
  },
});

/**
 * Fastify swagger
 */
app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "PaintBattle",
      description: "PaintBattle",
      version: "1.0.0",
    },
    servers: [
      {
        url: "http://localhost:3031",
      },
    ],
    components: {
      securitySchemes: {
        apiToken: {
          type: "apiKey",
          name: "token",
          in: "header",
          description: "Токен авторизации",
        },
      },
    },
    tags: [
      {
        name: "User",
        description: "Пользовательские API",
      },
      {
        name: "Game",
        description: "Результаты и выстрел",
      },
      {
        name: "Level",
        description: "API для работы с уровнем",
      },
    ],
  },
});

app.register(require("@fastify/swagger-ui"), {
  routePrefix: "/api",
  uiConfig: {
    docExpansion: "full",
    deepLinking: false,
  },
  staticCSP: true,
  transformSpecificationClone: true,
});

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

const start = async () => {
  await app.ready();
  app.swagger();
  try {
    await app.listen({
      port: config.ssl ? 443 : config.port,
      host: "0.0.0.0",
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
