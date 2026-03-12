# Backend Dockerfile optimizado para producción
FROM node:20-alpine AS builder

# Instalar dependencias del sistema para Prisma y compilación
RUN apk add --no-cache libc6-compat openssl python3 make g++

# Crear directorio de trabajo
WORKDIR /app

# Copiar solo archivos de configuración para cachear dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Limitar memoria para evitar OOM kills
ENV NODE_OPTIONS="--max_old_space_size=1536"

# Instalar dependencias (incluyendo devDependencies para Prisma CLI)
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Copiar código fuente
COPY . .

# Generar cliente Prisma y compilar
RUN npx prisma generate && npm run build

# Eliminar dependencias de desarrollo para reducir tamaño
RUN npm prune --production

# Stage de producción más ligero
FROM node:20-alpine AS runner

# Instalar solo dependencias necesarias para runtime y Chromium para Puppeteer
# nss, freetype, harfbuzz, ca-certificates, ttf-freefont son necesarios para Puppeteer en Alpine
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Configurar variables de entorno para Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Crear directorio de trabajo
WORKDIR /app

# Crear usuario no-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copiar archivos necesarios del builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Crear directorio para uploads con permisos correctos
RUN mkdir -p /app/uploads && chown -R nodejs:nodejs /app/uploads

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 3001
ENV PORT 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Comando para iniciar
CMD ["node", "dist/main.js"]