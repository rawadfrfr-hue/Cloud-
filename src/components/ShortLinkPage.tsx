import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import SharePage from "./SharePage";
import { Loader2, Lock, FileQuestion, ArrowRight } from "lucide-react";

export default function ShortLinkPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkData, setLinkData] = useState<any>(null);
  
  const [passwordInput, setPasswordInput] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Extract code from /s/CODE
  const shortCode = window.location.pathname.split("/s/")[1]?.split("/")[0] || "";

  useEffect(() => {
    async function fetchShortLink() {
      if (!shortCode) {
        setError("Invalid link format.");
        setLoading(false);
        return;
      }

      try {
        const docRef = doc(db, "shortlinks", shortCode);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          setError("This link does not exist or has been removed.");
          setLoading(false);
          return;
        }

        const data = docSnap.data();

        // Check expiry
        if (data.expiresAt) {
          const now = Date.now();
          if (now > data.expiresAt) {
            setError("This link has expired.");
            setLoading(false);
            return;
          }
        }

        setLinkData(data);
        
        // If no password required, auto authenticate
        if (!data.passwordHash) {
          setIsAuthenticated(true);
        }
      } catch (err: any) {
        console.error("Error fetching shortlink:", err);
        setError("Failed to load the link. Please try again later.");
      } finally {
        setLoading(false);
      }
    }

    fetchShortLink();
  }, [shortCode]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    
    // Simple frontend password check for the special link
    if (passwordInput === linkData.passwordHash) {
      setIsAuthenticated(true);
    } else {
      setPasswordError("Incorrect password.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-[var(--primary-brand-color)] animate-spin mb-4" />
        <p className="text-slate-400 font-medium">Loading secure link...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="bg-white/5 border border-white/10 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl backdrop-blur-md">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileQuestion className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Link Unavailable</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">{error}</p>
          <button 
            onClick={() => window.location.href = "/"}
            className="px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl transition-all text-sm"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[var(--primary-brand-color)]/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="bg-white/5 border border-white/10 p-8 sm:p-10 rounded-[2rem] max-w-md w-full shadow-2xl backdrop-blur-xl relative z-10">
          <div className="w-16 h-16 bg-[var(--primary-brand-color)]/10 border border-[var(--primary-brand-color)]/20 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
            <Lock className="w-7 h-7 text-[var(--primary-brand-color)]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Protected File</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            This file is secured with a password. Please enter the password to access {linkData?.fileName}.
          </p>
          
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Enter password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-black/50 border border-white/10 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-[var(--primary-brand-color)] focus:ring-1 focus:ring-[var(--primary-brand-color)] transition-all placeholder:text-slate-500"
                autoFocus
              />
              {passwordError && <p className="text-rose-400 text-xs mt-2 font-medium">{passwordError}</p>}
            </div>
            
            <button
              type="submit"
              disabled={!passwordInput.trim()}
              className="w-full bg-[var(--primary-brand-color)] hover:bg-[var(--primary-brand-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-[var(--primary-brand-color)]/20 hover:shadow-[var(--primary-brand-color)]/40 flex items-center justify-center gap-2"
            >
              Access File <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // If authenticated and valid, render the actual SharePage with the explicit file data
  return <SharePage explicitFileKey={linkData.fileUrl} explicitFileName={linkData.fileName} />;
}