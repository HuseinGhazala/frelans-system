# صورة Docker للوحة التحكم (apps/web)
# البناء: docker build -t rased-web .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/web/prisma apps/web/prisma
COPY apps/web/prisma.config.ts apps/web/
# بنسطب dependencies بتاعة الموقع بس (من غير برنامج الديسكتوب)
RUN DATABASE_URL=postgresql://build@localhost/build pnpm install --frozen-lockfile --filter web...
COPY apps/web apps/web
RUN cd apps/web && DATABASE_URL=postgresql://build@localhost/build pnpm exec prisma generate && pnpm build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 STORAGE_DIR=/data/storage
COPY --from=build /app /app
WORKDIR /app/apps/web
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
# بيطبّق تحديثات قاعدة البيانات وبعدين يشغّل السيرفر
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec next start -p ${PORT}"]
