# Discord Bot Boilerplate

This repository contains a Discord bot boilerplate built using Deno and the `discord.js` library. The bot includes various commands, events, and interactions to enhance your Discord server experience.

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Commands](#commands)
- [Events](#events)
- [Interactions](#interactions)
- [Modules](#modules)
- [Development](#development)
- [License](#license)

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/ItsKodas/Discord-Boilerplate.git
    cd Discord-Boilerplate
    ```

2. Install Deno:
    Follow the instructions on the [Deno website](https://deno.land/#installation) to install Deno.

3. Install dependencies:
    ```sh
    deno task start
    ```

## Configuration

1. Create a [config.json](http://_vscodecontentref_/0) file in the root directory with the following structure:
    ```json
    {
        "discord": {
            "token": "YOUR_DISCORD_BOT_TOKEN",
            "guild": "YOUR_DISCORD_GUILD_ID"
        },
        "mongo": {
            "uri": "YOUR_MONGODB_URI",
            "db": "YOUR_DATABASE_NAME"
        }
    }
    ```

2. Update the [.gitignore](http://_vscodecontentref_/1) file to ensure [config.json](http://_vscodecontentref_/2) is not tracked by Git.

## Usage

1. Start the bot:
    ```sh
    deno task start
    ```

2. The bot will log in to Discord and register slash commands.

## Commands

Commands are defined in the [commands](http://_vscodecontentref_/3) directory. Each command is a module that exports a [data](http://_vscodecontentref_/4) object and an [execute](http://_vscodecontentref_/5) function.

### Adding a New Command

1. Create a new directory for your command in the [commands](http://_vscodecontentref_/6) directory.
2. Create an `index.ts` file in your command directory with the following structure:
    ```ts
    import Discord from 'discord.js'

    export default {
        data: new Discord.SlashCommandBuilder()
            .setName('your-command')
            .setDescription('Your command description'),

        async execute(interaction: Discord.ChatInputCommandInteraction) {
            // Your command logic
        }
    }
    ```

3. Import and add your command to the [index.ts](http://_vscodecontentref_/7) file:
    ```ts
    import yourCommand from './your-command/index.ts'

    const commands = [
        yourCommand.data,
        // other commands
    ]

    const response: { [key: string]: any } = {
        yourCommand,
        // other commands
    }

    export { commands, response }
    ```

## Events

Events are defined in the [events](http://_vscodecontentref_/8) directory. Each event is a module that exports a default function.

### Adding a New Event

1. Create a new directory for your event in the [events](http://_vscodecontentref_/9) directory.
2. Create an `index.ts` file in your event directory with the following structure:
    ```ts
    import Discord from 'discord.js'

    export default function (/* event parameters */) {
        // Your event logic
    }
    ```

3. Import and add your event to the [index.ts](http://_vscodecontentref_/10) file:
    ```ts
    import yourEvent from './your-event/index.ts'

    const events: { [key: string]: any } = {
        yourEvent,
        // other events
    }

    export default events
    ```

## Interactions

Interactions are defined in the [interactions](http://_vscodecontentref_/11) directory. The bot supports different types of interactions: buttons, modals, and string select menus.

### Adding a New Interaction

1. Create a new directory for your interaction type (e.g., buttons) in the [interactions](http://_vscodecontentref_/12) directory.
2. Create a new directory for your interaction in the interaction type directory.
3. Create an `index.ts` file in your interaction directory with the following structure:
    ```ts
    import Discord from 'discord.js'

    export default async function YourInteraction(interaction: Discord.Interaction, args: string[]) {
        // Your interaction logic
    }
    ```

4. Import and add your interaction to the corresponding interaction type index file (e.g., [app/interactions/buttons/index.ts](http://_vscodecontentref_/13)):
    ```ts
    import yourInteraction from './your-interaction/index.ts'

    const interactions: { [key: string]: any } = {
        yourInteraction,
        // other interactions
    }

    export default interactions
    ```

## Modules

Modules are defined in the [modules](http://_vscodecontentref_/14) directory. Each module is a function that takes the Discord client as a parameter.

### Adding a New Module

1. Create a new directory for your module in the [modules](http://_vscodecontentref_/15) directory.
2. Create an `index.ts` file in your module directory with the following structure:
    ```ts
    export default function yourModule(client: Discord.Client) {
        // Your module logic
    }
    ```

3. Import and add your module to the [index.ts](http://_vscodecontentref_/16) file:
    ```ts
    import yourModule from './your-module/index.ts'

    const modules: { [key: string]: any } = {
        yourModule,
        // other modules
    }

    export default modules
    ```

## Development

To debug the bot, use the provided VS Code launch configuration. Open the [launch.json](http://_vscodecontentref_/17) file and adjust the `program` path if necessary.

## License

This project is licensed under the MIT License.