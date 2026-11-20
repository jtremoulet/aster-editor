# Démo Aster Editor — app Angular statique servie par nginx.
# Essai en local : voir la section « Développement » du README.

# === Stage 1 : build de la démo ===
FROM node:24-alpine AS builder
WORKDIR /app

# Manifestes seuls d'abord : la couche des dépendances reste en cache tant qu'ils ne bougent pas.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/word/package.json packages/word/
COPY packages/ui/package.json packages/ui/
COPY packages/angular/package.json packages/angular/
RUN npm ci --no-audit --no-fund

# La démo compile les paquets depuis leurs sources (`paths` de tsconfig.base.json) :
# pas besoin de `npm run build` avant.
COPY angular.json tsconfig.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/demo/ apps/demo/
RUN npx ng build demo

# === Stage 2 : nginx ===
FROM nginx:alpine
COPY --from=builder /app/dist/demo/browser /usr/share/nginx/html
COPY apps/demo/nginx.conf /etc/nginx/conf.d/default.conf
# Une erreur de syntaxe dans nginx.conf casse le build, pas le démarrage du conteneur.
RUN nginx -t
EXPOSE 80
