import https from "https";

interface SpotifyTokenCache {
  accessToken: string;
  expiresAt: number;
}

export interface SpotifyTrackData {
  name: string;
  artists: { name: string }[];
  url: string;
  durationInSec: number;
}

export interface SpotifyListData {
  name: string;
  type: "playlist" | "album";
  tracks: SpotifyTrackData[];
}

let tokenCache: SpotifyTokenCache | null = null;

export async function getSpotifyToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials are not configured in .env!");
  }

  return new Promise((resolve, reject) => {
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const postData = "grant_type=client_credentials";

    const req = https.request({
      hostname: "accounts.spotify.com",
      path: "/api/token",
      method: "POST",
      headers: {
        "Authorization": `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            tokenCache = {
              accessToken: parsed.access_token,
              expiresAt: Date.now() + (Number(parsed.expires_in) - 30) * 1000
            };
            resolve(parsed.access_token);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`Spotify authentication status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function spotifyRequest(path: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: "api.spotify.com",
      path: path,
      headers: { "Authorization": `Bearer ${token}` }
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`Spotify API status ${res.statusCode}: ${body}`));
        }
      });
    }).on("error", reject);
  });
}

function extractSpotifyId(url: string, type: "track" | "playlist" | "album"): string {
  if (!url.startsWith("http")) return url;
  const parts = url.split(`${type}/`);
  if (parts.length < 2) throw new Error(`Invalid Spotify ${type} URL`);
  return parts[1].split("?")[0].split("&")[0];
}

export async function searchSpotifyTracks(query: string, limit: number = 5): Promise<SpotifyTrackData[]> {
  const token = await getSpotifyToken();
  const encodedQuery = encodeURIComponent(query);
  const data = await spotifyRequest(`/v1/search?q=${encodedQuery}&type=track&limit=${limit}&market=ID`, token);
  
  if (!data.tracks || !data.tracks.items) return [];

  return data.tracks.items.map((item: any) => ({
    name: item.name,
    artists: item.artists.map((a: any) => ({ name: a.name })),
    url: item.external_urls.spotify,
    durationInSec: Math.round(item.duration_ms / 1000)
  }));
}

export async function getSpotifyTrack(urlOrId: string): Promise<SpotifyTrackData> {
  const token = await getSpotifyToken();
  const id = extractSpotifyId(urlOrId, "track");
  const item = await spotifyRequest(`/v1/tracks/${id}?market=ID`, token);

  return {
    name: item.name,
    artists: item.artists.map((a: any) => ({ name: a.name })),
    url: item.external_urls.spotify,
    durationInSec: Math.round(item.duration_ms / 1000)
  };
}

export async function getSpotifyPlaylist(urlOrId: string): Promise<SpotifyListData> {
  const token = await getSpotifyToken();
  const id = extractSpotifyId(urlOrId, "playlist");
  const data = await spotifyRequest(`/v1/playlists/${id}?market=ID`, token);

  const tracks: SpotifyTrackData[] = data.tracks.items
    .filter((item: any) => item && item.track)
    .map((item: any) => ({
      name: item.track.name,
      artists: item.track.artists.map((a: any) => ({ name: a.name })),
      url: item.track.external_urls.spotify,
      durationInSec: Math.round(item.track.duration_ms / 1000)
    }));

  return {
    name: data.name,
    type: "playlist",
    tracks
  };
}

export async function getSpotifyAlbum(urlOrId: string): Promise<SpotifyListData> {
  const token = await getSpotifyToken();
  const id = extractSpotifyId(urlOrId, "album");
  const data = await spotifyRequest(`/v1/albums/${id}?market=ID`, token);

  const tracks: SpotifyTrackData[] = data.tracks.items.map((item: any) => ({
    name: item.name,
    artists: item.artists.map((a: any) => ({ name: a.name })),
    url: item.external_urls.spotify,
    durationInSec: Math.round(item.duration_ms / 1000)
  }));

  return {
    name: data.name,
    type: "album",
    tracks
  };
}
