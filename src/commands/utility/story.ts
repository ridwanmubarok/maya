import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { Command } from "../../types";
import { prisma } from "../../services/database";
import { createEmbed } from "../../utils/embeds";
import { announceStorySessionStart, compileDailyStoryForGuild, getTodayStoryStatus } from "../../services/storyManager";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("story")
    .setDescription("Kelola & Akses Maya Dongeng Bersambung Harian")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName("channel")
        .setDescription("Atur channel target tempat Maya Dongeng Bersambung diposting")
        .addChannelOption(opt =>
          opt
            .setName("target")
            .setDescription("Pilih channel teks tempat member menulis cerita")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("start")
        .setDescription("Kirim pengumuman pembukaan sesi Maya Dongeng Bersambung secara manual")
    )
    .addSubcommand(sub =>
      sub
        .setName("publish")
        .setDescription("Rangkai dongeng komedi & render gambar ilustrasi AI hari ini secara langsung")
    )
    .addSubcommand(sub =>
      sub
        .setName("read")
        .setDescription("Baca kata-kata cerita hari ini atau dongeng komedi hasil kesimpulan terakhir")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (subcommand === "channel") {
      const channel = interaction.options.getChannel("target", true);

      await prisma.guildConfig.upsert({
        where: { guildId },
        update: { storyChannelId: channel.id },
        create: { guildId, storyChannelId: channel.id }
      });

      const embed = createEmbed.success(
        "Konfigurasi Channel Cerita Berhasil",
        `Channel target Maya Dongeng Bersambung telah diatur ke ${channel}.`
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === "start") {
      await interaction.deferReply({ ephemeral: true });

      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      const success = await announceStorySessionStart(interaction.guild!, config?.storyChannelId || interaction.channelId);

      if (success) {
        const embed = createEmbed.success(
          "Pengumuman Sesi Cerita Terkirim",
          "Pengumuman pembukaan sesi Maya Dongeng Bersambung telah berhasil dikirim ke channel target!"
        );
        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = createEmbed.error(
          "Gagal Mengirim Pengumuman",
          "Terjadi kesalahan saat mengirim pengumuman sesi cerita. Pastikan channel target sudah diatur."
        );
        await interaction.editReply({ embeds: [embed] });
      }
      return;
    }

    if (subcommand === "publish") {
      await interaction.deferReply({ ephemeral: true });

      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      const success = await compileDailyStoryForGuild(interaction.guild!, config?.storyChannelId || interaction.channelId);

      if (success) {
        const embed = createEmbed.success(
          "Dongeng Berhasil Di-render!",
          "Dongeng Komedi Server & Gambar Ilustrasi AI terbaru telah berhasil diposting ke channel!"
        );
        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = createEmbed.error(
          "Gagal Merender Dongeng",
          "Tidak ada kata yang disumbangkan hari ini atau terjadi kesalahan sistem."
        );
        await interaction.editReply({ embeds: [embed] });
      }
      return;
    }

    if (subcommand === "read") {
      await interaction.deferReply();
      const status = await getTodayStoryStatus(guildId);

      const totalWords = status.totalWords || 0;
      const words = status.words || [];

      if (!status.active || (totalWords === 0 && !status.latestStory)) {
        await interaction.reply({ content: "Belum ada riwayat kata atau dongeng tercatat di server ini." });
        return;
      }

      if (totalWords > 0) {
        const wordChain = words.map(w => `**${w.username}**: "${w.word}"`).join(" ➔ ");
        const embed = new EmbedBuilder()
          .setTitle("📖 Rantai Kata Cerita Hari Ini")
          .setDescription(
            `### Urutan Kata Saat Ini:\n${wordChain}\n\n` +
            `📊 **Total Kata**: **${totalWords} Kata** dari **${status.totalContributors || 0} Member**\n` +
            `💡 *Sesi ditutup & di-render otomatis pukul 22:00 WIB.*`
          )
          .setColor("#5865F2")
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (status.latestStory) {
        const s = status.latestStory;
        const embed = new EmbedBuilder()
          .setTitle(`📖 ${s.title}`)
          .setDescription(
            `*${s.storyText}*\n\n` +
            `🏆 **MVP Kontributor**: <@${s.mvpUserId}> (**${s.mvpUsername}**)\n` +
            `*Alasan Maya AI*: "${s.mvpReason}"\n\n` +
            `👥 **Total Kontributor**: **${s.contributorCount} Member** (${s.dateStr})`
          )
          .setColor("#5865F2")
          .setTimestamp();

        if (s.imageUrl) {
          embed.setImage(s.imageUrl);
        }

        await interaction.editReply({ embeds: [embed] });
      }
    }
  }
};

export default command;
