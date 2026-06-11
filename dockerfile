FROM denoland/deno:latest

RUN apt-get update && apt-get install -y ffmpeg curl python3 && rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

WORKDIR /app

COPY . .

RUN deno cache index.ts

CMD ["sh", "-c", "yt-dlp -U || true && deno task start"]
