import { ChatInputCommandInteraction, SlashCommandBuilder, Client, Collection } from "discord.js";

export interface Command {
  data: SlashCommandBuilder | any;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: any) => Promise<void>;
}

export interface BotEvent {
  name: string;
  once?: boolean;
  execute: (...args: any[]) => void | Promise<void>;
}

export class MayaClient extends Client {
  commands = new Collection<string, Command>();
}
