# ASOT Website

Community management platform for the Australian Special Operations Taskforce (ASOT) milsim unit. Built with Next.js 15, MongoDB, and Discord OAuth.

Features include operations management, ORBAT, member milpacs, a collaborative briefing editor, activity logging, ticketing, and more.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [MongoDB](https://www.mongodb.com/try/download/community) (local or remote)
- A [Discord application](https://discord.com/developers/applications) with a bot and OAuth2 configured

---

## Setup

Run the setup wizard after installing dependencies. It walks you through every configuration step and generates your `.env` file:

```bash
npm install
npm run init-db
```

The wizard covers four steps:

**1. Site Configuration** — sets `NEXT_PUBLIC_BASEURL` and auto-derives the collab WebSocket URL. Defaults to `http://localhost:3000`.

**2. MongoDB** — sets the connection URI and database name, then tests the connection. Defaults to a local `mongodb://127.0.0.1:27017`.

**3. Discord Application** — prompts for your Guild ID, Client ID, Client Secret, and Bot Token. The wizard tells you exactly which redirect URI and bot intents to configure in the [Discord Developer Portal](https://discord.com/developers/applications).

**4. User Account** — opens Discord OAuth in your browser, inserts your account into MongoDB, and automatically adds your Discord ID to `OVERRIDE` in `.env` for admin access.

If you already have a `.env`, the wizard asks whether you want to reconfigure or jump straight to step 4.

> Make sure MongoDB is running and the dev server is **not** running when you run `npm run init-db`.

### Environment Variables Reference

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_BASEURL` | Full base URL of the site (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_COLLAB_WS_URL` | WebSocket URL for the collab server — auto-derived from base URL |
| `MONGO_URI` | MongoDB connection string |
| `MONGO_DB` | MongoDB database name |
| `DISCORD_GUILD_ID` | ID of the Discord server used for member verification |
| `DISCORD_CLIENT_ID` | Discord OAuth2 application client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 application client secret |
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `DISCORD_REDIRECT_URI` | OAuth2 callback path (default `/login/callback`) |
| `CRON_SECRET` | Auto-generated secret for authenticating scheduled task requests |
| `OVERRIDE` | Comma-separated Discord user IDs with unconditional admin access |

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
