FROM node:23-alpine AS builder
ARG IS_DOCKER_BUILD="1"
WORKDIR /app

COPY .. . 

# Install pnpm
RUN npm install -g pnpm

RUN pnpm install --frozen-lockfile

RUN pnpm build

FROM node:23-alpine AS runner

WORKDIR /app

RUN npm install -g pnpm

RUN apk add --no-cache curl bash \
    && curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Add the UV installation steps
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy the build output from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public/

EXPOSE 3000

CMD ["pnpm", "start"]