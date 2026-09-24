# Bookworm (glibc), no alpine: sharp's prebuilt native binary needs glibc,
# and building/running on the same base avoids a musl/glibc mismatch.
# openssl se instala explícito: sin él, Prisma no detecta libssl en esta
# imagen y elige un motor por defecto que puede no coincidir en runtime.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production

# node_modules incluye `prisma` (CLI) a propósito: se usa en el CMD para
# aplicar migraciones en cada arranque, así que no se recorta con
# --omit=dev — el tamaño extra de imagen es aceptable para este proyecto.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json

# multer escribe con una ruta de destino fija y NO crea el directorio solo;
# sin estas carpetas, la primera subida de imagen/adjunto falla con ENOENT.
RUN mkdir -p uploads/products uploads/messages

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
