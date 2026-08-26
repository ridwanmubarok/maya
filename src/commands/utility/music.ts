import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  GuildMember, 
  EmbedBuilder, 
  MessageFlags 
} from "discord.js";
import { Command } from "../../types";
import { musicManager } from "../../services/musicManager";
import { voiceChatManager } from "../../services/voiceChatManager";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("music")
    .setDescription("Putar musik berkualitas tinggi bersama Maya di Voice Channel 🎵")
    .addSubcommand((sub) =>
      sub
        .setName("play")
        .setDescription("Putar lagu atau tambahkan ke antrean musik")
        .addStringOption((opt) =>
          opt
            .setName("judul")
            .setDescription("Judul lagu atau URL YouTube / Spotify yang ingin diputar")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("skip")
        .setDescription("Lewati lagu yang sedang diputar")
    )
    .addSubcommand((sub) =>
      sub
        .setName("pause")
        .setDescription("Jeda lagu yang sedang diputar")
    )
    .addSubcommand((sub) =>
      sub
        .setName("resume")
        .setDescription("Lanjutkan kembali lagu yang dijeda")
    )
    .addSubcommand((sub) =>
      sub
        .setName("stop")
        .setDescription("Hentikan pemutaran musik dan kosongkan antrean")
    )
    .addSubcommand((sub) =>
      sub
        .setName("queue")
        .setDescription("Lihat daftar antrean lagu saat ini")
    )
    .addSubcommand((sub) =>
      sub
        .setName("nowplaying")
        .setDescription("Lihat informasi lagu yang sedang diputar")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    const member = interaction.member as GuildMember;

    if (!guild || !member) {
      await interaction.reply({
        content: "Command ini hanya dapat digunakan di server Discord!",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const voiceChannel = member.voice.channel;

    // Subcommand: Play
    if (subcommand === "play") {
      if (!voiceChannel && !voiceChatManager.isConnected(guild.id)) {
        await interaction.reply({
          content: "Kamu harus bergabung ke Voice Channel terlebih dahulu sebelum memutar musik!",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const query = interaction.options.getString("judul", true);
      await interaction.deferReply();

      const result = await musicManager.play(guild.id, query, interaction.user, voiceChannel || undefined);

      if (!result.success) {
        await interaction.editReply({
          content: `❌ ${result.message}`
        });
        return;
      }

      const track = result.track!;
      const embed = new EmbedBuilder()
        .setColor(0xF472B6)
        .setTitle("🎵 Maya Music Player")
        .setDescription(result.message)
        .addFields(
          { name: "⏱️ Durasi", value: track.duration || "N/A", inline: true },
          { name: "👤 Pemesan", value: track.requestedBy, inline: true }
        )
        .setFooter({ text: "Maya Music Companion • play-dl HD Audio", iconURL: interaction.client.user?.displayAvatarURL() })
        .setTimestamp();

      if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Subcommand: Skip
    if (subcommand === "skip") {
      const skipped = await musicManager.skip(guild.id);
      if (skipped) {
        await interaction.reply({
          content: "⏭️ Lagu berhasil dilewati! Memutar lagu berikutnya..."
        });
      } else {
        await interaction.reply({
          content: "Tidak ada lagu yang sedang diputar untuk dilewati!",
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    // Subcommand: Pause
    if (subcommand === "pause") {
      const paused = musicManager.pause(guild.id);
      if (paused) {
        await interaction.reply({
          content: "⏸️ Musik berhasil dijeda! Gunakan `/music resume` untuk melanjutkan."
        });
      } else {
        await interaction.reply({
          content: "Tidak ada musik yang sedang berputar untuk dijeda!",
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    // Subcommand: Resume
    if (subcommand === "resume") {
      const resumed = musicManager.resume(guild.id);
      if (resumed) {
        await interaction.reply({
          content: "▶️ Musik dilanjutkan kembali!"
        });
      } else {
        await interaction.reply({
          content: "Musik tidak dalam kondisi dijeda!",
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    // Subcommand: Stop
    if (subcommand === "stop") {
      musicManager.stop(guild.id);
      await interaction.reply({
        content: "⏹️ Musik dihentikan dan antrean berhasil dibersihkan!"
      });
      return;
    }

    // Subcommand: Queue
    if (subcommand === "queue") {
      const queue = musicManager.getQueue(guild.id);
      if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
        await interaction.reply({
          content: "Antrean musik saat ini sedang kosong!",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xF472B6)
        .setTitle("📜 Antrean Musik Maya")
        .setFooter({ text: "Maya Music Companion", iconURL: interaction.client.user?.displayAvatarURL() })
        .setTimestamp();

      if (queue.currentTrack) {
        embed.addFields({
          name: "▶️ Sedang Diputar",
          value: `[**${queue.currentTrack.title}**](${queue.currentTrack.url}) | \`${queue.currentTrack.duration}\` (Dipinta oleh: ${queue.currentTrack.requestedBy})`
        });
      }

      if (queue.tracks.length > 0) {
        const nextTracks = queue.tracks
          .slice(0, 10)
          .map((t, idx) => `**#${idx + 1}.** [${t.title}](${t.url}) | \`${t.duration}\` - ${t.requestedBy}`)
          .join("\n");

        embed.addFields({
          name: `📋 Antrean Berikutnya (${queue.tracks.length} lagu)`,
          value: nextTracks + (queue.tracks.length > 10 ? `\n*...dan ${queue.tracks.length - 10} lagu lainnya.*` : "")
        });
      }

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // Subcommand: Now Playing
    if (subcommand === "nowplaying") {
      const queue = musicManager.getQueue(guild.id);
      if (!queue || !queue.currentTrack) {
        await interaction.reply({
          content: "Tidak ada lagu yang sedang diputar saat ini!",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const track = queue.currentTrack;
      const embed = new EmbedBuilder()
        .setColor(0xF472B6)
        .setTitle("🎶 Sedang Diputar Saat Ini")
        .setDescription(`[**${track.title}**](${track.url})`)
        .addFields(
          { name: "⏱️ Durasi", value: track.duration, inline: true },
          { name: "👤 Pemesan", value: track.requestedBy, inline: true }
        )
        .setFooter({ text: "Maya Music Companion", iconURL: interaction.client.user?.displayAvatarURL() })
        .setTimestamp();

      if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
      }

      await interaction.reply({ embeds: [embed] });
      return;
    }
  }
};

export default command;
