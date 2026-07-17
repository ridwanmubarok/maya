import { GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { MayaClient, Command, BotEvent } from "./types";
import { connectDatabase } from "./services/database";
import { initAI } from "./services/aiClient";
import { startDashboard } from "./services/dashboard";
import { logger } from "./utils/logger";

import play from "play-dl";

// Load environment variables
dotenv.config();

// Initialize external services
connectDatabase();
initAI();

function parseNetscapeCookies(text: string): string {
  if (!text.includes("# Netscape") && !text.includes("\t")) {
    return text.trim();
  }
  const lines = text.split(/\r?\n/);
  const cookies: string[] = [];
  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length >= 7) {
      const name = parts[5].trim();
      const value = parts[6].trim();
      cookies.push(`${name}=${value}`);
    }
  }
  return cookies.join("; ");
}

if (process.env.YOUTUBE_COOKIE) {
  try {
    const parsedCookie = parseNetscapeCookies(process.env.YOUTUBE_COOKIE);
    play.setToken({
      youtube: {
        cookie: parsedCookie
      }
    });
    logger.info("YouTube Cookie berhasil dimuat dan diparse untuk play-dl.");
  } catch (err) {
    logger.error("Gagal memuat YouTube Cookie:", err);
  }
}

// Initialize client with correct gateway intents
const client = new MayaClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Load Commands
const loadCommands = () => {
  const commandsPath = path.join(__dirname, "commands");
  const commandFolders = fs.readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    
    // Ensure we are reading a directory
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(file => 
      file.endsWith(".ts") || file.endsWith(".js")
    );

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const commandModule = require(filePath);
        const command: Command = commandModule.default || commandModule;

        if (command && command.data && typeof command.execute === "function") {
          client.commands.set(command.data.name, command);
          logger.info(`Command berhasil dimuat: /${command.data.name}`);
        } else {
          logger.warn(`Command di ${file} tidak memiliki format data/execute yang sesuai.`);
        }
      } catch (error) {
        logger.error(`Gagal memuat command ${file}:`, error);
      }
    }
  }
};

// Load Events
const loadEvents = () => {
  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs.readdirSync(eventsPath).filter(file => 
    file.endsWith(".ts") || file.endsWith(".js")
  );

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const eventModule = require(filePath);
      const event: BotEvent = eventModule.default || eventModule;

      if (event && event.name && event.execute) {
        if (event.once) {
          client.once(event.name, (...args) => event.execute(...args));
        } else {
          client.on(event.name, (...args) => event.execute(...args));
        }
        logger.info(`Event listener berhasil dimuat: ${event.name}`);
      } else {
        logger.warn(`Event di ${file} tidak memiliki format name/execute yang sesuai.`);
      }
    } catch (error) {
      logger.error(`Gagal memuat event ${file}:`, error);
    }
  }
};

// Bootstrap function
const startBot = async () => {
  try {
    loadCommands();
    loadEvents();

    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      logger.error("DISCORD_TOKEN tidak ditemukan di file .env!");
      process.exit(1);
    }

    await client.login(token);
    startDashboard(client);
  } catch (error) {
    logger.error("Gagal melakukan bootstrap aplikasi:", error);
    process.exit(1);
  }
};

startBot();
