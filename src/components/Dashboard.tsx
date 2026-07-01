import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { LogOut, Upload, File, FileArchive, Folder, Loader2, Cloud, Search, Trash, Clock, Star, Menu, X, MoreVertical, Link, RefreshCcw, Trash2, StarOff, User as UserIcon, Lock, Eye, EyeOff, FolderPlus, MoveRight, ChevronLeft } from "lucide-react";
import { User, updatePassword } from "firebase/auth";

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const [files, setFiles] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null); // store file id being extracted
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"files" | "starred" | "recent" | "trash" | "account">("files");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMoveModal, setShowMoveModal] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);

  useEffect(() => {
    const qFiles = query(
      collection(db, "files"),
      where("userId", "==", user.uid)
    );
    const qFolders = query(
      collection(db, "folders"),
      where("userId", "==", user.uid)
    );

    const unsubscribeFiles = onSnapshot(qFiles, (snapshot) => {
      const fileData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort in memory to avoid needing composite index immediately
      fileData.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setFiles(fileData);
      setIsLoadingFiles(false);
    });

    const unsubscribeFolders = onSnapshot(qFolders, (snapshot) => {
      const folderData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFolders(folderData);
    });

    return () => {
      unsubscribeFiles();
      unsubscribeFolders();
    };
  }, [user.uid]);

  const handleCreateFolder = async () => {
    const folderName = prompt("Enter folder name:");
    if (!folderName) return;
    try {
      await addDoc(collection(db, "folders"), {
        userId: user.uid,
        name: folderName,
        createdAt: serverTimestamp(),
      });
      setSuccessMsg("Folder created!");
    } catch (err) {
      setErrorMsg("Failed to create folder");
    }
  };

  const handleMoveFile = async (fileId: string, folderId: string | null) => {
    try {
      await updateDoc(doc(db, "files", fileId), { folderId });
      setSuccessMsg("File moved successfully");
      setShowMoveModal(null);
    } catch (err) {
      setErrorMsg("Failed to move file");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    const file = target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setUploadProgress(0);
      setErrorMsg(null);
      setSuccessMsg(null);
      setUploadStatus("Initializing upload...");
      const token = await user.getIdToken();
      
      // 1. Get pre-signed URL from our Node.js backend
      setUploadStatus("Requesting secure link...");
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
      if (!res.ok) throw new Error(data.error || "Failed to generate upload URL");

      // 2. Upload directly to Cloudflare R2 via pre-signed URL with XMLHttpRequest
      setUploadStatus("Uploading to cloud...");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.timeout = 60000; // 60 seconds timeout
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            setUploadProgress(Math.round(percentComplete));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Failed to upload to R2 (Status: ${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error or CORS issue during upload"));
        xhr.onabort = () => reject(new Error("Upload aborted"));
        xhr.ontimeout = () => reject(new Error("Upload timed out waiting for Cloudflare R2"));

        xhr.open("PUT", data.url, true);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.send(file);
      });

      // 3. Save metadata to Firestore
      setUploadStatus("Saving to database...");
      await Promise.race([
        addDoc(collection(db, "files"), {
          userId: user.uid,
          folderId: null,
          name: file.name,
          fileUrl: data.objectKey, // Storing R2 object key here
          size: file.size,
          type: file.type || "application/octet-stream",
          createdAt: serverTimestamp(),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Database timeout. Check your Firebase connection and Firestore rules.")), 15000))
      ]);
      
      setSuccessMsg(`Successfully uploaded ${file.name}`);
      setTimeout(() => setSuccessMsg(null), 5000);

    } catch (err: any) {
      console.error(err);
      if (err.message === "Failed to fetch") {
        setErrorMsg("Upload failed due to CORS. Please ensure your Cloudflare R2 bucket has CORS configured to allow PUT requests from any origin (*).");
      } else {
        setErrorMsg(`Upload failed: ${err.message || "Make sure your R2 and Firebase credentials are set."}`);
      }
    } finally {
      setUploading(false);
      // clear input safely
      if (target) {
        target.value = '';
      }
    }
  };

  const handleExtract = async (fileId: string, objectKey: string) => {
    try {
      setExtracting(fileId);
      setErrorMsg(null);
      setSuccessMsg(null);
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
          folderId: currentFolderId
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");

      // Save the extracted metadata to Firestore
      if (data.extractedFiles && data.extractedFiles.length > 0) {
        let savedCount = 0;
        for (const fileData of data.extractedFiles) {
          if (fileData.error) continue; // skip errors
          await addDoc(collection(db, "files"), {
            ...fileData,
            createdAt: serverTimestamp(),
          });
          savedCount++;
        }
        if (savedCount === 0) throw new Error("No files were successfully extracted from the zip.");
      } else {
        throw new Error("No files found in the zip.");
      }

      setSuccessMsg(`Success: ${data.message}`);
      setTimeout(() => setSuccessMsg(null), 5000);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Extraction failed: ${err.message || "Unknown error occurred."}`);
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

  const handleToggleStar = async (fileId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "files", fileId), { isStarred: !currentStatus });
      setOpenMenuId(null);
    } catch (err: any) {
      setErrorMsg("Failed to update star status");
    }
  };

  const handleToggleTrash = async (fileId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "files", fileId), { isTrash: !currentStatus });
      setOpenMenuId(null);
    } catch (err: any) {
      setErrorMsg("Failed to move to trash");
    }
  };

  const handleDeletePermanently = async (fileId: string) => {
    try {
      await deleteDoc(doc(db, "files", fileId));
      setSuccessMsg("File deleted permanently");
      setOpenMenuId(null);
    } catch (err: any) {
      setErrorMsg("Failed to delete file");
    }
  };

  const handleCopyLink = (fileUrl: string) => {
    const url = `${window.location.origin}/api/download?key=${encodeURIComponent(fileUrl)}`;
    navigator.clipboard.writeText(url);
    setSuccessMsg("Link copied to clipboard!");
    setTimeout(() => setSuccessMsg(null), 3000);
    setOpenMenuId(null);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (!newPassword || newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        setPasswordSuccess("Password updated successfully.");
        setNewPassword("");
      }
    } catch (err: any) {
      setPasswordError(err.message || "Failed to update password. You may need to sign in again.");
    }
  };

  const filteredFiles = files.filter(file => {
    if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    
    if (activeTab === 'files') return !file.isTrash && (file.folderId || null) === currentFolderId;
    if (activeTab === 'recent') return !file.isTrash && file.createdAt && typeof file.createdAt.toMillis === 'function' && (Date.now() - file.createdAt.toMillis() < 7 * 24 * 60 * 60 * 1000); // last 7 days
    if (activeTab === 'starred') return file.isStarred && !file.isTrash;
    if (activeTab === 'trash') return file.isTrash;
    
    return true;
  });

  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;

  return (
    <div className="flex h-screen overflow-hidden relative z-10 w-full">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-64 h-full bg-[#05070a] lg:bg-white/5 backdrop-blur-2xl border-r border-white/10 flex flex-col z-50 flex-shrink-0 fixed lg:static top-0 left-0 transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="p-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">R2Cloud</span>
          </div>
          <button 
            className="lg:hidden text-slate-400 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <nav className="px-4 flex-1 space-y-1">
          <button onClick={() => { setActiveTab('files'); setCurrentFolderId(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'files' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Folder className={`w-5 h-5 ${activeTab === 'files' ? 'opacity-100 text-sky-400' : 'opacity-60'}`} />
            <span className="font-medium">My Files</span>
          </button>
          <button onClick={() => { setActiveTab('recent'); setCurrentFolderId(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'recent' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Clock className={`w-5 h-5 ${activeTab === 'recent' ? 'opacity-100 text-sky-400' : 'opacity-60'}`} />
            <span className="font-medium">Recent</span>
          </button>
          <button onClick={() => { setActiveTab('starred'); setCurrentFolderId(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'starred' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Star className={`w-5 h-5 ${activeTab === 'starred' ? 'opacity-100 text-sky-400' : 'opacity-60'}`} />
            <span className="font-medium">Starred</span>
          </button>
          <button onClick={() => { setActiveTab('trash'); setCurrentFolderId(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'trash' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Trash className={`w-5 h-5 ${activeTab === 'trash' ? 'opacity-100 text-rose-400' : 'opacity-60'}`} />
            <span className="font-medium">Trash</span>
          </button>
          <button onClick={() => { setActiveTab('account'); setCurrentFolderId(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'account' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <UserIcon className={`w-5 h-5 ${activeTab === 'account' ? 'opacity-100 text-sky-400' : 'opacity-60'}`} />
            <span className="font-medium">My Account</span>
          </button>
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
        <header className="h-16 flex items-center justify-between px-4 lg:px-8 bg-white/5 backdrop-blur-md border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <button 
              className="lg:hidden text-slate-400 hover:text-white p-2"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative w-full max-w-[150px] sm:max-w-xs md:max-w-sm hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search in cloud..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 text-white placeholder-slate-500" 
              />
            </div>
          </div>
          <div className="flex items-center gap-3 lg:gap-6">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-sky-500/10 rounded-full border border-sky-500/20">
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
          
          {errorMsg && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 backdrop-blur-md flex justify-between items-start">
              <div>{errorMsg}</div>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-300 ml-4"><X className="w-5 h-5"/></button>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 backdrop-blur-md flex justify-between items-start">
              <div>{successMsg}</div>
              <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-300 ml-4"><X className="w-5 h-5"/></button>
            </div>
          )}

          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                {activeTab === 'files' ? (currentFolder ? currentFolder.name : "My Files") : 
                 activeTab === 'recent' ? "Recent Files" :
                 activeTab === 'starred' ? "Starred Files" :
                 activeTab === 'trash' ? "Trash" : "My Account"}
              </h2>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <button onClick={() => setCurrentFolderId(null)} className="hover:text-white cursor-pointer transition-colors">Root</button>
                {currentFolder && (
                  <>
                    <span>/</span>
                    <span className="text-sky-400">{currentFolder.name}</span>
                  </>
                )}
                {!currentFolder && activeTab === 'files' && (
                   <>
                     <span>/</span>
                     <span className="text-sky-400">My Files</span>
                   </>
                )}
              </div>
            </div>
            <div className="flex gap-3 relative">
              {activeTab === 'files' && (
                <button 
                  onClick={handleCreateFolder}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl flex items-center gap-2 text-sm font-bold text-white transition-all"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Create Folder</span>
                </button>
              )}
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
             <div className="mb-6 p-5 bg-white/5 border border-sky-500/30 rounded-2xl flex flex-col gap-3 backdrop-blur-md">
                <div className="flex items-center gap-4 text-sky-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-medium">{uploadStatus || "Processing..."} {uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : (uploadProgress === 100 && uploadStatus === "Uploading to cloud..." ? "100% (waiting for server)" : "")}</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-sky-500 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                </div>
             </div>
          )}

          {activeTab === 'account' ? (
            <div className="max-w-2xl mx-auto w-full bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-md">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-2xl font-bold ring-4 ring-white/10 text-white uppercase">
                  {user.email?.charAt(0) || "U"}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">My Account</h3>
                  <p className="text-slate-400">{user.email}</p>
                </div>
              </div>
              <div className="border-t border-white/10 pt-6">
                <h4 className="text-lg font-medium text-white mb-4">Change Password</h4>
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="password" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min 6 chars)"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    />
                  </div>
                  {passwordError && <div className="text-rose-400 text-xs">{passwordError}</div>}
                  {passwordSuccess && <div className="text-emerald-400 text-xs">{passwordSuccess}</div>}
                  <button type="submit" className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-medium rounded-xl transition-all">Update Password</button>
                </form>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {isLoadingFiles ? (
                <>
                  {[1,2,3,4].map((n) => (
                    <div key={n} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse h-32 flex flex-col justify-between">
                      <div className="w-12 h-12 bg-white/10 rounded-xl"></div>
                      <div className="space-y-2">
                        <div className="h-4 bg-white/10 rounded w-3/4"></div>
                        <div className="h-3 bg-white/10 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {activeTab === 'files' && !currentFolderId && folders.map(folder => (
                    <div 
                      key={folder.id} 
                      onClick={() => setCurrentFolderId(folder.id)}
                      className="group bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 transition-all flex items-center gap-4 cursor-pointer relative"
                    >
                      <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                        <Folder className="w-6 h-6 text-indigo-400" />
                      </div>
                      <div className="flex-1 truncate">
                        <h3 className="font-semibold text-white truncate text-base">{folder.name}</h3>
                        <p className="text-xs text-slate-400 mt-1">Folder</p>
                      </div>
                    </div>
                  ))}
                  
                  {filteredFiles.length === 0 && (activeTab !== 'files' || folders.length === 0 || currentFolderId) ? (
                     <div className="col-span-full py-12 text-center text-slate-500">
                       No files found here.
                     </div>
                  ) : (
                    filteredFiles.map((file) => {
                const zip = isZip(file.name, file.type);
                
                const FileMenu = ({ file }: { file: any }) => (
                  <div className="absolute top-4 right-4 z-20">
                    <button 
                      onClick={() => setOpenMenuId(openMenuId === file.id ? null : file.id)}
                      className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    
                    {openMenuId === file.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-[#0a0f18] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-30">
                        <button 
                          onClick={() => handleCopyLink(file.fileUrl)}
                          className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
                        >
                          <Link className="w-4 h-4" /> Copy Link
                        </button>
                        <button 
                          onClick={() => handleToggleStar(file.id, file.isStarred)}
                          className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
                        >
                          {file.isStarred ? <StarOff className="w-4 h-4" /> : <Star className="w-4 h-4" />} 
                          {file.isStarred ? "Unstar" : "Star"}
                        </button>
                        {!file.isTrash && (
                          <button 
                            onClick={() => {
                               setShowMoveModal(file.id);
                               setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
                          >
                            <MoveRight className="w-4 h-4" /> Move File
                          </button>
                        )}
                        
                        {!file.isTrash ? (
                          <button 
                            onClick={() => handleToggleTrash(file.id, file.isTrash)}
                            className="w-full px-4 py-2 text-left text-sm text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 flex items-center gap-2"
                          >
                            <Trash className="w-4 h-4" /> Move to Trash
                          </button>
                        ) : (
                          <>
                            <button 
                              onClick={() => handleToggleTrash(file.id, file.isTrash)}
                              className="w-full px-4 py-2 text-left text-sm text-sky-400 hover:bg-sky-500/10 hover:text-sky-300 flex items-center gap-2"
                            >
                              <RefreshCcw className="w-4 h-4" /> Restore
                            </button>
                            <button 
                              onClick={() => handleDeletePermanently(file.id)}
                              className="w-full px-4 py-2 text-left text-sm text-rose-500 hover:bg-rose-500/10 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" /> Delete Permanently
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
                
                if (zip) {
                  return (
                    <div key={file.id} className="col-span-1 md:col-span-2 xl:col-span-2 bg-white/5 border border-sky-500/30 rounded-3xl p-6 relative flex flex-col justify-between group shadow-2xl shadow-sky-900/20 backdrop-blur-3xl transition-all hover:bg-white/10">
                      <FileMenu file={file} />
                      <div className="flex justify-between items-start pr-10">
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
                  <div key={file.id} className="group bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 relative transition-all flex flex-col justify-between">
                    <FileMenu file={file} />
                    <div className="pr-10">
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
            </>
          )}
          </div>
          )}
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

      {/* Move File Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a0f18] border border-white/10 p-6 rounded-2xl w-full max-w-md shadow-2xl relative">
            <h3 className="text-xl font-bold text-white mb-4">Move File</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
               <button 
                  onClick={() => handleMoveFile(showMoveModal, null)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors border border-transparent hover:border-white/10 text-left"
                >
                  <Folder className="w-5 h-5 text-sky-400" />
                  <span>Root (My Files)</span>
               </button>
              {folders.map(folder => (
                <button 
                  key={folder.id}
                  onClick={() => handleMoveFile(showMoveModal, folder.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors border border-transparent hover:border-white/10 text-left"
                >
                  <Folder className="w-5 h-5 text-indigo-400" />
                  <span>{folder.name}</span>
                </button>
              ))}
              {folders.length === 0 && (
                 <div className="p-3 text-sm text-slate-500 text-center">No custom folders created yet.</div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button 
                onClick={() => setShowMoveModal(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

