import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import unzipper from "unzipper";
import admin from "firebase-admin";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable, PassThrough } from "stream";

// Make sure to load environment variables in development
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Firebase Admin (Lazy)
let firebaseDb: admin.firestore.Firestore | null = null;
function getDb() {
  if (!firebaseDb) {
    try {
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            })
          });
        }
      } else {
        // Fallback for default credentials
        if (!admin.apps.length) {
          admin.initializeApp();
        }
      }
      firebaseDb = admin.firestore();
    } catch (e) {
      console.error("Firebase Admin initialization failed.", e);
      throw new Error("Database not initialized");
    }
  }
  return firebaseDb;
}

// S3 Client for Cloudflare R2
let s3Client: S3Client | null = null;
function getS3Client() {
  if (!s3Client) {
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      throw new Error("Cloudflare R2 configuration missing. Check .env variables.");
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      }
    });
  }
  return s3Client;
}

function getBucketName() {
  return process.env.R2_BUCKET_NAME || "cloud-storage";
}

// Middleware to verify Firebase Auth Token from client
async function verifyAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    console.error("Auth verification failed", error);
    res.status(401).json({ error: "Invalid token" });
  }
}

// Generate Pre-signed URL for upload
app.post("/api/upload-url", verifyAuth, async (req, res) => {
  try {
    const userId = (req as any).user.uid;
    const { filename, contentType, folderId } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: "filename and contentType are required" });
    }

    const s3 = getS3Client();
    const bucket = getBucketName();
    
    // Create a unique object key based on user and folder
    const prefix = folderId ? `${userId}/${folderId}/` : `${userId}/root/`;
    const objectKey = `${prefix}${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    res.json({ url, objectKey });
  } catch (error: any) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: error.message || "Failed to generate URL" });
  }
});

// Helper to sanitize zip paths (Zip Slip protection)
function isSafePath(filePath: string) {
  const normalized = path.normalize(filePath);
  return !normalized.startsWith('..') && !normalized.startsWith('/');
}

// Extract ZIP endpoint
app.post("/api/extract-zip", verifyAuth, async (req, res) => {
  try {
    const userId = (req as any).user.uid;
    const { objectKey, folderId } = req.body;
    
    if (!objectKey) {
      return res.status(400).json({ error: "objectKey required" });
    }

    const s3 = getS3Client();
    const bucket = getBucketName();
    const db = getDb();

    // 1. Get the ZIP file stream from R2
    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });

    const { Body } = await s3.send(getCommand);
    if (!Body) {
      return res.status(404).json({ error: "File not found" });
    }

    const zipStream = Body as NodeJS.ReadableStream;
    let extractedFilesCount = 0;
    const extractedMetadata = [];
    
    const maxFileSize = 50 * 1024 * 1024; // 50MB Zip Bomb protection per file

    // 2. Stream and Parse ZIP
    await new Promise((resolve, reject) => {
      zipStream
        .pipe(unzipper.Parse())
        .on('entry', async (entry) => {
          const fileName = entry.path;
          const type = entry.type; // 'Directory' or 'File'
          const size = entry.vars.uncompressedSize; // Optional, might be undefined for some zips

          // Zip Slip Protection
          if (!isSafePath(fileName)) {
            console.warn(`Skipping unsafe path: ${fileName}`);
            entry.autodrain();
            return;
          }

          if (type === 'File') {
            // Zip bomb protection
            if (size !== undefined && size > maxFileSize) {
               console.warn(`File ${fileName} exceeds max size limit, skipping.`);
               entry.autodrain();
               return;
            }

            // Create a target key in R2
            const prefix = folderId ? `${userId}/${folderId}/` : `${userId}/root/`;
            const targetKey = `${prefix}extracted_${Date.now()}_${path.basename(fileName)}`;

            try {
              // 3. Upload extracted file back to R2 using @aws-sdk/lib-storage Upload
              // Create a PassThrough stream to pipe from entry to R2
              const passThrough = new PassThrough();
              entry.pipe(passThrough);

              const upload = new Upload({
                client: s3,
                params: {
                  Bucket: bucket,
                  Key: targetKey,
                  Body: passThrough,
                },
              });

              await upload.done();
              
              // 4. Save metadata to Firestore
              const fileData = {
                userId,
                folderId: folderId || null,
                name: path.basename(fileName),
                fileUrl: targetKey,
                size: size || 0,
                type: path.extname(fileName) || 'application/octet-stream',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              };
              
              const docRef = await db.collection("files").add(fileData);
              extractedMetadata.push({ id: docRef.id, ...fileData });
              extractedFilesCount++;
              
            } catch (err) {
              console.error(`Failed to upload extracted file ${fileName}`, err);
              entry.autodrain();
            }
          } else {
            // Skip directories for now, or you could create folder metadata
            entry.autodrain();
          }
        })
        .on('close', resolve)
        .on('error', reject);
    });

    res.json({
      success: true,
      message: `Extracted ${extractedFilesCount} files successfully`,
      extractedFiles: extractedMetadata
    });

  } catch (error: any) {
    console.error("Error extracting ZIP:", error);
    res.status(500).json({ error: error.message || "Failed to extract ZIP" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
