import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Command } from "../../types";
import { nobarManager } from "../../services/nobarManager";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("nobar")
    .setDescription("Buat Stage Nonton Bareng (Watch Party) tersinkronisasi real-time")
    .addStringOption(opt =>
      opt
        .setName("url")
        .setDescription("Link YouTube (e.g. https://www.youtube.com/watch?v=...) atau link MP4 direct")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("judul")
        .setDescription("Judul acara/video yang akan ditonton bareng (Opsional)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const videoUrl = interaction.options.getString("url", true);
    const title = interaction.options.getString("judul") || "Stage Nonton Bareng Maya";

    const hostName = interaction.user.globalName || interaction.user.username;
    const hostId = interaction.user.id;
    const guildId = interaction.guildId || undefined;
    const guildName = interaction.guild?.name || undefined;

    // Create Stage Room
    const room = nobarManager.createRoom(title, videoUrl, hostId, hostName, guildId, guildName);

    // Build Web Stage Link
    const port = process.env.PORT || 3000;
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;
    const userAvatar = interaction.user.displayAvatarURL({ extension: "png" });

    const stageUrl = `${baseUrl}/stage.html?room=${room.id}&user=${encodeURIComponent(hostName)}&userId=${hostId}&avatar=${encodeURIComponent(userAvatar)}`;

    const embed = new EmbedBuilder()
      .setTitle(`🍿 Stage Nonton Bareng: ${room.title}`)
      .setDescription(
        `Host **${hostName}** telah membuka Stage Virtual Nonton Bareng!\n\n` +
        `📹 **Video Source**: [Klik di sini untuk lihat source](${room.videoUrl})\n` +
        `🎟️ **Kode Room**: \`${room.id}\`\n\n` +
        `Klik tombol di bawah ini untuk bergabung ke Stage Nonton Bareng dengan pemutar video tersinkronisasi, chat live, dan reaksi emoji melayang!`
      )
      .setColor("#9933FF") // Neon Violet / Purple
      .setThumbnail(userAvatar)
      .addFields(
        { name: "🎬 Mode Pemutar", value: room.videoType === "youtube" ? "YouTube Player Sync" : "Direct MP4 Player Sync", inline: true },
        { name: "👑 Host Stage", value: hostName, inline: true },
        { name: "👥 Penonton", value: "1 bergabung (Host)", inline: true }
      )
      .setFooter({ text: "Maya Virtual Stage • Synchronized Watch Party", iconURL: interaction.client.user?.displayAvatarURL() })
      .setTimestamp();

    const joinButton = new ButtonBuilder()
      .setLabel("🍿 Join Stage Nonton Bareng")
      .setStyle(ButtonStyle.Link)
      .setURL(stageUrl);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton);

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};

export default command;
