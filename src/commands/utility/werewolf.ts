import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags
} from "discord.js";
import { Command } from "../../types";
import { werewolfManager } from "../../services/werewolfManager";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("werewolf")
    .setDescription("🐺 Main Werewolf dipandu langsung oleh Maya sebagai Game Master di Voice Channel!")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Buka lobby pendaftaran game Werewolf di Voice Channel")
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("Hentikan permainan Werewolf yang sedang berlangsung")
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
        content: "Kamu harus berada di Voice Channel terlebih dahulu untuk bermain Werewolf bersama Maya!",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "start") {
      await interaction.deferReply();

      const res = await werewolfManager.createLobby(
        guild.id,
        interaction.channel!,
        voiceChannel,
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

    if (subcommand === "end") {
      const ended = werewolfManager.endGame(guild.id);
      if (!ended) {
        await interaction.reply({
          content: "Tidak ada permainan Werewolf yang sedang aktif.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.reply({
        content: "🛑 Permainan Werewolf telah dihentikan oleh " + (member.displayName || interaction.user.username) + "."
      });
      return;
    }
  }
};
