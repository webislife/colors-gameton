import { PrismaClient } from '@prisma/client';
import { FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { FastifyRequest } from 'fastify/types/request';

const prisma = new PrismaClient();

export const preValidation = async function(request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) {
    const token = request.headers["token"] as string;
    // Check if the token exists in the headers
    if (!token) {
      reply.code(401).send({ error: "Token is missing in headers" });
      done();
      return;
    }
    // Check if the token exists in the Prisma user table
    const user = await prisma.user.findUnique({
      where: {
        token: token,
      },
    });
    if (!user) {
      reply.code(401).send({ error: "Invalid token" });
      done();
      return;
    }
    request.user = user;
  };