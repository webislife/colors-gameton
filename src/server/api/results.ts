import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import config from '../../config';

const prisma = new PrismaClient();

module.exports = function (app: FastifyInstance) {
  app.get('/api/game/results', {
    config: {
        rateLimit: {
          max: config.maxRPM,
          timeWindow: "1 minute",
        },
      },
    schema: {
      summary: "Получение результатов игроков",
      description: "Возвращает результаты игроков, сгруппированные по userId и отсортированные по общему score",
      tags: ["Game"],
      querystring: {
        type: 'object',
        properties: {
          order: { 
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc'
          }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'number' },
              totalScore: { type: 'number' },
              nickname: { type: 'string' },
              levels: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    level: { type: 'number' },
                    score: { type: 'number' },
                    miss: { type: 'number' },
                    shots: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { order = 'desc' } = request.query as { order?: 'asc' | 'desc' };

    const usersWithLevels = await prisma.user.findMany({
      select: {
        id: true,
        nickname: true,
        levels: {
          select: {
            id: true,
            level: true,
            score: true,
            miss: true,
            shots: true
          }
        }
      }
    });

    const results = usersWithLevels
      .map((user) => {
        const totalScore = user.levels.reduce((sum, level) => sum + level.score, 0);
        return {
          userId: user.id,
          nickname: user.nickname,
          totalScore,
          levels: user.levels
        };
      })
      .sort((a, b) => order === 'desc' ? b.totalScore - a.totalScore : a.totalScore - b.totalScore);

    return reply.send(results);
  });
}