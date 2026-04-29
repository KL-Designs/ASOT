# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the project
COPY . .

# Generate terrain assets for all maps that have a DEM
RUN node scripts/generate-terrain.mjs

# Build Next.js app
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build

# Expose the port your Next.js app runs on
EXPOSE 3000

# Start the Next.js app
CMD ["npm", "start"]