import { SlashCommandBuilder, ChatInputCommandInteraction, TextChannel } from "discord.js";
import { Command } from "../../types";
import { prisma } from "../../services/database";
import { createEmbed } from "../../utils/embeds";
import { createMabarEmbed, createMabarButtons } from "../../services/mabarManager";
import { logger } from "../../utils/logger";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("schedule-game")
    .setDescription("Jadwalkan sesi mabar game baru lengkap dengan tombol RSVP interaktif")
    .addStringOption(opt =>
      opt
        .setName("game")
        .setDescription("Nama game yang akan dimainkan (contoh: Valorant, GTA V)")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("waktu")
        .setDescription("Waktu pelaksanaan mabar (contoh: Malam ini 20:00, Besok jam 15:00)")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("deskripsi")
        .setDescription("Detail atau ketentuan mabar (contoh: Push rank bareng, butuh role support)")
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName("maks_pemain")
        .setDescription("Batas maksimal jumlah pemain yang bisa bergabung")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("link_game")
        .setDescription("URL / Link game (contoh: Roblox, Steam, Room link)")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const game = interaction.options.getString("game", true);
    const playTime = interaction.options.getString("waktu", true);
    const description = interaction.options.getString("deskripsi", true);
    const maxPlayers = interaction.options.getInteger("maks_pemain");
    const gameUrl = interaction.options.getString("link_game");

    await interaction.deferReply({ ephemeral: true });

    try {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased()) {
        await interaction.editReply({
          embeds: [createEmbed.error("Gagal", "Perintah ini hanya bisa dijalankan di channel teks.")]
        });
        return;
      }

      // Generate a temporary ID for mabar session so we can attach it to buttons customId
      const tempSession = await prisma.gameSession.create({
        data: {
          guildId: interaction.guildId!,
          channelId: channel.id,
          messageId: `temp_${Date.now()}`,
          game,
          description,
          playTime,
          maxPlayers,
          gameUrl,
          creatorId: interaction.user.id,
          participants: [interaction.user.id] // Creator is joined by default
        }
      });

      // Render embed
      const embed = createMabarEmbed({
        id: tempSession.id,
        game,
        description,
        playTime,
        maxPlayers,
        gameUrl,
        creatorId: interaction.user.id,
        participants: [interaction.user.id]
      });

      const buttons = createMabarButtons(tempSession.id, gameUrl);

      const msg = await (channel as TextChannel).send({
        embeds: [embed],
        components: [buttons]
      });

      // Update message ID in DB
      await prisma.gameSession.update({
        where: { id: tempSession.id },
        data: { messageId: msg.id }
      });

      await interaction.editReply({
        embeds: [createEmbed.success("Sukses", `Jadwal mabar **${game}** berhasil diposting di channel ini!`)]
      });

      // Log action
      logger.info(`Sesi mabar baru dijadwalkan oleh ${interaction.user.tag}: ${game} pada ${playTime}`);
    } catch (error) {
      console.error("Error creating mabar schedule:", error);
      await interaction.editReply({
        embeds: [createEmbed.error("Error", "Gagal menjadwalkan mabar. Terjadi kesalahan pada database.")]
      });
    }
  }
};

export default command;
