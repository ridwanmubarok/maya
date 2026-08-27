import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  GuildMember, 
  MessageFlags 
} from "discord.js";
import { Command } from "../../types";
import { todManager, TodCategory } from "../../services/todManager";
import { voiceChatManager } from "../../services/voiceChatManager";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("tod")
    .setDescription("🍾 Main Truth or Dare dipandu langsung oleh Maya di Voice Channel!")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Mulai sesi Truth or Dare bersama teman-teman di Voice Channel")
        .addStringOption((opt) =>
          opt
            .setName("kategori")
            .setDescription("Pilih tingkat keseruan game")
            .setRequired(false)
            .addChoices(
              { name: "🟢 Santai & Lucu (Casual Tongkrongan)", value: "casual" },
              { name: "💖 Kepo & Romantis / Crush (Deep & Romance)", value: "crush" },
              { name: "🔥 Gokil & Ekstrem (Spicy & Challenging)", value: "extreme" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("spin")
        .setDescription("Putar botol untuk mengacak korban berikutnya")
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("Akhiri sesi Truth or Dare yang sedang berjalan")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const guild = interaction.guild;

    if (!guild || !member) {
      await interaction.reply({
        content: "Command ini hanya dapat digunakan di dalam server Discord!",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({
        content: "Kamu harus bergabung ke Voice Channel terlebih dahulu untuk bermain Truth or Dare bersama Maya!",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "start") {
      const category = (interaction.options.getString("kategori") || "casual") as TodCategory;
      await interaction.deferReply();

      const res = await todManager.startSession(
        guild.id,
        interaction.channel!,
        voiceChannel,
        category,
        interaction.user
      );

      if (!res.success) {
        await interaction.editReply({ content: `❌ ${res.message}` });
        return;
      }

      await interaction.editReply({
        embeds: res.embed ? [res.embed] : [],
        components: res.components || []
      });
      return;
    }

    if (subcommand === "spin") {
      const session = todManager.getSession(guild.id);
      if (!session) {
        await interaction.reply({
          content: "Belum ada sesi Truth or Dare yang aktif. Mulai dengan `/tod start`!",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply();
      const res = await todManager.spinBottle(guild.id, interaction.user);

      if (!res.success) {
        await interaction.editReply({ content: `❌ ${res.message}` });
        return;
      }

      await interaction.editReply({
        embeds: res.embed ? [res.embed] : [],
        components: res.components || []
      });
      return;
    }

    if (subcommand === "end") {
      const ended = todManager.endSession(guild.id);
      if (!ended) {
        await interaction.reply({
          content: "Tidak ada sesi Truth or Dare yang sedang berjalan.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.reply({
        content: "🛑 Sesi Truth or Dare telah diakhiri oleh " + (member.displayName || interaction.user.username) + "."
      });
      return;
    }
  }
};
