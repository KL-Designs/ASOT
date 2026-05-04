# Use official Node.js LTS image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Terrain generation — separate layer so it only re-runs when maps/ or scripts/ change,
# not on every app code change.
COPY maps/ ./maps/
COPY scripts/ ./scripts/
RUN node scripts/generate-terrain.mjs

# Copy the rest of the project and build
COPY . .
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build

# Expose the port your Next.js app runs on
EXPOSE 3000

# Start the Next.js app
CMD ["npm", "start"]