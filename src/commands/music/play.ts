import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, VoiceChannel, AutocompleteInteraction } from "discord.js";
import { Command } from "../../types";
import { getMusicManager, Track } from "../../services/musicManager";
import { createEmbed } from "../../utils/embeds";
import play from "play-dl";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Memutar lagu dari YouTube")
    .addStringOption(opt =>
      opt
        .setName("query")
        .setDescription("Judul lagu atau link YouTube")
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      await interaction.reply({
        embeds: [createEmbed.error("Kesalahan", "Anda harus bergabung ke voice channel terlebih dahulu!")],
        ephemeral: true
      });
      return;
    }

    const query = interaction.options.getString("query", true);

    // Defer reply because searching/loading takes time
    await interaction.deferReply();

    try {
      let trackInfo: { title: string; url: string; duration: string } | null = null;

      // Check if the query is a direct YouTube link
      if (play.yt_validate(query) === "video") {
        const info = await play.video_basic_info(query);
        trackInfo = {
          title: info.video_details.title || "Lagu Tanpa Judul",
          url: info.video_details.url || `https://www.youtube.com/watch?v=${info.video_details.id}`,
          duration: info.video_details.durationRaw
        };
      } else {
        // Search YouTube for query
        const searchResults = await play.search(query, { limit: 1, source: { youtube: "video" } });
        if (searchResults.length > 0) {
          const video = searchResults[0];
          trackInfo = {
            title: video.title || "Lagu Tanpa Judul",
            url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
            duration: video.durationRaw
          };
        }
      }

      if (!trackInfo) {
        await interaction.editReply({
          embeds: [createEmbed.error("Tidak Ditemukan", `Tidak ada lagu yang ditemukan untuk pencarian: \`${query}\``)]
        });
        return;
      }

      // Get or create the music manager for this guild
      const manager = getMusicManager(interaction.guildId!);

      // Join the voice channel if not already in one
      if (!manager.connection) {
        manager.join(voiceChannel);
      }

      const track: Track = {
        ...trackInfo,
        requestedBy: interaction.user.tag
      };

      // Add track to queue
      manager.addTrack(track);

      const embed = createEmbed.music(
        "Lagu Ditambahkan",
        `**Judul:** [${track.title}](${track.url})\n` +
        `**Durasi:** \`${track.duration}\` | **Diminta oleh:** ${interaction.user}\n\n` +
        `*Posisi di antrean: ${manager.queue.length + (manager.currentTrack ? 1 : 0)}*`
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply({
        embeds: [createEmbed.error("Gagal Memutar", "Terjadi kesalahan saat memproses musik.")]
      });
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused();
    if (!focusedValue || !focusedValue.trim()) {
      await interaction.respond([]);
      return;
    }

    try {
      // Search YouTube for suggestions
      const searchResults = await play.search(focusedValue, { limit: 5, source: { youtube: "video" } });
      const choices = searchResults.map(video => {
        const title = video.title || "Lagu Tanpa Judul";
        const duration = video.durationRaw ? ` [${video.durationRaw}]` : "";
        const displayName = title.length > 70 ? title.substring(0, 67) + "..." : title;
        
        return {
          name: `${displayName}${duration}`,
          value: video.url || `https://www.youtube.com/watch?v=${video.id}`
        };
      });

      await interaction.respond(choices);
    } catch (error) {
      console.error("Autocomplete search error:", error);
      await interaction.respond([]);
    }
  }
};

export default command;
