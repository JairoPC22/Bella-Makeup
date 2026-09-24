FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Vite incrusta las variables VITE_* en el bundle en tiempo de build, no de
# arranque — hay que pasarla como build arg (--build-arg en EasyPanel) con
# la URL pública del backend, ej. https://api.tudominio.com/api.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
