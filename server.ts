import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import AdmZip from "adm-zip";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable, PassThrough } from "stream";
import fs from "fs";
import os from "os";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secure-jwt-secret-key-123";

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// Make sure to load environment variables in development
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Initialize Firebase Admin for Token Verification
let projectId = process.env.FIREBASE_PROJECT_ID || "demo-project";
let credential;

try {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    // If running with environment variables (e.g., Railway)
    credential = cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Handle escaped newlines in environment variables
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  } else {
    // Fallback for AI Studio or local development
    const serviceAccountPath = path.join(process.cwd(), "service-account.json");
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      credential = cert(serviceAccount);
      projectId = serviceAccount.project_id;
    } else {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (config.projectId) projectId = config.projectId;
      }
    }
  }
} catch (e) {
  console.warn("Could not load Firebase credentials", e);
}

if (!getApps().length) {
  initializeApp({
    projectId,
    ...(credential ? { credential } : {})
  });
}

// Nodemailer transport setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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
    const decodedToken = await getAuth().verifyIdToken(token);
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

// Public download link via object key
app.get("/api/download", async (req, res) => {
  try {
    const { key } = req.query;
    if (!key || typeof key !== "string") {
      return res.status(400).send("File key missing");
    }
    const s3 = getS3Client();
    const bucket = getBucketName();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.redirect(url);
  } catch (error) {
    console.error("Error generating download URL:", error);
    res.status(500).send("Failed to generate download URL");
  }
});

// Generate Thumbnail Endpoint
app.post("/api/generate-thumbnail", verifyAuth, async (req, res) => {
  try {
    const userId = (req as any).user.uid;
    const { objectKey, contentType } = req.body;
    
    if (!objectKey || !contentType) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const s3 = getS3Client();
    const bucket = getBucketName();
    const thumbnailKey = `${userId}/thumbnails/thumb_${Date.now()}_${path.basename(objectKey)}.jpg`;

    if (contentType.startsWith('image/')) {
      const getCommand = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
      const { Body } = await s3.send(getCommand);
      if (!Body) throw new Error("File body empty");
      
      const byteArray = await (Body as any).transformToByteArray();
      const buffer = Buffer.from(byteArray);

      const thumbnailBuffer = await sharp(buffer)
        .resize(200, 200, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();

      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg',
      });
      await s3.send(putCommand);

      return res.json({ thumbnailKey });
      
    } else if (contentType.startsWith('video/')) {
      const getCommand = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
      const presignedUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });
      
      const tmpFile = path.join(os.tmpdir(), `thumb_${Date.now()}.jpg`);

      await new Promise((resolve, reject) => {
        ffmpeg(presignedUrl)
          .seekInput(1)
          .frames(1)
          .size('200x200')
          .output(tmpFile)
          .on('end', resolve)
          .on('error', (err) => {
            console.error("ffmpeg error:", err);
            reject(err);
          })
          .run();
      });

      const thumbnailBuffer = await fs.promises.readFile(tmpFile);
      
      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg',
      });
      await s3.send(putCommand);

      // Clean up temp file
      await fs.promises.unlink(tmpFile).catch(e => console.error("Temp file cleanup failed:", e));

      return res.json({ thumbnailKey });
    } else {
      return res.status(400).json({ error: "Unsupported content type for thumbnails" });
    }
  } catch (error: any) {
    console.error("Thumbnail generation error:", error);
    return res.status(500).json({ error: error.message });
  }
});

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

    // 1. Get the ZIP file stream from R2
    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });

    const { Body } = await s3.send(getCommand);
    if (!Body) {
      return res.status(404).json({ error: "File not found" });
    }

    const byteArray = await Body.transformToByteArray();
    const buffer = Buffer.from(byteArray);
    
    let extractedFilesCount = 0;
    const extractedMetadata = [];
    const maxFileSize = 50 * 1024 * 1024; // 50MB Zip Bomb protection per file

    // 2. Parse ZIP
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    
    for (const entry of zipEntries) {
      const fileName = entry.entryName;
      const isDirectory = entry.isDirectory;
      const size = entry.header.size;

      if (!isSafePath(fileName)) {
        console.warn(`Skipping unsafe path: ${fileName}`);
        continue;
      }

      if (!isDirectory) {
        if (size > maxFileSize) {
           console.warn(`File ${fileName} exceeds max size limit, skipping.`);
           continue;
        }

        const prefix = folderId ? `${userId}/${folderId}/` : `${userId}/root/`;
        const targetKey = `${prefix}extracted_${Date.now()}_${path.basename(fileName)}`;

        try {
          const fileDataBuffer = entry.getData();

          const command = new PutObjectCommand({
            Bucket: bucket,
            Key: targetKey,
            Body: fileDataBuffer,
          });

          await s3.send(command);
          
          const fileData = {
            userId,
            folderId: folderId || null,
            name: path.basename(fileName),
            fileUrl: targetKey,
            size: size || 0,
            type: path.extname(fileName) || 'application/octet-stream',
          };
          
          extractedMetadata.push(fileData);
          extractedFilesCount++;
          
        } catch (err: any) {
          console.error(`Failed to upload extracted file ${fileName}`, err);
          extractedMetadata.push({ error: `Failed to extract ${fileName}: ${err.message}` });
        }
      }
    }

    if (extractedFilesCount === 0 && extractedMetadata.some(m => m.error)) {
        return res.status(500).json({ error: extractedMetadata.find(m => m.error)?.error });
    }

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

// Endpoint to send custom verification email via Nodemailer
app.post("/api/send-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "'email' is required" });
    }

    // Generate a custom JWT for verification, avoiding Firebase's default link
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
    
    // Create a link back to our React application's /verify route
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const baseUrl = host ? `${protocol}://${host}` : 'http://localhost:3000';
    const link = `${baseUrl}/verify?token=${token}`;

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify your email for Nebula Drive",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Welcome to Nebula Drive!</h2>
          <p>Please verify your email address by clicking the button below:</p>
          <a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #0095ff; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px; margin-bottom: 20px;">
            Verify Email
          </a>
          <p style="color: #666; font-size: 14px;">If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="color: #666; font-size: 14px; word-break: break-all;">${link}</p>
        </div>
      `,
    });

    res.json({ success: true, message: "Verification email sent successfully", data: info });
  } catch (error: any) {
    console.error("Error sending verification email:", error);
    res.status(500).json({ error: error.message || "Failed to send verification email" });
  }
});

// Endpoint to verify the custom email token
app.post("/api/verify-email", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as { email: string };
    const email = decoded.email;

    // Use Firebase Admin only to mark the user as verified
    const user = await getAuth().getUserByEmail(email);
    await getAuth().updateUser(user.uid, { emailVerified: true });

    res.json({ success: true, message: "Email verified successfully" });
  } catch (error: any) {
    console.error("Verification error:", error);
    res.status(400).json({ error: "Invalid or expired token" });
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
