import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import Database from "better-sqlite3";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// CONFIGURATION - EDIT THESE VALUES OR USE .ENV FILE
// ==========================================
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

// Danh sách các tài khoản Google Drive để gộp dung lượng
const DRIVE_ACCOUNTS = [
  {
    folderId: process.env.DRIVE_FOLDER_ID_1 || "",
    refreshToken: process.env.DRIVE_REFRESH_TOKEN_1 || ""
  },
  {
    folderId: process.env.DRIVE_FOLDER_ID_2 || "",
    refreshToken: process.env.DRIVE_REFRESH_TOKEN_2 || ""
  },
  {
    folderId: process.env.DRIVE_FOLDER_ID_3 || "",
    refreshToken: process.env.DRIVE_REFRESH_TOKEN_3 || ""
  },
  {
    folderId: process.env.DRIVE_FOLDER_ID_4 || "",
    refreshToken: process.env.DRIVE_REFRESH_TOKEN_4 || ""
  }
].filter(account => account.folderId !== "" && account.refreshToken !== "");

// ==========================================
// DATABASE SETUP
// ==========================================
const db = new Database("database.sqlite");

db.exec(`
  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drive_file_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    album_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS media_tags (
    media_id INTEGER,
    tag_id INTEGER,
    PRIMARY KEY (media_id, tag_id),
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );
`);

// ==========================================
// GOOGLE DRIVE API SETUP
// ==========================================
const driveClients = new Map<string, any>();

// Hàm tạo Drive Client động dựa trên Refresh Token
function getDriveClient(refreshToken: string) {
  if (driveClients.has(refreshToken)) {
    return driveClients.get(refreshToken);
  }

  const auth = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );
  auth.setCredentials({ refresh_token: refreshToken });
  const client = google.drive({ version: "v3", auth });
  
  driveClients.set(refreshToken, client);
  return client;
}

// Keep track of the current active account index to avoid retrying full accounts
let currentAccountIndex = 0;

// ==========================================
// EXPRESS APP SETUP
// ==========================================
const app = express();
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// --- API ROUTES ---

// Get all albums
app.get("/api/albums", (req, res) => {
  const albums = db.prepare("SELECT * FROM albums ORDER BY name ASC").all();
  res.json(albums);
});

// Create album
app.post("/api/albums", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  try {
    const info = db.prepare("INSERT INTO albums (name) VALUES (?)").run(name);
    res.json({ id: info.lastInsertRowid, name });
  } catch (error) {
    res.status(400).json({ error: "Album name already exists" });
  }
});

