// PrismaClient 싱글턴 (서버 전용).
// 개발 중 HMR로 모듈이 반복 평가되면 커넥션이 폭증하므로 globalThis에 캐싱한다.
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
