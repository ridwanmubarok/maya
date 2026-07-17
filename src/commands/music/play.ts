import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, VoiceChannel, AutocompleteInteraction } from "discord.js";
import { Command } from "../../types";
import { getMusicManager, Track } from "../../services/musicManager";
import { createEmbed } from "../../utils/embeds";
import play from "play-dl";

function formatSoundCloudTrack(track: any) {
  const title = track.name || track.title || "Lagu Tanpa Judul";
  const durationInSec = track.durationInSec || Math.floor((track.duration || 0) / 1000);
  const minutes = Math.floor(durationInSec / 60);
  const seconds = durationInSec % 60;
  const durationRaw = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  return {
    title,
    url: track.url,
    duration: durationRaw
  };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Memutar lagu dari Spotify")
    .addStringOption(opt =>
      opt
        .setName("query")
        .setDescription("Judul lagu atau link Spotify")
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

      // Check type of query using play-dl validators
      const spType = play.sp_validate(query);

      if (spType && spType !== "search") {
        const spotifyData = await play.spotify(query);
        if (spotifyData.type === "track") {
          const track = spotifyData as any; // play-dl SpotifyTrack
          const searchTitle = `${track.artists.map((a: any) => a.name).join(", ")} - ${track.name}`;
          const searchResults = await play.search(searchTitle, { limit: 1, source: { soundcloud: "tracks" } });
          if (searchResults.length > 0) {
            const scTrackInfo = formatSoundCloudTrack(searchResults[0]);
            trackInfo = {
              title: `${track.name} - ${track.artists.map((a: any) => a.name).join(", ")}`,
              url: scTrackInfo.url,
              duration: scTrackInfo.duration
            };
          }
        } else if (spotifyData.type === "playlist" || spotifyData.type === "album") {
          const list = spotifyData as any;
          const tracks = await list.all_tracks();
          if (tracks.length > 0) {
            // Resolve first track immediately so bot starts playing instantly
            const firstTrack = tracks[0];
            const searchTitle = `${firstTrack.artists.map((a: any) => a.name).join(", ")} - ${firstTrack.name}`;
            const searchResults = await play.search(searchTitle, { limit: 1, source: { soundcloud: "tracks" } });
            
            if (searchResults.length > 0) {
              const scTrackInfo = formatSoundCloudTrack(searchResults[0]);
              trackInfo = {
                title: `${firstTrack.name} - ${firstTrack.artists.map((a: any) => a.name).join(", ")}`,
                url: scTrackInfo.url,
                duration: scTrackInfo.duration
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
                    const pSearchResults = await play.search(pSearchTitle, { limit: 1, source: { soundcloud: "tracks" } });
                    if (pSearchResults.length > 0) {
                      const pScTrackInfo = formatSoundCloudTrack(pSearchResults[0]);
                      manager.queue.push({
                        title: `${playlistTrack.name} - ${playlistTrack.artists.map((a: any) => a.name).join(", ")}`,
                        url: pScTrackInfo.url,
                        duration: pScTrackInfo.duration,
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
      } else {
        // Search Spotify for query instead of YouTube/SoundCloud
        const searchResults = await play.search(query, { limit: 1, source: { spotify: "track" } });
        if (searchResults.length > 0) {
          const track = searchResults[0];
          const searchTitle = `${track.artists.map((a: any) => a.name).join(", ")} - ${track.name}`;
          const scResults = await play.search(searchTitle, { limit: 1, source: { soundcloud: "tracks" } });
          if (scResults.length > 0) {
            const scTrackInfo = formatSoundCloudTrack(scResults[0]);
            trackInfo = {
              title: `${track.name} - ${track.artists.map((a: any) => a.name).join(", ")}`,
              url: scTrackInfo.url,
              duration: scTrackInfo.duration
            };
          }
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

      // Check if it was immediately played or added to the queue
      const isCurrentlyPlaying = manager.currentTrack === track && manager.queue.length === 0;

      const embed = isCurrentlyPlaying
        ? createEmbed.music(
            "Mulai Memutar 🎶",
            `**Judul:** [${track.title}](${track.url})\n` +
            `**Durasi:** \`${track.duration}\` | **Diminta oleh:** ${interaction.user}`
          )
        : createEmbed.music(
            "Lagu Ditambahkan ke Antrean 📥",
            `**Judul:** [${track.title}](${track.url})\n` +
            `**Durasi:** \`${track.duration}\` | **Diminta oleh:** ${interaction.user}\n\n` +
            `*Posisi di antrean: #${manager.queue.length}*`
          );

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      console.error("Play command error:", error);
      let errMsg = error?.message || error;
      if (typeof errMsg === "string" && errMsg.includes("Spotify Data is missing")) {
        errMsg = "Spotify Credentials Kosong. Hubungi admin server untuk mengisi SPOTIFY_CLIENT_ID & SPOTIFY_CLIENT_SECRET di variabel lingkungan Coolify agar fitur link Spotify aktif!";
      }
      await interaction.editReply({
        embeds: [createEmbed.error("Gagal Memutar", `Terjadi kesalahan: \`${errMsg}\``)]
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
      // Search Spotify for suggestions instead of YouTube/SoundCloud
      const searchResults = await play.search(focusedValue, { limit: 5, source: { spotify: "track" } });
      const choices = searchResults.map(track => {
        const title = `${track.name} - ${track.artists.map((a: any) => a.name).join(", ")}`;
        const durationInSec = track.durationInSec;
        const minutes = Math.floor(durationInSec / 60);
        const seconds = durationInSec % 60;
        const durationRaw = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        const displayName = title.length > 70 ? title.substring(0, 67) + "..." : title;
        
        return {
          name: `${displayName} [${durationRaw}]`,
          value: track.url
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
