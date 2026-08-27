import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags
} from "discord.js";
import { Command } from "../../types";
import { dndManager, DndTheme } from "../../services/dndManager";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("dnd")
    .setDescription("🐉 Petualangan D&D Fantasi Nusantara dipandu Maya sebagai Dalang di Voice Channel!")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Mulai petualangan D&D Nusantara bersama rombongan pendekar di Voice Channel")
        .addStringOption((opt) =>
          opt
            .setName("tema")
            .setDescription("Pilih babad petualangan & musuh gaib Nusantara")
            .setRequired(false)
            .addChoices(
              { name: "🌲 Alas Roban Angker & Raja Genderuwo Hitam", value: "alas_roban" },
              { name: "🌊 Segara Kidul & Panglima Siluman Buaya Putih", value: "pantai_selatan" },
              { name: "🌋 Kawah Keramat Merapi & Raja Banaspati Purba", value: "gunung_merapi" },
              { name: "🏯 Candi Terbengkalai & Ratu Rangda Calon Arang", value: "candi_leak" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("roll")
        .setDescription("🎲 Lempar dadu D&D (D20, D6, D100, dll.)")
        .addStringOption((opt) =>
          opt
            .setName("tipe")
            .setDescription("Jenis dadu yang ingin dilempar")
            .setRequired(false)
            .addChoices(
              { name: "🎲 D20 (Dadu Standar D&D)", value: "d20" },
              { name: "🎲 D6 (Dadu Biasa)", value: "d6" },
              { name: "🎲 D10 (Dadu Puluhan)", value: "d10" },
              { name: "🎲 D12 (Dadu Senjata Berat)", value: "d12" },
              { name: "🎲 D100 (Persentase Peluang)", value: "d100" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("Hentikan petualangan D&D yang sedang berjalan")
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

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "roll") {
      const dice = interaction.options.getString("tipe") || "d20";
      const result = dndManager.rollDice(dice);
      await interaction.reply({
        content: `👤 **${member.displayName || interaction.user.username}** melempar dadu:\n${result.text}`
      });
      return;
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({
        content: "Kamu harus berada di Voice Channel terlebih dahulu untuk bermain D&D bersama Maya!",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === "start") {
      const theme = (interaction.options.getString("tema") || "dungeon") as DndTheme;
      await interaction.deferReply();

      const res = await dndManager.createLobby(
        guild.id,
        interaction.channel!,
        voiceChannel,
        interaction.user,
        theme
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
      const ended = dndManager.endSession(guild.id);
      if (!ended) {
        await interaction.reply({
          content: "Tidak ada petualangan D&D yang sedang berlangsung.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.reply({
        content: "🛑 Petualangan D&D telah diakhiri oleh " + (member.displayName || interaction.user.username) + "."
      });
      return;
    }
  }
};
