FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm install --workspace=@doria/web --include-workspace-root=false

COPY apps/web ./apps/web

ARG VITE_API_BASE_URL=
ARG VITE_WS_URL=
ARG VITE_APP_PUBLIC_URL=http://localhost:8080
ARG VITE_PRIVACY_CONTACT_EMAIL=ritanshletsplayfootball@gmail.com
ARG VITE_GOOGLE_AUTH_ENABLED=false

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_APP_PUBLIC_URL=$VITE_APP_PUBLIC_URL
ENV VITE_PRIVACY_CONTACT_EMAIL=$VITE_PRIVACY_CONTACT_EMAIL
ENV VITE_GOOGLE_AUTH_ENABLED=$VITE_GOOGLE_AUTH_ENABLED

RUN npm --workspace=@doria/web run build

FROM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
