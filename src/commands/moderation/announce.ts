import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, TextChannel, EmbedBuilder, ChannelType, Role } from "discord.js";
import { Command } from "../../types";
import { createEmbed } from "../../utils/embeds";
import { logModeration } from "../../utils/moderationLogger";
import { logger } from "../../utils/logger";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Mengirimkan pengumuman resmi ke channel tertentu dengan opsi mention pings")
    .addChannelOption(opt =>
      opt
        .setName("channel")
        .setDescription("Channel tujuan pengumuman")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("deskripsi")
        .setDescription("Isi pengumuman (gunakan \\n untuk baris baru)")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("judul")
        .setDescription("Judul pengumuman")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("mention")
        .setDescription("Role/ping yang ingin disebutkan dalam pengumuman")
        .setRequired(false)
        .addChoices(
          { name: "@everyone", value: "everyone" },
          { name: "@here", value: "here" },
          { name: "Tidak Ada", value: "none" }
        )
    )
    .addRoleOption(opt =>
      opt
        .setName("mention_role")
        .setDescription("Sebutkan role spesifik (mengabaikan opsi mention di atas)")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("warna")
        .setDescription("Warna sisi kartu (hex, contoh: #f04747)")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("banner")
        .setDescription("URL gambar banner besar")
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName("thumbnail")
        .setDescription("URL gambar thumbnail kecil")
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
    const mention = interaction.options.getString("mention");
    const mentionRole = interaction.options.getRole("mention_role") as Role;
    const colorStr = interaction.options.getString("warna");
    const bannerUrl = interaction.options.getString("banner");
    const thumbnailUrl = interaction.options.getString("thumbnail");

    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      await interaction.reply({
        embeds: [createEmbed.error("Gagal", "Channel tujuan harus berupa channel teks atau pengumuman.")],
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
        embed.setColor(0xE67E22); // Orange theme for announcements
      }

      if (bannerUrl && bannerUrl.trim().startsWith("http")) {
        embed.setImage(bannerUrl.trim());
      }

      if (thumbnailUrl && thumbnailUrl.trim().startsWith("http")) {
        embed.setThumbnail(thumbnailUrl.trim());
      }

      // Determine content ping
      let content = "";
      if (mentionRole) {
        content = `<@&${mentionRole.id}>`;
      } else if (mention === "everyone") {
        content = "@everyone";
      } else if (mention === "here") {
        content = "@here";
      }

      await textChannel.send({ content: content || undefined, embeds: [embed] });

      await interaction.reply({
        embeds: [createEmbed.success("Sukses", `Pengumuman berhasil dikirim ke channel ${channel}.`)],
        ephemeral: true
      });

      // Log action
      logger.info(`Pengumuman dikirim oleh ${interaction.user.tag} di #${textChannel.name}`);
    } catch (error: any) {
      await interaction.reply({
        embeds: [createEmbed.error("Gagal Mengirim", `Terjadi kesalahan: ${error.message}`)],
        ephemeral: true
      });
    }
  }
};

export default command;
