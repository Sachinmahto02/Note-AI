import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { MongoClient, ObjectId } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy-loaded MongoDB helper
let mongoClient: MongoClient | null = null;

async function getMongoDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not defined");
  }
  // Guard against unreplaced password placeholder in Atlas string
  if (uri.includes("<db_password>")) {
    throw new Error("The MONGODB_URI contains '<db_password>'. Please replace it with your actual password in the AI Studio Settings or your .env file.");
  }
  
  if (!mongoClient) {
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
  }
  return mongoClient.db("journal_app");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set body parser limits specifically high for base64 file payloads (e.g., up to 30MB)
  app.use(express.json({ limit: "30mb" }));
  app.use(express.urlencoded({ limit: "30mb", extended: true }));

  let vite: any;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
  }

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Upload endpoint (MongoDB Storage proxy with self-contained Local Writable fallback)
  app.post("/api/media/upload", async (req, res) => {
    try {
      const { fileName, fileType, fileData, userId } = req.body;
      
      if (!fileData) {
        return res.status(400).json({ error: "No file data provided" });
      }

      // Try MongoDB storage first
      try {
        const db = await getMongoDb();
        const mediaCollection = db.collection("media_uploads");
        
        const result = await mediaCollection.insertOne({
          fileName: fileName || "unnamed",
          fileType: fileType || "application/octet-stream",
          fileData: fileData,
          userId: userId || "anonymous",
          createdAt: new Date()
        });

        return res.json({
          success: true,
          url: `/api/media/get/${result.insertedId}`
        });
      } catch (mongoErr: any) {
        console.warn("MongoDB Storage upload failed or not configured, using local writeable fallback storage instead:", mongoErr.message || mongoErr);
        
        // Local fallback storage: Save to an uploads directory on the server
        const uploadsDir = path.join(__dirname, "uploads");
        await fs.mkdir(uploadsDir, { recursive: true });
        
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 9);
        const safeName = (fileName || "file").replace(/[^a-zA-Z0-9.]/g, "_");
        const uniqueFileName = `${timestamp}_${randomId}_${safeName}`;
        
        let base64Body = fileData;
        if (fileData.startsWith("data:")) {
          const match = fileData.match(/^data:[^;]+;base64,(.+)$/);
          if (match) {
            base64Body = match[1];
          }
        }
        
        const buffer = Buffer.from(base64Body, "base64");
        const filePath = path.join(uploadsDir, uniqueFileName);
        await fs.writeFile(filePath, buffer);
        
        // Write a simple meta file for returning the correct content-type
        const metaPath = `${filePath}.meta.json`;
        await fs.writeFile(metaPath, JSON.stringify({
          fileName: fileName || "unnamed",
          fileType: fileType || "application/octet-stream",
          createdAt: new Date()
        }));
        
        return res.json({
          success: true,
          url: `/api/media/local/${uniqueFileName}`
        });
      }
    } catch (error: any) {
      console.error("Upload Error:", error);
      return res.status(500).json({ error: error.message || "Failed to save file" });
    }
  });

  // Local file retrieval endpoint supporting server fallback
  app.get("/api/media/local/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      const uploadsDir = path.join(__dirname, "uploads");
      const filePath = path.join(uploadsDir, filename);
      const metaPath = `${filePath}.meta.json`;
      
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).send("File not found");
      }
      
      let contentType = "application/octet-stream";
      try {
        const metaStr = await fs.readFile(metaPath, "utf-8");
        const meta = JSON.parse(metaStr);
        contentType = meta.fileType || "application/octet-stream";
      } catch (e) {
        console.warn("Could not read file metadata, default to stream", e);
      }
      
      const fileBuffer = await fs.readFile(filePath);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache local assets for 1 year
      return res.send(fileBuffer);
    } catch (error: any) {
      console.error("Local Retrieval Error:", error);
      return res.status(500).send("Error serving local media: " + error.message);
    }
  });

  // Retrieval endpoint (serves stored media files natively)
  app.get("/api/media/get/:id", async (req, res) => {
    try {
      const db = await getMongoDb();
      const mediaCollection = db.collection("media_uploads");
      
      let objectId;
      try {
        objectId = new ObjectId(req.params.id);
      } catch (e) {
        return res.status(400).send("Invalid media database identifier format");
      }

      const media = await mediaCollection.findOne({ _id: objectId });
      if (!media) {
        return res.status(404).send("Requested media file not found");
      }

      let base64Body = media.fileData;
      let contentType = media.fileType || "application/octet-stream";

      if (base64Body.startsWith("data:")) {
        const match = base64Body.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          contentType = match[1];
          base64Body = match[2];
        }
      }

      const buffer = Buffer.from(base64Body, "base64");
      res.set("Content-Type", contentType);
      res.set("Content-Length", String(buffer.length));
      res.set("Cache-Control", "public, max-age=31536000"); // cache for 1 year
      return res.send(buffer);
    } catch (error: any) {
      console.error("MongoDB Serve Error:", error);
      return res.status(500).send("Failed to serve media: " + error.message);
    }
  });

  // Fallback for SPA - serves index.html and transforms it for Vite
  app.get("*", async (req, res, next) => {
    // Skip if it looks like a request for a file with an extension (which might be handled by vite or static)
    if (req.url.includes('.') && !req.url.endsWith('.html')) {
      return next();
    }

    const url = req.originalUrl;
    try {
      let template: string;
      if (process.env.NODE_ENV !== "production") {
        template = await fs.readFile(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
      } else {
        template = await fs.readFile(path.resolve(__dirname, "dist", "index.html"), "utf-8");
      }
      res.status(200).set({ "Content-Type": "text/html" }).send(template);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        vite.ssrFixStacktrace(e as Error);
      }
      next(e);
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
