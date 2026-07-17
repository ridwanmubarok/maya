import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../types";
import { prisma } from "../../services/database";
import { createEmbed } from "../../utils/embeds";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Mengatur konfigurasi server untuk bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName("welcome")
        .setDescription("Mengatur channel sapaan member baru")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Pilih channel teks")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (subcommand === "welcome") {
      const channel = interaction.options.getChannel("channel", true);

      // Upsert guild configuration in Prisma
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { welcomeChannelId: channel.id },
        create: { guildId, welcomeChannelId: channel.id }
      });

      const embed = createEmbed.success(
        "Konfigurasi Berhasil",
        `Channel welcome telah berhasil diatur ke ${channel}.`
      );

      await interaction.reply({ embeds: [embed] });
    }
  }
};

export default command;
