import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  AutocompleteInteraction,
  GuildMember, 
  EmbedBuilder, 
  MessageFlags 
} from "discord.js";
import play from "play-dl";
import { Command } from "../../types";
import { 
  musicManager, 
  createMusicControlButtons, 
  createNowPlayingEmbed,
  LoopMode 
} from "../../services/musicManager";
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
            .setDescription("Judul lagu atau URL YouTube yang ingin diputar")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("volume")
        .setDescription("Atur volume pemutaran musik (1-100%)")
        .addIntegerOption((opt) =>
          opt
            .setName("level")
            .setDescription("Tingkat volume dalam persen (1-100)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("loop")
        .setDescription("Atur mode pengulangan lagu / antrean")
        .addStringOption((opt) =>
          opt
            .setName("mode")
            .setDescription("Pilih mode pengulangan")
            .setRequired(true)
            .addChoices(
              { name: "❌ Nonaktif (Off)", value: "off" },
              { name: "🔂 Ulang Lagu Ini (Track)", value: "track" },
              { name: "🔁 Ulang Seluruh Antrean (Queue)", value: "queue" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("shuffle")
        .setDescription("Acak urutan antrean lagu yang ada 🔀")
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
        .setDescription("Lihat informasi lagu yang sedang diputar beserta tombol kontroler")
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === "judul") {
      const query = focused.value.trim();
      if (!query || query.length < 2 || query.startsWith("http://") || query.startsWith("https://")) {
        await interaction.respond([]);
        return;
      }

      try {
        const results = await play.search(query, { source: { youtube: "video" }, limit: 5 });
        const choices = results
          .filter((r) => r.title && r.url)
          .map((r) => {
            const title = (r.title || "Unknown").slice(0, 80);
            const duration = r.durationRaw ? ` [${r.durationRaw}]` : "";
            return {
              name: `${title}${duration}`.slice(0, 100),
              value: r.url
            };
          });
        await interaction.respond(choices);
      } catch (_) {
        await interaction.respond([]);
      }
    }
  },

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

      const queue = result.queue || musicManager.getQueue(guild.id);
      if (!queue) {
        await interaction.editReply({ content: result.message });
        return;
      }

      const embed = createNowPlayingEmbed(queue, result.message);
      const components = createMusicControlButtons(queue);

      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    // Subcommand: Volume
    if (subcommand === "volume") {
      const queue = musicManager.getQueue(guild.id);
      if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
        await interaction.reply({
          content: "Tidak ada musik yang sedang diputar di server ini!",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const level = interaction.options.getInteger("level", true);
      const newVol = musicManager.setVolume(guild.id, level);

      await interaction.reply({
        content: `🔊 Volume musik berhasil diatur ke **${newVol}%**!`
      });
      return;
    }

    // Subcommand: Loop
    if (subcommand === "loop") {
      const queue = musicManager.getQueue(guild.id);
      if (!queue) {
        await interaction.reply({
          content: "Tidak ada sesi musik yang aktif saat ini!",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const mode = interaction.options.getString("mode", true) as LoopMode;
      const setMode = musicManager.setLoop(guild.id, mode);
      const modeNames = {
        off: "❌ Dinonaktifkan",
        track: "🔂 Mengulang Lagu Saat Ini",
        queue: "🔁 Mengulang Seluruh Antrean"
      };

      await interaction.reply({
        content: `🔁 Mode Loop musik berhasil diubah ke: **${modeNames[setMode]}**!`
      });
      return;
    }

    // Subcommand: Shuffle
    if (subcommand === "shuffle") {
      const queue = musicManager.getQueue(guild.id);
      if (!queue || queue.tracks.length <= 1) {
        await interaction.reply({
          content: "Antrean membutuhkan minimal 2 lagu untuk dapat diacak!",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      musicManager.shuffle(guild.id);
      await interaction.reply({
        content: `🔀 Berhasil mengacak **${queue.tracks.length}** lagu di antrean!`
      });
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
          content: "⏸️ Musik berhasil dijeda! Gunakan `/music resume` atau tombol kontroler untuk melanjutkan."
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

      const loopLabel = queue.loopMode === "track" ? "🔂 Track" : queue.loopMode === "queue" ? "🔁 Queue" : "❌ Off";

      const embed = new EmbedBuilder()
        .setColor(0xF472B6)
        .setTitle("📜 Antrean Musik Maya")
        .setDescription(`🔊 **Volume**: \`${queue.volume}%\` | 🔁 **Loop**: \`${loopLabel}\``)
        .setFooter({ text: "Maya Music Companion • YouTube HQ Audio", iconURL: interaction.client.user?.displayAvatarURL() })
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

      const embed = createNowPlayingEmbed(queue);
      const components = createMusicControlButtons(queue);

      await interaction.reply({ embeds: [embed], components });
      return;
    }
  }
};

export default command;
