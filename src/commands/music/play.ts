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

      // Check if the query is a Spotify link
      if (play.sp_validate(query) !== "search") {
        const spotifyData = await play.spotify(query);
        if (spotifyData.type === "track") {
          const track = spotifyData as any; // play-dl SpotifyTrack
          const searchTitle = `${track.artists.map((a: any) => a.name).join(", ")} - ${track.name}`;
          const searchResults = await play.search(searchTitle, { limit: 1, source: { youtube: "video" } });
          if (searchResults.length > 0) {
            const video = searchResults[0];
            trackInfo = {
              title: `${track.name} - ${track.artists.map((a: any) => a.name).join(", ")}`,
              url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
              duration: video.durationRaw
            };
          }
        } else if (spotifyData.type === "playlist" || spotifyData.type === "album") {
          const list = spotifyData as any;
          const tracks = await list.all_tracks();
          if (tracks.length > 0) {
            // Resolve first track immediately so bot starts playing instantly
            const firstTrack = tracks[0];
            const searchTitle = `${firstTrack.artists.map((a: any) => a.name).join(", ")} - ${firstTrack.name}`;
            const searchResults = await play.search(searchTitle, { limit: 1, source: { youtube: "video" } });
            
            if (searchResults.length > 0) {
              const video = searchResults[0];
              trackInfo = {
                title: `${firstTrack.name} - ${firstTrack.artists.map((a: any) => a.name).join(", ")}`,
                url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
                duration: video.durationRaw
              };

              // Join and enqueue first track
              const manager = getMusicManager(interaction.guildId!);
              if (!manager.connection) {
                manager.join(voiceChannel);
              }

              const firstEnqueuedTrack: Track = {
                ...trackInfo,
                requestedBy: interaction.user.tag
              };
              manager.addTrack(firstEnqueuedTrack);

              // Asynchronously resolve and enqueue the rest of the playlist
              (async () => {
                for (let i = 1; i < tracks.length; i++) {
                  try {
                    const playlistTrack = tracks[i];
                    const pSearchTitle = `${playlistTrack.artists.map((a: any) => a.name).join(", ")} - ${playlistTrack.name}`;
                    const pSearchResults = await play.search(pSearchTitle, { limit: 1, source: { youtube: "video" } });
                    if (pSearchResults.length > 0) {
                      const pVideo = pSearchResults[0];
                      manager.queue.push({
                        title: `${playlistTrack.name} - ${playlistTrack.artists.map((a: any) => a.name).join(", ")}`,
                        url: pVideo.url || `https://www.youtube.com/watch?v=${pVideo.id}`,
                        duration: pVideo.durationRaw,
                        requestedBy: interaction.user.tag
                      });
                    }
                  } catch (e) {
                    console.error("Failed to load background playlist track:", e);
                  }
                }
              })();

              const embed = createEmbed.music(
                "Spotify Playlist/Album Ditambahkan",
                `Memutar **${list.name}**\n` +
                `Track pertama: **${firstEnqueuedTrack.title}**\n\n` +
                `*Memuat ${tracks.length - 1} lagu lainnya ke dalam antrean di latar belakang...*`
              );

              await interaction.editReply({ embeds: [embed] });
              return;
            }
          }
        }
      } else if (play.yt_validate(query) === "video") {
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
    // Return empty if search query is too short (< 3 characters) to prevent API lag/timeouts
    if (!focusedValue || focusedValue.trim().length < 3) {
      await interaction.respond([]).catch(() => {});
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

      await interaction.respond(choices).catch(() => {});
    } catch (error: any) {
      // Gracefully ignore Unknown Interaction (10062) errors caused by Discord 3s timeout
      if (error?.code !== 10062) {
        console.error("Autocomplete search error:", error);
      }
      await interaction.respond([]).catch(() => {});
    }
  }
};

export default command;
