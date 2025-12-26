# Use official Node.js LTS image
FROM denoland/deno:latest

# Set working directory
WORKDIR /app

# Copy the rest of the project
COPY . .

# Run your Deno app
CMD ["deno", "task", "start"]