import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy } from "firebase/firestore";
import { LogOut, Upload, File, FileArchive, Folder, Loader2, Cloud, Search, Trash, Clock, Star } from "lucide-react";
import { User } from "firebase/auth";

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null); // store file id being extracted

  useEffect(() => {
    const q = query(
      collection(db, "files"),
      where("userId", "==", user.uid)
      // Note: adding orderBy might require a Firestore index.
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fileData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort in memory to avoid needing composite index immediately
      fileData.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setFiles(fileData);
    });

    return () => unsubscribe();
  }, [user.uid]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const token = await user.getIdToken();
      
      // 1. Get pre-signed URL from our Node.js backend
      const res = await fetch("/api/upload-url", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: user.uid,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          folderId: null // root folder
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // 2. Upload directly to Cloudflare R2 via pre-signed URL
      const uploadRes = await fetch(data.url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadRes.ok) throw new Error("Failed to upload to R2");

      // 3. Save metadata to Firestore
      await addDoc(collection(db, "files"), {
        userId: user.uid,
        folderId: null,
        name: file.name,
        fileUrl: data.objectKey, // Storing R2 object key here
        size: file.size,
        type: file.type || "application/octet-stream",
        createdAt: serverTimestamp(),
      });

    } catch (err) {
      console.error(err);
      alert("Upload failed. Make sure your R2 and Firebase credentials are set.");
    } finally {
      setUploading(false);
      // clear input
      e.target.value = '';
    }
  };

  const handleExtract = async (fileId: string, objectKey: string) => {
    try {
      setExtracting(fileId);
      const token = await user.getIdToken();
      
      const res = await fetch("/api/extract-zip", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: user.uid,
          objectKey: objectKey,
          folderId: null
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(`Success: ${data.message}`);

    } catch (err) {
      console.error(err);
      alert("Extraction failed.");
    } finally {
      setExtracting(null);
    }
  };

  const isZip = (name: string, type: string) => {
    return name.endsWith(".zip") || type === "application/zip" || type === "application/x-zip-compressed";
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex h-screen overflow-hidden relative z-10 w-full">
      {/* Sidebar */}
      <aside className="w-64 h-full bg-white/5 backdrop-blur-2xl border-r border-white/10 flex flex-col z-10 flex-shrink-0">
        <div className="p-8 flex items-center gap-3">
          <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Cloud className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">R2Cloud</span>
        </div>
        <nav className="px-4 flex-1 space-y-1">
          <a href="#" className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-xl text-white">
            <Folder className="w-5 h-5 opacity-80" />
            <span className="font-medium">My Files</span>
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white transition-colors">
            <Clock className="w-5 h-5 opacity-60" />
            <span>Recent</span>
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white transition-colors">
            <Star className="w-5 h-5 opacity-60" />
            <span>Starred</span>
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white transition-colors">
            <Trash className="w-5 h-5 opacity-60" />
            <span>Trash</span>
          </a>
        </nav>
        <div className="p-6 space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-slate-400 truncate max-w-full" title={user.email || ""}>{user.email}</span>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="w-full mt-2 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 text-rose-400 hover:text-rose-300"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col z-10 relative overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 bg-white/5 backdrop-blur-md border-b border-white/10 flex-shrink-0">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Search in cloud..." className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-white placeholder-slate-500" />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 rounded-full border border-sky-500/20">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse"></div>
              <span className="text-[11px] font-bold text-sky-400 uppercase tracking-widest">Server Active: Railway</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold ring-2 ring-white/10 text-white uppercase">
                {user.email?.charAt(0) || "U"}
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-8 flex-1 flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Project Assets</h2>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="hover:text-white cursor-pointer">Root</span>
                <span className="text-sky-400">/ My Files</span>
              </div>
            </div>
            <div className="flex gap-3 relative">
              <button className="px-6 py-2 bg-sky-500 hover:bg-sky-400 shadow-lg shadow-sky-500/20 rounded-xl flex items-center gap-2 text-sm font-bold text-white transition-all relative overflow-hidden group">
                <Upload className="w-4 h-4" />
                <span>Upload File</span>
                <input 
                  type="file" 
                  onChange={handleUpload} 
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </button>
            </div>
          </div>

          {uploading && (
             <div className="mb-6 p-4 bg-white/5 border border-sky-500/30 rounded-2xl flex items-center gap-4 text-sky-400 backdrop-blur-md">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">Uploading to Cloudflare R2...</span>
             </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {files.length === 0 ? (
               <div className="col-span-full py-12 text-center text-slate-500">
                 No files uploaded yet. Drag and drop files to the Upload button.
               </div>
            ) : (
              files.map((file) => {
                const zip = isZip(file.name, file.type);
                
                if (zip) {
                  return (
                    <div key={file.id} className="col-span-1 md:col-span-2 xl:col-span-2 bg-white/5 border border-sky-500/30 rounded-3xl p-6 relative flex flex-col justify-between group shadow-2xl shadow-sky-900/20 backdrop-blur-3xl transition-all hover:bg-white/10">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-sky-500/20">
                            <FileArchive className="w-8 h-8 text-white" />
                          </div>
                          <h3 className="text-lg font-bold text-white mb-2 truncate max-w-[250px] sm:max-w-[400px]" title={file.name}>{file.name}</h3>
                          <div className="flex items-center gap-3 mt-4">
                            <div className="px-3 py-1 bg-white/5 rounded-lg border border-white/10 text-[11px] font-medium text-slate-300">{formatSize(file.size)}</div>
                            <div className="px-3 py-1 bg-white/5 rounded-lg border border-white/10 text-[11px] font-medium text-sky-300">ZIP ARCHIVE</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-end">
                        <button
                          onClick={() => handleExtract(file.id, file.fileUrl)}
                          disabled={extracting === file.id}
                          className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-bold shadow-lg shadow-sky-500/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {extracting === file.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Extracting...</span>
                            </>
                          ) : (
                            <>
                              <span>Extract Online</span>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                }

                // Regular File
                return (
                  <div key={file.id} className="group bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 transition-all flex flex-col justify-between">
                    <div>
                      <div className="w-12 h-12 bg-sky-500/20 rounded-xl flex items-center justify-center mb-4">
                        <File className="w-6 h-6 text-sky-500" />
                      </div>
                      <div className="font-semibold text-white truncate" title={file.name}>{file.name}</div>
                      <div className="text-xs text-slate-500 mt-1">{formatSize(file.size)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 bg-white/5 backdrop-blur-xl border-t border-white/10 px-8 flex items-center justify-between text-[10px] text-slate-500 font-medium uppercase tracking-[0.2em] flex-shrink-0">
          <div>Cloudflare R2 Object Storage (US-EAST-1)</div>
          <div className="flex items-center gap-4">
            <span>System Status: 100% Operational</span>
            <span className="text-sky-500">v1.4.2-PRO</span>
          </div>
        </div>
      </main>
    </div>
  );
}

