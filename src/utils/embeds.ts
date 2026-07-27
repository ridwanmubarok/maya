import { EmbedBuilder } from "discord.js";

// Premium Hex Colors
export const COLORS = {
  PRIMARY: 0x5865F2, // Blurple
  SUCCESS: 0x57F287, // Emerald
  ERROR: 0xED4245,   // Crimson
  WARNING: 0xFEE75C, // Amber
  AI: 0x9B5DE5       // Purple for AI
};

export const createEmbed = {
  success: (title: string, description: string) => {
    return new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();
  },
  error: (title: string, description: string) => {
    return new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();
  },
  warning: (title: string, description: string) => {
    return new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();
  },
  info: (title: string, description: string) => {
    return new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();
  },
  ai: (prompt: string, response: string) => {
    // Truncate response if it's too long for embed description (max 4096)
    const truncatedResponse = response.length > 4000 
      ? response.substring(0, 4000) + "\n... (jawaban terpotong)"
      : response;

    return new EmbedBuilder()
      .setColor(COLORS.AI)
      .setTitle("Maya AI")
      .addFields(
        { name: "Pertanyaan", value: prompt.length > 1024 ? prompt.substring(0, 1021) + "..." : prompt },
        { name: "Jawaban", value: truncatedResponse }
      )
      .setTimestamp()
      .setFooter({ text: "Didukung oleh NVIDIA NIM (Llama 3.1)" });
  }
};
