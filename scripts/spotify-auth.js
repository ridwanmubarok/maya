const https = require("https");
const fs = require("fs");
const path = require("path");

// Load .env from project root
try {
  require("dotenv").config({ path: path.join(__dirname, "../.env") });
} catch (e) {
  // Ignore error if dotenv is missing (should not happen)
}

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.log("[Spotify Auth] SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET is not configured in .env. Skipping Spotify authentication...");
  process.exit(0);
}

console.log("[Spotify Auth] Authenticating with Spotify API...");

const authString = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
const data = "grant_type=client_credentials";

const options = {
  hostname: "accounts.spotify.com",
  port: 443,
  path: "/api/token",
  method: "POST",
  headers: {
    "Authorization": `Basic ${authString}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => { body += chunk; });
  res.on("end", () => {
    try {
      if (res.statusCode === 200) {
        const parsed = JSON.parse(body);
        const spotifyData = {
          client_id: clientId,
          client_secret: clientSecret,
          redirect_url: "http://localhost:3000",
          access_token: parsed.access_token,
          refresh_token: "none",
          expires_in: Number(parsed.expires_in),
          expiry: Date.now() + (Number(parsed.expires_in) - 1) * 1000,
          token_type: parsed.token_type || "Bearer",
          market: "ID"
        };

        const dataDir = path.join(__dirname, "../.data");
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir);
        }
        
        fs.writeFileSync(path.join(dataDir, "spotify.data"), JSON.stringify(spotifyData, null, 4));
        console.log("[Spotify Auth] Spotify token cache successfully initialized!");
        process.exit(0);
      } else {
        console.error(`[Spotify Auth] Authentication failed with status code ${res.statusCode}: ${body}`);
        process.exit(0); // Exit gracefully so bot startup continues
      }
    } catch (e) {
      console.error("[Spotify Auth] Error parsing Spotify response:", e);
      process.exit(0);
    }
  });
});

req.on("error", (err) => {
  console.error("[Spotify Auth] Connection error:", err);
  process.exit(0);
});

req.write(data);
req.end();
