# Use official Node.js LTS image
FROM denoland/deno:latest

# Set working directory
WORKDIR /app

# Copy the rest of the project
COPY . .

ENV TZ=Australia/Sydney
RUN apt-get update && apt-get install -y tzdata
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Run your Deno app
CMD ["deno", "task", "start"]