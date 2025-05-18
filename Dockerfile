FROM node:23-alpine AS builder
ARG IS_DOCKER_BUILD="1"
WORKDIR /app

# Copy package.json and pnpm-lock.yaml (if you have one) first
# to leverage Docker's layer caching
COPY package.json pnpm-lock.yaml* ./

# Copy the entire scripts directory (still good practice in case other scripts are needed later)
COPY scripts ./scripts

# Install pnpm
RUN npm install -g pnpm

RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

RUN pnpm build


FROM node:23-alpine AS runner

WORKDIR /app

RUN npm install -g pnpm bun

# Add the UV installation steps
ADD https://astral.sh/uv/install.sh /uv-installer.sh
RUN sh /uv-installer.sh && rm /uv-installer.sh
ENV PATH="/root/.local/bin/:$PATH"

# Copy the build output from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public/

EXPOSE 3000

CMD ["pnpm", "start"]