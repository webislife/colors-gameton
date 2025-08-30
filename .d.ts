import 'fastify';
import FastifyRequest from "fastify";

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