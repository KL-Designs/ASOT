# ASOT Website

Community management platform for the Australian Special Operations Taskforce (ASOT) milsim unit. Built with Next.js 15, MongoDB, and Discord OAuth.

Features include operations management, ORBAT, member milpacs, a collaborative briefing editor, activity logging, ticketing, and more.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [MongoDB](https://www.mongodb.com/try/download/community) (local or remote)
- A [Discord application](https://discord.com/developers/applications) with a bot and OAuth2 configured

---

## Environment Setup

Copy the template and fill in your values:

```bash
cp .env.template .env
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_BASEURL` | Full base URL of the site (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_COLLAB_WS_URL` | WebSocket URL for the collab server (e.g. `ws://localhost:3000/collab`) |
| `MONGO_URI` | MongoDB connection string (e.g. `mongodb://127.0.0.1:27017`) |
| `MONGO_DB` | MongoDB database name (e.g. `ASOT`) |
| `DISCORD_GUILD_ID` | ID of the Discord server used for member verification |
| `DISCORD_CLIENT_ID` | Discord OAuth2 application client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 application client secret |
| `DISCORD_BOT_TOKEN` | Discord bot token (required for privileged operations) |
| `DISCORD_REDIRECT_URI` | OAuth2 callback path (e.g. `/login/callback`) |
| `DISCORD_SCOPE` | OAuth2 scope (use `identify`) |
| `CRON_SECRET` | Secret string used to authenticate scheduled task requests |
| `OVERRIDE` | Comma-separated Discord user IDs to grant admin access |

### Discord Application Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a new application.
2. Under **OAuth2**, copy the **Client ID** and **Client Secret** into your `.env`.
3. Add a redirect URL matching your `NEXT_PUBLIC_BASEURL` + `DISCORD_REDIRECT_URI` (e.g. `http://localhost:3000/login/callback`).
4. Under **Bot**, create a bot and copy the token into `DISCORD_BOT_TOKEN`.
5. Enable the **Server Members** and **Message Content** privileged intents if prompted.

---

## Installation

```bash
npm install
```

### Terrain Assets

The operations map requires pre-generated terrain images. Run this once after install (or whenever map data in `maps/` changes):

```bash
npm run generate-terrain
```

---

## Running the Development Server

```bash
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

> The standard dev server does **not** include the collaborative briefing editor WebSocket server. To develop with real-time collaboration enabled, use:
>
> ```bash
> npm run dev-collab
> ```

---

## Production Build

```bash
npm run build
npm start
```

`npm start` runs the custom `server.mjs` which hosts both the Next.js app and the Hocuspocus WebSocket server for collaborative editing at `/collab`.

---

## Docker

A `docker-compose.yml` is provided for containerised deployments. It mounts the following directories as volumes so data persists across container restarts:

- `gallery/` — uploaded gallery images
- `milpacs/` — milpac profile assets
- `uploads/` — general file uploads
- `snapshots/` — operation snapshots

```bash
docker-compose up --build
```

The service will be available at [http://localhost:3000](http://localhost:3000).

> Make sure your `.env` is populated before running Docker, as the container reads it at build and runtime.

---

## Project Structure

```
app/           Next.js App Router — pages and API routes
components/    React UI components
lib/           Server-side business logic (MongoDB queries, Discord bot, permissions, etc.)
types/         TypeScript type declarations
hooks/         Custom React hooks
themes/        MUI theme files
scripts/       Build and utility scripts (terrain generation, milpac scraping, marker import)
public/        Static assets (logos, images, audio)
maps/          ARMA 3 DEM terrain data files
```

---

## Tech Stack

- **Frontend:** React 19, Next.js 15, Material UI 7, Tailwind CSS
- **Editors:** TipTap, Yjs, Hocuspocus (real-time collaboration)
- **Backend:** Node.js, MongoDB, Discord API
- **Graphics:** Babylon.js, Three.js, Leaflet, `@napi-rs/canvas`, Sharp
