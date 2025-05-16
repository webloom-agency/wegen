# Stage 1: Build the Next.js application
FROM node:23-alpine AS builder

WORKDIR /app

# Copy package.json and pnpm-lock.yaml (if you have one) first
# to leverage Docker's layer caching
COPY package.json pnpm-lock.yaml* ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

RUN pnpm initial:flag-generate
RUN pnpm build


# Stage 2: Run the Next.js application
FROM node:23-alpine AS runner

WORKDIR /app

# Copy the build output from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public/

# Expose the port Next.js runs on (default is 3000)
EXPOSE 3000

# Set the command to run the Next.js application
CMD ["pnpm", "start"]
