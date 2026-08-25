import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { Command } from "../../types";
import { getTodayPantunStatus, getWibHour } from "../../services/pantunManager";
import { prisma } from "../../services/database";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("pantun")
    .setDescription("Fitur interaktif Maya Lanjutkan Pantun")
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Lihat bait pembuka pantun hari ini dan status sesi")
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Lihat kiriman pantun dari member server hari ini")
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({ content: "Command ini hanya bisa digunakan di dalam server.", ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      const pantunData = await getTodayPantunStatus(guildId);

      if (!config || !config.pantunEnabled) {
        await interaction.reply({
          content: "Fitur **Maya Lanjutkan Pantun** belum diaktifkan di server ini oleh admin.",
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "status") {
        if (!pantunData) {
          await interaction.reply({
            content: "Sesi pantun hari ini belum dibuka. Sesi buka otomatis pukul **09:00 WIB**!",
            ephemeral: true,
          });
          return;
        }

        const currentHour = getWibHour();
        const startHour = config.pantunStartHour ?? 9;
        const closeHour = config.pantunCloseHour ?? 23;
        const isSessionOpen = pantunData.isActive && currentHour >= startHour && currentHour < closeHour;

        const embed = new EmbedBuilder()
          .setTitle("🎭 MAYA LANJUTKAN PANTUN • STATUS HARI INI")
          .setColor(isSessionOpen ? "#F59E0B" : "#10B981")
          .setDescription(
            `Status Sesi: **${isSessionOpen ? "🟢 Sedang Dibuka" : "🔴 Sedang Ditutup"}**\n` +
            `Jadwal: **${startHour}:00 WIB** s/d **${closeHour}:00 WIB**\n` +
            `Channel: ${config.pantunChannelId ? `<#${config.pantunChannelId}>` : "*Belum diatur*"}`
          )
          .addFields(
            {
              name: `📜 Bait Pembuka Maya (${pantunData.theme || "Pantun Hari Ini"})`,
              value: pantunData.starterLines.split("\n").map((l) => `> *${l}*`).join("\n"),
              inline: false,
            },
            {
              name: "📊 Partisipasi Hari Ini",
              value: `Total **${pantunData.submissions.length} member** telah mengirim pantun lanjutan hari ini.`,
              inline: false,
            }
          )
          .setFooter({
            text: "Maya Lanjutkan Pantun • 1 Kesempatan per member/hari",
            iconURL: interaction.client.user?.displayAvatarURL(),
          })
          .setTimestamp();

        if (pantunData.mvpUserId && pantunData.mvpPantun) {
          embed.addFields({
            name: `👑 Juara MVP Pantun: @${pantunData.mvpUsername}`,
            value: `> *"${pantunData.mvpPantun}"*\n💬 *"${pantunData.mvpReason}"*`,
            inline: false,
          });
        }

        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (subcommand === "list") {
        if (!pantunData || pantunData.submissions.length === 0) {
          await interaction.reply({
            content: "Belum ada member yang mengirim pantun lanjutan hari ini. Jadilah yang pertama di channel pantun!",
            ephemeral: true,
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle("📜 DAFTAR PANTUN MEMBER HARI INI")
          .setColor("#3B82F6")
          .setDescription(
            `**Bait Pembuka Maya:**\n${pantunData.starterLines.split("\n").map((l) => `> *${l}*`).join("\n")}\n\n` +
            `Berikut kiriman pantun dari member:`
          )
          .setFooter({
            text: `Total ${pantunData.submissions.length} pantun terkumpul`,
            iconURL: interaction.client.user?.displayAvatarURL(),
          })
          .setTimestamp();

        const recentSubmissions = pantunData.submissions.slice(0, 10);
        recentSubmissions.forEach((sub, idx) => {
          embed.addFields({
            name: `${idx + 1}. @${sub.username}`,
            value: `> *"${sub.content}"*`,
            inline: false,
          });
        });

        await interaction.reply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("Error in /pantun command:", error);
      await interaction.reply({
        content: "Terjadi kesalahan saat memproses data pantun.",
        ephemeral: true,
      });
    }
  },
};

export default command;
