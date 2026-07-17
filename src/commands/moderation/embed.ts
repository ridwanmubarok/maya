import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, TextChannel, EmbedBuilder, ChannelType } from "discord.js";
import { Command } from "../../types";
import { createEmbed } from "../../utils/embeds";
import { logModeration } from "../../utils/moderationLogger";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Mengirimkan pesan embed kustom (berguna untuk info, rules, guide)")
    .addChannelOption(opt =>
      opt
        .setName("channel")
        .setDescription("Channel tujuan pengiriman embed")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("deskripsi")
        .setDescription("Isi pesan embed (gunakan \\n untuk baris baru)")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("judul")
        .setDescription("Judul embed card")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("warna")
        .setDescription("Kode warna Hex (contoh: #ff0000 atau #5865f2)")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("banner")
        .setDescription("URL gambar banner besar di bagian bawah")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("thumbnail")
        .setDescription("URL gambar thumbnail kecil di kanan atas")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const executorMember = interaction.member as GuildMember;
    const isServerOwner = interaction.user.id === interaction.guild?.ownerId;
    const hasOwnerRole = executorMember?.roles.cache.some(role => role.name.toLowerCase() === "owner");

    if (!isServerOwner && !hasOwnerRole) {
      await interaction.reply({
        embeds: [createEmbed.error("Akses Ditolak", "Maaf, perintah ini hanya dapat dijalankan oleh pemilik server (Owner) atau anggota dengan role **Owner**.")],
        ephemeral: true
      });
      return;
    }

    const channel = interaction.options.getChannel("channel", true);
    const description = interaction.options.getString("deskripsi", true).replace(/\\n/g, "\n");
    const title = interaction.options.getString("judul");
    const colorStr = interaction.options.getString("warna");
    const bannerUrl = interaction.options.getString("banner");
    const thumbnailUrl = interaction.options.getString("thumbnail");

    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      await interaction.reply({
        embeds: [createEmbed.error("Gagal", "Channel tujuan harus berupa channel teks.")],
        ephemeral: true
      });
      return;
    }

    try {
      const textChannel = channel as TextChannel;
      const embed = new EmbedBuilder()
        .setDescription(description)
        .setTimestamp();

      if (title) embed.setTitle(title);

      if (colorStr) {
        const hex = colorStr.replace("#", "");
        const colorInt = parseInt(hex, 16);
        if (!isNaN(colorInt)) {
          embed.setColor(colorInt);
        }
      } else {
        embed.setColor(0x5865F2); // Default blurple
      }

      if (bannerUrl && bannerUrl.trim().startsWith("http")) {
        embed.setImage(bannerUrl.trim());
      }

      if (thumbnailUrl && thumbnailUrl.trim().startsWith("http")) {
        embed.setThumbnail(thumbnailUrl.trim());
      }

      await textChannel.send({ embeds: [embed] });

      await interaction.reply({
        embeds: [createEmbed.success("Sukses", `Pesan embed berhasil dikirim ke channel ${channel}.`)],
        ephemeral: true
      });

      // Log action to moderation logs
      await logModeration(
        interaction.guild!,
        "WARN",
        { id: channel.id, tag: `#${textChannel.name}` },
        { id: interaction.user.id, tag: interaction.user.tag },
        `Mengirim embed kustom via bot (Judul: ${title || "N/A"})`
      );

    } catch (error: any) {
      await interaction.reply({
        embeds: [createEmbed.error("Gagal Mengirim", `Terjadi kesalahan: ${error.message}`)],
        ephemeral: true
      });
    }
  }
};

export default command;
