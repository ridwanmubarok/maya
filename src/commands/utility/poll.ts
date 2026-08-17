import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../types";
import { prisma } from "../../services/database";
import { createEmbed } from "../../utils/embeds";
import { startDailyPollForGuild } from "../../services/dailyPollManager";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Kelola & Trigger Maya Poll Harian")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName("create")
        .setDescription("Trigger & buat Maya Poll konyol baru secara langsung")
    )
    .addSubcommand(sub =>
      sub
        .setName("channel")
        .setDescription("Atur channel target tempat Maya Poll diposting")
        .addChannelOption(opt =>
          opt
            .setName("target")
            .setDescription("Pilih channel teks")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (subcommand === "channel") {
      const channel = interaction.options.getChannel("target", true);

      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { dailyPollChannelId: channel.id },
        create: { guildId, dailyPollChannelId: channel.id }
      });

      const embed = createEmbed.success(
        "Konfigurasi Channel Poll Berhasil",
        `Channel target Maya Poll telah berhasil diatur ke ${channel}.`
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === "create") {
      await interaction.deferReply({ ephemeral: true });

      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      const success = await startDailyPollForGuild(interaction.guild, config?.dailyPollChannelId || interaction.channelId);

      if (success) {
        const embed = createEmbed.success(
          "Maya Poll Berhasil Dibuat!",
          "Maya Poll lucu terbaru telah berhasil diposting ke channel!"
        );
        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = createEmbed.error(
          "Gagal Membuat Poll",
          "Terjadi kesalahan saat memproses pembuatan Maya Poll. Pastikan bot memiliki izin di channel target."
        );
        await interaction.editReply({ embeds: [embed] });
      }
    }
  }
};

export default command;