// Delete album
app.delete("/api/albums/:id", (req, res) => {
  db.prepare("DELETE FROM albums WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Get all tags
app.get("/api/tags", (req, res) => {
  const tags = db.prepare("SELECT * FROM tags ORDER BY name ASC").all();
  res.json(tags);
});

// Upload media
app.post("/api/media", upload.single("file"), async (req, res) => {
  const log = (msg: string) => {
    fs.appendFileSync("upload.log", `[${new Date().toISOString()}] ${msg}\n`);
    console.log(msg);
  };
  
  log("POST /api/media called");
  const file = req.file;
  const { album_id, tags } = req.body; // tags is comma separated string

  if (!file) {
    log("No file uploaded");
    return res.status(400).json({ error: "No file uploaded" });
  }

  log(`Received file: ${file.originalname} (${file.size} bytes)`);

  try {
    // Upload to Google Drive with fallback for full storage
    let driveFileId = null;
    let uploadSuccess = false;
    let lastError = null;

    if (DRIVE_ACCOUNTS.length === 0) {
      log("No Google Drive accounts configured.");
      return res.status(500).json({ error: "Chưa cấu hình tài khoản Google Drive (Thiếu biến môi trường)." });
    }

    // Start from the current known good account index
    for (let i = currentAccountIndex; i < DRIVE_ACCOUNTS.length; i++) {
      const account = DRIVE_ACCOUNTS[i];
      log(`Trying account index ${i}, folderId: ${account.folderId}`);
      const drive = getDriveClient(account.refreshToken);
      
      try {
        const fileMetadata = {
          name: file.originalname,
          parents: [account.folderId],
        };
        const mediaStream = {
          mimeType: file.mimetype,
          body: fs.createReadStream(file.path),
        };

        log("Calling drive.files.create...");
        const driveRes = await drive.files.create({
          requestBody: fileMetadata,
          media: mediaStream,
          fields: "id",
        });
        log("drive.files.create succeeded, id: " + driveRes.data.id);

        driveFileId = driveRes.data.id;
        uploadSuccess = true;
        currentAccountIndex = i; // Save this as the active account for future uploads
        break; // Upload successful, exit the loop
      } catch (error: any) {
        lastError = error;
        log(`Drive upload error for account ${i}: ` + error.message);
        
        // Check if the error is because the Drive storage is full OR authentication error (invalid_grant)
        const isQuotaExceeded = error.response?.data?.error?.errors?.some(
          (e: any) => e.reason === 'storageQuotaExceeded' || e.reason === 'quotaExceeded'
        );
        
        // invalid_grant means the refresh token is bad/revoked for THIS account. We should try the next one.
        const isTokenError = error.message?.includes('invalid_grant') || 
                             error.response?.data?.error === 'invalid_grant' ||
                             error.response?.data?.error_description?.includes('Token has been expired or revoked');

        if (isQuotaExceeded || isTokenError) {
          log(`Account/Folder ${account.folderId} failed (${isQuotaExceeded ? 'Quota Full' : 'Auth Error'}), trying the next account...`);
          // The loop will naturally continue to i + 1
          continue; 
        } else {
          // If it's a different error (e.g., invalid_client which affects ALL accounts), stop trying
          if (error.message?.includes('invalid_client')) {
             log("CRITICAL ERROR: GOOGLE_CLIENT_SECRET does not match GOOGLE_CLIENT_ID. Please update server.ts.");
          }
          break;
        }
      }
    }

    if (!uploadSuccess || !driveFileId) {
      log("Upload failed for all accounts");
      throw lastError || new Error("Failed to upload to any provided Google Drive folders.");
    }

    log("Saving to database...");
    // Save to DB
    const insertMedia = db.prepare(
      "INSERT INTO media (drive_file_id, name, mime_type, size, album_id) VALUES (?, ?, ?, ?, ?)"
    );
    const info = insertMedia.run(
      driveFileId,
      file.originalname,
      file.mimetype,
      file.size,
      album_id || null
    );
    const mediaId = info.lastInsertRowid;

    // Handle tags
    if (tags) {
      log("Processing tags: " + tags);
      const tagList = tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      for (const tagName of tagList) {
        let tagInfo = db.prepare("SELECT id FROM tags WHERE name = ?").get(tagName) as any;
        if (!tagInfo) {
          const insertTag = db.prepare("INSERT INTO tags (name) VALUES (?)");
          const resTag = insertTag.run(tagName);
          tagInfo = { id: resTag.lastInsertRowid };
        }
        db.prepare("INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)").run(mediaId, tagInfo.id);
      }
    }

    // Clean up local file
    log("Cleaning up local file: " + file.path);
    fs.unlinkSync(file.path);

    log("Upload complete, returning success");
    res.json({ success: true, mediaId });
  } catch (error: any) {
    log("Upload error: " + error.message);
    try {
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (cleanupError) {
      log("Cleanup error: " + (cleanupError as Error).message);
    }
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// Get media list
app.get("/api/media", (req, res) => {
  console.log("GET /api/media called with query:", req.query);
  const { search, album_id, tag } = req.query;
  
  let query = `
    SELECT m.*, a.name as album_name, 
    GROUP_CONCAT(t.name) as tags
    FROM media m
    LEFT JOIN albums a ON m.album_id = a.id
    LEFT JOIN media_tags mt ON m.id = mt.media_id
    LEFT JOIN tags t ON mt.tag_id = t.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (search) {
    query += ` AND m.name LIKE ?`;
    params.push(`%${search}%`);
  }
  if (album_id) {
    query += ` AND m.album_id = ?`;
    params.push(album_id);
  }
  if (tag) {
    query += ` AND m.id IN (SELECT media_id FROM media_tags mt2 JOIN tags t2 ON mt2.tag_id = t2.id WHERE t2.name = ?)`;
    params.push(tag);
  }

  query += ` GROUP BY m.id ORDER BY m.created_at DESC`;

  try {
    const media = db.prepare(query).all(params);
    console.log(`GET /api/media returning ${media.length} items`);
    res.json(media);
  } catch (error) {
    console.error("GET /api/media error:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// Get media file (stream from Drive)
app.get("/api/media/:id/file", async (req, res) => {
  try {
    if (DRIVE_ACCOUNTS.length === 0) {
      return res.status(500).json({ error: "Chưa cấu hình tài khoản Google Drive (Thiếu biến môi trường)." });
    }
    const media = db.prepare("SELECT * FROM media WHERE id = ?").get(req.params.id) as any;
    if (!media) return res.status(404).json({ error: "Media not found" });

    let driveRes: any = null;
    let lastError = null;

    // Try to get the file from each account
    for (const account of DRIVE_ACCOUNTS) {
      const drive = getDriveClient(account.refreshToken);
      try {
        // First get metadata to verify existence and get size
        const meta = await drive.files.get({ 
          fileId: media.drive_file_id, 
          fields: "size" 
        });

        if (meta.data.size) {
          res.setHeader("Content-Length", meta.data.size);
        }

        driveRes = await drive.files.get(
          { fileId: media.drive_file_id, alt: "media", acknowledgeAbuse: true },
          { responseType: "stream" }
        );
        break; // Found it!
      } catch (error: any) {
        lastError = error;
        console.error(`Failed to get file from account ${account.folderId}:`, error.message);
        // If 404, it might be in another account, so continue
        if (error.code === 404 || error.status === 404) continue;
      }
    }

    if (!driveRes) {
      return res.status(404).json({ error: "File not found in any Drive account" });
    }

    res.setHeader("Content-Type", media.mime_type);
    
    const disposition = req.query.download ? 'attachment' : 'inline';
    const filename = encodeURIComponent(media.name);
    res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${filename}`);
    
    res.on('close', () => {
      if (driveRes && driveRes.data && typeof driveRes.data.destroy === 'function') {
        driveRes.data.destroy();
      }
    });

    driveRes.data
      .on("end", () => {})
      .on("error", (err: any) => {
        console.error("Error downloading file.", err);
        if (!res.headersSent) {
          res.status(500).end();
        }
      })
      .pipe(res);
  } catch (error) {
    console.error("Drive stream error:", error);
    res.status(500).json({ error: "Failed to stream file" });
  }
});

// Delete media
app.delete("/api/media/:id", async (req, res) => {
  try {
    if (DRIVE_ACCOUNTS.length === 0) {
      return res.status(500).json({ error: "Chưa cấu hình tài khoản Google Drive (Thiếu biến môi trường)." });
    }
    const media = db.prepare("SELECT * FROM media WHERE id = ?").get(req.params.id) as any;
    if (!media) return res.status(404).json({ error: "Media not found" });

    // Delete from Drive
    let deleted = false;
    for (const account of DRIVE_ACCOUNTS) {
      const drive = getDriveClient(account.refreshToken);
      try {
        await drive.files.delete({ fileId: media.drive_file_id });
        deleted = true;
        break; // Successfully deleted
      } catch (error: any) {
        // If 404, it might be in another account, so continue
        if (error.code === 404) continue;
      }
    }
    
    if (!deleted) {
      console.warn(`File ${media.drive_file_id} not found in Drive, but deleting from DB anyway`);
    }

    // Delete from DB
    db.prepare("DELETE FROM media WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete media" });
  }
});

// Update media tags
app.put("/api/media/:id/tags", (req, res) => {
  const { tags } = req.body; // array of strings
  const mediaId = req.params.id;

  try {
    db.prepare("DELETE FROM media_tags WHERE media_id = ?").run(mediaId);
    
    if (tags && Array.isArray(tags)) {
      for (const tagName of tags) {
        const trimmed = tagName.trim();
        if (!trimmed) continue;
        
        let tagInfo = db.prepare("SELECT id FROM tags WHERE name = ?").get(trimmed) as any;
        if (!tagInfo) {
          const insertTag = db.prepare("INSERT INTO tags (name) VALUES (?)");
          const resTag = insertTag.run(trimmed);
          tagInfo = { id: resTag.lastInsertRowid };
        }
        db.prepare("INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)").run(mediaId, tagInfo.id);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Update tags error:", error);
    res.status(500).json({ error: "Failed to update tags" });
  }
});

// Update media album
app.put("/api/media/:id/album", (req, res) => {
  const { album_id } = req.body;
  const mediaId = req.params.id;

  try {
    db.prepare("UPDATE media SET album_id = ? WHERE id = ?").run(album_id || null, mediaId);
    res.json({ success: true });
  } catch (error) {
    console.error("Update album error:", error);
    res.status(500).json({ error: "Failed to update album" });
  }
});

async function syncFromDrive() {
  if (DRIVE_ACCOUNTS.length === 0) {
    console.log("Auto-sync skipped: No Google Drive accounts configured.");
    return 0;
  }
  let syncedCount = 0;
  console.log("Starting background sync from Google Drive...");
  try {
    for (const account of DRIVE_ACCOUNTS) {
      const drive = getDriveClient(account.refreshToken);
      let pageToken = undefined;
      
      do {
        const driveRes: any = await drive.files.list({
          q: `'${account.folderId}' in parents and trashed = false`,
          fields: "nextPageToken, files(id, name, mimeType, size, createdTime)",
          pageToken: pageToken,
          pageSize: 100
        });
        
        const files = driveRes.data.files;
        if (files && files.length > 0) {
          for (const file of files) {
            // Check if file already exists in DB
            const existing = db.prepare("SELECT id FROM media WHERE drive_file_id = ?").get(file.id);
            if (!existing) {
              // Insert new file
              const insertMedia = db.prepare(
                "INSERT INTO media (drive_file_id, name, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?)"
              );
              insertMedia.run(
                file.id,
                file.name,
                file.mimeType,
                file.size || 0,
                file.createdTime || new Date().toISOString()
              );
              syncedCount++;
            }
          }
        }
        
        pageToken = driveRes.data.nextPageToken;
      } while (pageToken);
    }
    
    console.log(`Background sync complete. Added ${syncedCount} new files.`);
    return syncedCount;
  } catch (error) {
    console.error("Background sync error:", error);
    throw error;
  }
}

// Sync from Drive
app.post("/api/sync", async (req, res) => {
  try {
    if (DRIVE_ACCOUNTS.length === 0) {
      return res.status(500).json({ error: "Chưa cấu hình tài khoản Google Drive (Thiếu biến môi trường)." });
    }
    const syncedCount = await syncFromDrive();
    res.json({ success: true, syncedCount });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ error: "Failed to sync from Google Drive" });
  }
});

// List files from a specific Drive folder
app.get("/api/drive/files", async (req, res) => {
  const { folderId } = req.query;
  if (!folderId) return res.status(400).json({ error: "Folder ID is required" });

  try {
    if (DRIVE_ACCOUNTS.length === 0) {
      return res.status(500).json({ error: "Chưa cấu hình tài khoản Google Drive (Thiếu biến môi trường)." });
    }
    // Use the first account to list files (assuming it has access)
    const account = DRIVE_ACCOUNTS[0];
    const drive = getDriveClient(account.refreshToken);

    const driveRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "files(id, name, mimeType)",
      pageSize: 100
    });

    res.json(driveRes.data.files);
  } catch (error: any) {
    console.error("Drive list error:", error.message);
    res.status(500).json({ error: "Failed to list files from Drive" });
  }
});

// Stream a specific file directly from Drive
app.get("/api/drive/stream/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const { download } = req.query;

  try {
    if (DRIVE_ACCOUNTS.length === 0) {
      return res.status(500).json({ error: "Chưa cấu hình tài khoản Google Drive (Thiếu biến môi trường)." });
    }
    let driveRes: any = null;
    
    // Try to find the file using any available account
    for (const account of DRIVE_ACCOUNTS) {
      const drive = getDriveClient(account.refreshToken);
      try {
        // First get metadata to set Content-Type and Size
        const meta = await drive.files.get({ 
          fileId, 
          fields: "mimeType, name, size" 
        });
        
        res.setHeader("Content-Type", meta.data.mimeType);
        if (meta.data.size) {
          res.setHeader("Content-Length", meta.data.size);
        }
        
        const disposition = download === 'true' ? 'attachment' : 'inline';
        // Encode filename for Content-Disposition to handle special characters
        const filename = encodeURIComponent(meta.data.name);
        res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${filename}`);

        // Then get the stream
        driveRes = await drive.files.get(
          { fileId, alt: "media", acknowledgeAbuse: true },
          { responseType: "stream" }
        );
        break;
      } catch (e) {
        continue;
      }
    }

    if (!driveRes) {
      return res.status(404).json({ error: "File not found" });
    }

    driveRes.data
      .on("end", () => {})
      .on("error", (err: any) => {
        console.error("Error streaming file:", err);
        if (!res.headersSent) res.status(500).end();
      })
      .pipe(res);

  } catch (error) {
    console.error("Stream error:", error);
    res.status(500).json({ error: "Failed to stream file" });
  }
});

// ==========================================
// START SERVER
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = process.env.PORT || 3000;
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    
    // Run initial sync in the background
    syncFromDrive().catch(console.error);
    
    // Run sync every 15 minutes (900000 ms)
    setInterval(() => {
      syncFromDrive().catch(console.error);
    }, 15 * 60 * 1000);
  });
}

startServer();
