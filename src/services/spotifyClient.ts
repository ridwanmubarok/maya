import axios from "axios";
import { logger } from "../utils/logger";

export interface SpotifyTrackInfo {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  albumArt?: string;
  durationMs: number;
  durationRaw: string;
  url: string;
}

export interface SpotifyPlaylistInfo {
  id: string;
  title: string;
  thumbnail?: string;
  totalTracks: number;
  tracks: SpotifyTrackInfo[];
}

export class SpotifyClient {
  private static instance: SpotifyClient;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private constructor() {}

  public static getInstance(): SpotifyClient {
    if (!SpotifyClient.instance) {
      SpotifyClient.instance = new SpotifyClient();
    }
    return SpotifyClient.instance;
  }

  private async getAccessToken(): Promise<string | null> {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.warn("SpotifyClient: SPOTIFY_CLIENT_ID atau SPOTIFY_CLIENT_SECRET belum dikonfigurasi di .env");
      return null;
    }

    // Return cached token if valid (buffer of 60 seconds)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const res = await axios.post("https://accounts.spotify.com/api/token", "grant_type=client_credentials", {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });

      this.accessToken = res.data.access_token;
      this.tokenExpiresAt = Date.now() + (res.data.expires_in * 1000);
      return this.accessToken;
    } catch (err: any) {
      logger.error("SpotifyClient: Gagal mendapatkan access token Spotify:", err.response?.data || err.message);
      return null;
    }
  }

  public formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  }

  /**
   * Search tracks on Spotify
   */
  public async searchTracks(query: string, limit = 5): Promise<SpotifyTrackInfo[]> {
    const token = await this.getAccessToken();
    if (!token) return [];

    try {
      const res = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const items = res.data.tracks?.items || [];
      return items.map((item: any) => ({
        id: item.id,
        name: item.name,
        artists: item.artists.map((a: any) => a.name).join(", "),
        albumName: item.album.name,
        albumArt: item.album.images[0]?.url,
        durationMs: item.duration_ms,
        durationRaw: this.formatDuration(item.duration_ms),
        url: item.external_urls.spotify
      }));
    } catch (err: any) {
      logger.error(`SpotifyClient: Gagal mencari lagu "${query}":`, err.response?.data || err.message);
      return [];
    }
  }

  /**
   * Get single track info by Spotify Track ID
   */
  public async getTrack(trackId: string): Promise<SpotifyTrackInfo | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      const res = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const item = res.data;
      return {
        id: item.id,
        name: item.name,
        artists: item.artists.map((a: any) => a.name).join(", "),
        albumName: item.album.name,
        albumArt: item.album.images[0]?.url,
        durationMs: item.duration_ms,
        durationRaw: this.formatDuration(item.duration_ms),
        url: item.external_urls.spotify
      };
    } catch (err: any) {
      logger.error(`SpotifyClient: Gagal mengambil track ID "${trackId}":`, err.response?.data || err.message);
      return null;
    }
  }

  /**
   * Get playlist info and tracks
   */
  public async getPlaylist(playlistId: string): Promise<SpotifyPlaylistInfo | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      const res = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = res.data;
      const tracks: SpotifyTrackInfo[] = [];

      for (const item of data.tracks.items) {
        if (item.track) {
          tracks.push({
            id: item.track.id,
            name: item.track.name,
            artists: item.track.artists.map((a: any) => a.name).join(", "),
            albumName: item.track.album.name,
            albumArt: item.track.album.images[0]?.url || data.images[0]?.url,
            durationMs: item.track.duration_ms,
            durationRaw: this.formatDuration(item.track.duration_ms),
            url: item.track.external_urls.spotify
          });
        }
      }

      return {
        id: data.id,
        title: data.name,
        thumbnail: data.images[0]?.url,
        totalTracks: data.tracks.total,
        tracks
      };
    } catch (err: any) {
      logger.error(`SpotifyClient: Gagal mengambil playlist ID "${playlistId}":`, err.response?.data || err.message);
      return null;
    }
  }

  /**
   * Get album info and tracks
   */
  public async getAlbum(albumId: string): Promise<SpotifyPlaylistInfo | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      const res = await axios.get(`https://api.spotify.com/v1/albums/${albumId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = res.data;
      const albumArt = data.images[0]?.url;
      const tracks: SpotifyTrackInfo[] = data.tracks.items.map((item: any) => ({
        id: item.id,
        name: item.name,
        artists: item.artists.map((a: any) => a.name).join(", "),
        albumName: data.name,
        albumArt,
        durationMs: item.duration_ms,
        durationRaw: this.formatDuration(item.duration_ms),
        url: item.external_urls.spotify
      }));

      return {
        id: data.id,
        title: data.name,
        thumbnail: albumArt,
        totalTracks: data.total_tracks,
        tracks
      };
    } catch (err: any) {
      logger.error(`SpotifyClient: Gagal mengambil album ID "${albumId}":`, err.response?.data || err.message);
      return null;
    }
  }
}

export const spotifyClient = SpotifyClient.getInstance();
