import React, { useState, useEffect, useRef } from "react";
import { auth, db, googleProvider, handleFirestoreError, OperationType } from "../firebase";
import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, sendEmailVerification } from "firebase/auth";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import NebulaLogo from "./NebulaLogo";
import { 
  Play, Pause, Download, FolderPlus, MoreVertical, X, Menu, Copy, Check, ExternalLink, 
  Loader2, Mail, Lock, Eye, EyeOff, Film, Globe, Info, Heart, ArrowRight,
  Maximize, Minimize, Volume2, VolumeX, Sun
} from "lucide-react";

export default function SharePage() {
  const [user, setUser] = useState<User | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingToDrive, setSavingToDrive] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveErrorMsg, setSaveErrorMsg] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [gestureIndicator, setGestureIndicator] = useState<{ type: 'volume' | 'brightness', value: number } | null>(null);
  const [prevVolume, setPrevVolume] = useState(1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const seekbarRef = useRef<HTMLDivElement>(null);
  
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const startVolume = useRef(1);
  const startBrightness = useRef(1);
  const isSwiping = useRef(false);
  const isMoving = useRef(false);
  const swipeSide = useRef<'left' | 'right' | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const pad = (num: number) => String(num).padStart(2, "0");
    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      
      const orientation = screen.orientation as any;
      if (!isCurrentlyFullscreen && orientation && typeof orientation.unlock === "function") {
        try {
          orientation.unlock();
        } catch (err) {
          // ignore
        }
      }
    };
    
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.volume = volume;
    }
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    if (volume > 0) {
      setPrevVolume(volume);
      videoRef.current.volume = 0;
      setVolume(0);
    } else {
      videoRef.current.volume = prevVolume;
      setVolume(prevVolume);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        } else if ((containerRef.current as any).msRequestFullscreen) {
          await (containerRef.current as any).msRequestFullscreen();
        }
        
        const orientation = screen.orientation as any;
        if (orientation && typeof orientation.lock === "function") {
          try {
            await orientation.lock("landscape");
          } catch (orientationErr) {
            console.warn("Could not lock orientation to landscape:", orientationErr);
          }
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
        
        const orientation = screen.orientation as any;
        if (orientation && typeof orientation.unlock === "function") {
          try {
            orientation.unlock();
          } catch (orientationErr) {
            console.warn("Could not unlock orientation:", orientationErr);
          }
        }
      }
    } catch (err) {
      console.error("Fullscreen toggle failed:", err);
    }
  };

  const handleSeek = (clientX: number) => {
    if (!seekbarRef.current || !videoRef.current || !duration) return;
    const rect = seekbarRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    videoRef.current.currentTime = percentage * duration;
    setCurrentTime(percentage * duration);
  };

  const handleSeekbarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    handleSeek(e.clientX);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleSeek(moveEvent.clientX);
    };
    
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleSeekbarTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    handleSeek(e.touches[0].clientX);
    
    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      handleSeek(moveEvent.touches[0].clientX);
    };
    
    const handleTouchEndEvent = () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEndEvent);
    };
    
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEndEvent);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    touchStartX.current = touch.clientX;
    isSwiping.current = true;
    isMoving.current = false;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const touchXRelative = touch.clientX - rect.left;
    const isLeft = touchXRelative < rect.width / 2;
    swipeSide.current = isLeft ? 'left' : 'right';

    startVolume.current = videoRef.current ? videoRef.current.volume : 1;
    startBrightness.current = brightness;
    
    resetControlsTimeout();
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isSwiping.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaY = touchStartY.current - touch.clientY;
    const deltaX = touch.clientX - touchStartX.current;
    
    if (Math.abs(deltaY) > 8 || Math.abs(deltaX) > 8) {
      isMoving.current = true;
    }
    
    if (!isMoving.current) return;
    
    const change = deltaY / 150; 

    if (swipeSide.current === 'right') {
      const newVolume = Math.max(0, Math.min(1, startVolume.current + change));
      if (videoRef.current) {
        videoRef.current.volume = newVolume;
        setVolume(newVolume);
      }
      setGestureIndicator({ type: 'volume', value: Math.round(newVolume * 100) });
    } else if (swipeSide.current === 'left') {
      const newBrightness = Math.max(0, Math.min(1, startBrightness.current + change));
      setBrightness(newBrightness);
      setGestureIndicator({ type: 'brightness', value: Math.round(newBrightness * 100) });
    }
    
    resetControlsTimeout();
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    isSwiping.current = false;
    swipeSide.current = null;
    setTimeout(() => {
      setGestureIndicator(null);
    }, 800);
    
    if (!isMoving.current) {
      if (!(e.target as HTMLElement).closest(".video-controls-container")) {
        handlePlayToggle();
      }
    }
    isMoving.current = false;
  };

  // Get key and name from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const fileKey = urlParams.get("key") || "";
  const rawFileName = urlParams.get("name") || "";
  // If no name is provided, extract it from the key path
  const fileName = rawFileName || fileKey.split("/").pop() || "Shared Video";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u && !u.emailVerified) {
        auth.signOut();
        setUser(null);
      } else {
        setUser(u);
      }
      setUserLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handlePlayToggle = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Video play failed", err);
      });
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
    setShowDropdown(false);
  };

  const handleDownloadDirect = () => {
    if (!fileKey) return;
    const downloadUrl = `/api/download?key=${encodeURIComponent(fileKey)}`;
    // Create a temporary link to download
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveToDrive = async () => {
    if (!user) {
      // Prompt user to sign in first
      setIsSignUp(false);
      setShowAuthModal(true);
      return;
    }

    setSavingToDrive(true);
    setSaveStatus("idle");
    setSaveErrorMsg("");

    try {
      // Determine file type from extension
      const ext = fileName.split('.').pop()?.toLowerCase();
      let detectedType = "video/mp4"; // default for this preview page
      if (ext === 'mov') detectedType = "video/quicktime";
      if (ext === 'avi') detectedType = "video/x-msvideo";
      if (ext === 'mkv') detectedType = "video/x-matroska";

      try {
        await addDoc(collection(db, "files"), {
          userId: user.uid,
          folderId: null, // save in root
          name: fileName,
          fileUrl: fileKey,
          thumbnailUrl: fileKey.replace("extracted_", "thumb_"), // fallback guess or blank
          size: 0, // original size is unknown at this step but saving link works
          type: detectedType,
          createdAt: serverTimestamp(),
        });
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.CREATE, "files");
      }

      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 5000);
    } catch (err: any) {
      console.error("Failed to save to Drive", err);
      setSaveStatus("error");
      setSaveErrorMsg(err.message || "Failed to save file");
    } finally {
      setSavingToDrive(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    if (isSignUp) {
      const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email);
      if (!isGmail) {
        setAuthError("Only official Google Gmail accounts (@gmail.com) are allowed.");
        setAuthLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        setAuthError("Passwords do not match");
        setAuthLoading(false);
        return;
      }

      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        await auth.signOut();
        setVerificationSent(true);
      } catch (error: any) {
        console.error("Auth signup error", error);
        setAuthError(error.message);
      } finally {
        setAuthLoading(false);
      }
    } else {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          await auth.signOut();
          setAuthError("Please verify your email link before logging in.");
          setAuthLoading(false);
          return;
        }
        setShowAuthModal(false);
        // Automatically attempt to save to drive after successful login
        setTimeout(() => {
          handleSaveToDrive();
        }, 500);
      } catch (error: any) {
        console.error("Auth signin error", error);
        setAuthError(error.message);
      } finally {
        setAuthLoading(false);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      setShowAuthModal(false);
      setTimeout(() => {
        handleSaveToDrive();
      }, 500);
    } catch (error: any) {
      console.error("Google login error", error);
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-slate-200 font-sans flex flex-col justify-between relative overflow-hidden">
      {/* Background stars glowing effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--primary-brand-color)]/5 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px]"></div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-6 z-10 flex-1 flex flex-col justify-start">
        
        {/* 1. Top Header Section (Branding & File Info) */}
        <header className="flex items-center justify-between py-4 border-b border-white/5 mb-8 relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center shadow-lg shadow-[var(--primary-brand-color)]/10">
              <NebulaLogo className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-lg tracking-tight">Nebula Drive</span>
                <span className="text-xs bg-white/10 px-2.5 py-0.5 rounded-full text-slate-400 font-medium border border-white/5 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-emerald-400" /> Shared View
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Download - Nebula Drive</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {userLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : user ? (
              <div className="hidden md:flex items-center gap-3 bg-white/5 border border-white/5 px-4 py-1.5 rounded-xl">
                <div className="w-6 h-6 rounded-full bg-[var(--primary-brand-color)]/20 text-[var(--primary-brand-color)] flex items-center justify-center text-xs font-bold border border-[var(--primary-brand-color)]/30">
                  {user.email?.[0].toUpperCase() || "U"}
                </div>
                <span className="text-xs font-medium text-slate-300 truncate max-w-[120px]">{user.email}</span>
                <button 
                  onClick={() => window.location.href = "/"}
                  className="text-xs text-[var(--primary-brand-color)] hover:text-[var(--primary-brand-hover)] transition-colors font-semibold border-l border-white/10 pl-3"
                >
                  My Drive
                </button>
              </div>
            ) : (
              <button 
                onClick={() => { setIsSignUp(false); setShowAuthModal(true); }}
                className="hidden sm:block px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Sign up / Login
              </button>
            )}

            {/* Mobile hamburger menu */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 hover:text-white transition-colors"
              aria-label="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Mobile menu dropdown */}
            {mobileMenuOpen && (
              <div className="absolute right-0 top-16 w-52 bg-[var(--bg-card)] border border-white/10 rounded-2xl shadow-2xl p-4 z-50 flex flex-col gap-3">
                {user ? (
                  <>
                    <div className="px-2 py-1.5 border-b border-white/5">
                      <p className="text-xs text-slate-500">Logged in as</p>
                      <p className="text-xs font-semibold text-white truncate">{user.email}</p>
                    </div>
                    <button 
                      onClick={() => window.location.href = "/"}
                      className="w-full text-left py-2 px-2 hover:bg-white/5 rounded-xl text-sm font-semibold text-[var(--primary-brand-color)] flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" /> Go to Dashboard
                    </button>
                    <button 
                      onClick={() => auth.signOut().then(() => setMobileMenuOpen(false))}
                      className="w-full text-left py-2 px-2 hover:bg-rose-500/10 rounded-xl text-sm font-semibold text-rose-400"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => { setMobileMenuOpen(false); setIsSignUp(false); setShowAuthModal(true); }}
                      className="w-full text-left py-2 px-2 hover:bg-white/5 rounded-xl text-sm font-semibold text-white"
                    >
                      Sign In
                    </button>
                    <button 
                      onClick={() => { setMobileMenuOpen(false); setIsSignUp(true); setShowAuthModal(true); }}
                      className="w-full text-left py-2 px-2 hover:bg-white/5 rounded-xl text-sm font-semibold text-sky-400"
                    >
                      Create Account
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Display bold, prominent shared video file name */}
        <div className="mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight truncate max-w-full" title={fileName}>
            {fileName}
          </h2>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-sky-400/80" /> Double click or click center overlay button to play/pause.
          </p>
        </div>

        {/* 2. Middle Section (Video Player & Quick Links) */}
        <div className="w-full flex flex-col">
          {/* Responsive video container with letterboxing */}
          <div 
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseMove={resetControlsTimeout}
            className={`bg-black overflow-hidden flex items-center justify-center relative group select-none transition-all duration-300 ${
              isFullscreen 
                ? "w-screen h-screen fixed inset-0 z-50 animate-fade-in" 
                : "w-full aspect-video rounded-3xl border border-white/10"
            }`}
          >
            
            <video 
              ref={videoRef}
              src={`/api/download?key=${encodeURIComponent(fileKey)}`}
              onEnded={handleVideoEnded}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              className="w-full h-full object-contain bg-black"
              playsInline
            >
              Your browser does not support the video tag.
            </video>

            {/* Brightness overlay layer */}
            <div 
              className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-150"
              style={{ opacity: 1 - brightness }}
            />

            {/* Gesture indicator popup HUD */}
            {gestureIndicator && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/85 border border-white/10 px-5 py-3 rounded-2xl flex flex-col items-center gap-2 pointer-events-none z-40 shadow-2xl backdrop-blur-md">
                {gestureIndicator.type === 'volume' ? (
                  <>
                    {gestureIndicator.value === 0 ? <VolumeX className="w-8 h-8 text-rose-400" /> : <Volume2 className="w-8 h-8 text-[var(--primary-brand-color)]" />}
                    <span className="text-sm font-bold text-white">Volume: {gestureIndicator.value}%</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-8 h-8 text-amber-400 animate-pulse" />
                    <span className="text-sm font-bold text-white">Brightness: {gestureIndicator.value}%</span>
                  </>
                )}
              </div>
            )}

            {/* Center-Overlaid Play Button when paused */}
            {!isPlaying && (
              <div 
                onClick={handlePlayToggle}
                className="absolute inset-0 bg-black/30 flex items-center justify-center cursor-pointer transition-all duration-300 group-hover:bg-black/45"
              >
                <button 
                  className="w-16 h-16 rounded-full bg-[var(--primary-brand-color)] hover:bg-[var(--primary-brand-hover)] text-white flex items-center justify-center shadow-2xl shadow-[var(--primary-brand-color)]/50 transition-all transform hover:scale-110 active:scale-95 duration-200"
                >
                  <Play className="w-7 h-7 fill-white translate-x-0.5" />
                </button>
              </div>
            )}

            {/* Custom Interactive HUD Video Controls Container */}
            <div className={`video-controls-container absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-4 flex flex-col gap-3 transition-opacity duration-300 z-30 ${showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              
              {/* Custom Seekbar Timeline */}
              <div 
                ref={seekbarRef}
                onMouseDown={handleSeekbarMouseDown}
                onTouchStart={handleSeekbarTouchStart}
                className="w-full h-4 flex items-center cursor-pointer group/seekbar select-none"
              >
                <div className="w-full h-1 bg-white/20 rounded-full relative group-hover/seekbar:h-1.5 transition-all overflow-visible">
                  <div 
                    className="absolute left-0 top-0 h-full bg-[var(--primary-brand-color)] rounded-full"
                    style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                  />
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover/seekbar:scale-100 transition-transform duration-100 border border-[var(--primary-brand-color)]"
                    style={{ left: `calc(${duration ? (currentTime / duration) * 100 : 0}% - 6px)` }}
                  />
                </div>
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Play/Pause Button */}
                  <button 
                    onClick={handlePlayToggle}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-white transition-all transform hover:scale-110 active:scale-95"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
                  </button>

                  {/* Time Display */}
                  <span className="text-xs font-mono text-slate-300">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Volume Slider Controls */}
                  <div className="flex items-center gap-2 group/volume">
                    <button 
                      onClick={handleToggleMute}
                      className="p-1.5 hover:bg-white/10 rounded-lg text-white transition-colors"
                    >
                      {volume === 0 ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
                    </button>
                    
                    <input 
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={(e) => {
                        const newVol = parseFloat(e.target.value);
                        setVolume(newVol);
                        if (videoRef.current) videoRef.current.volume = newVol;
                      }}
                      className="w-0 group-hover/volume:w-16 transition-all duration-200 accent-[var(--primary-brand-color)] h-1 rounded-lg appearance-none bg-white/20 cursor-pointer hidden md:block"
                    />
                  </div>

                  {/* Fullscreen Trigger */}
                  <button 
                    onClick={toggleFullscreen}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-white transition-all transform hover:scale-110 active:scale-95"
                    title="Toggle Fullscreen"
                  >
                    {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Action Row directly below the video */}
          <div className="flex items-center justify-between mt-4 px-2">
            <button 
              onClick={() => window.location.href = "/"}
              className="text-xs text-[var(--primary-brand-color)] hover:text-[var(--primary-brand-hover)] font-bold flex items-center gap-1.5 transition-colors group"
            >
              Go to Nabula Drive <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>

            <div className="relative">
              <button 
                onClick={() => setShowDropdown(!showDropdown)}
                className="p-1.5 hover:bg-white/5 rounded-lg border border-transparent hover:border-white/5 text-slate-400 hover:text-white transition-all"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showDropdown && (
                <div className="absolute right-0 bottom-8 mb-2 w-48 bg-[var(--bg-card)] border border-white/10 rounded-xl shadow-2xl py-1 z-30">
                  <button 
                    onClick={handleCopyLink}
                    className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Link Copied" : "Copy Shared Link"}
                  </button>
                  <button 
                    onClick={handleDownloadDirect}
                    className="w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Direct Download
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Bottom Action Section (Call to Actions) */}
        <div className="mt-8 flex items-center gap-3 w-full">
          {/* Square direct download button on the left */}
          <button 
            onClick={handleDownloadDirect}
            className="w-14 h-14 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-2xl flex items-center justify-center text-slate-300 hover:text-white transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            title="Direct Download"
          >
            <Download className="w-6 h-6" />
          </button>

          {/* Wide, prominent Save to Nebula Drive button */}
          <button 
            onClick={handleSaveToDrive}
            disabled={savingToDrive || saveStatus === "success"}
            className="flex-1 h-14 bg-[var(--primary-brand-color)] hover:bg-[var(--primary-brand-hover)] disabled:bg-emerald-600 shadow-xl shadow-[var(--primary-brand-color)]/20 hover:shadow-[var(--primary-brand-color)]/35 text-white font-bold rounded-2xl flex items-center justify-center gap-3.5 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none disabled:cursor-not-allowed"
          >
            {savingToDrive ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Saving...
              </>
            ) : saveStatus === "success" ? (
              <>
                <Check className="w-5 h-5 text-emerald-100 stroke-[3]" /> Saved to your Drive!
              </>
            ) : (
              <>
                <FolderPlus className="w-5 h-5" /> Save to Nebula Drive
              </>
            )}
          </button>
        </div>

        {/* Info or helper messaging */}
        {saveStatus === "success" && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2 animate-fade-in">
            <Check className="w-4 h-4" /> This shared video was added to your root files. You can access it anytime from your dashboard.
          </div>
        )}
        {saveStatus === "error" && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center gap-2">
            <X className="w-4 h-4" /> {saveErrorMsg}
          </div>
        )}

      </div>

      {/* Footer Branding */}
      <footer className="w-full py-8 text-center border-t border-white/5 text-slate-500 text-xs bg-[#030508]/40 z-10 shrink-0">
        <p>© 2026 Nebula Drive. Multi-format High Performance Cloud Extraction Suite.</p>
        <p className="mt-1 text-slate-600">Secure, encrypted, global R2 infrastructure.</p>
      </footer>

      {/* Auth Modal (Sign In/Sign Up when saving to drive as guest) */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4" onClick={() => setShowAuthModal(false)}>
          <div 
            className="bg-[#0a0f18] border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              onClick={() => setShowAuthModal(false)}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-[var(--primary-brand-color)]/10">
              <NebulaLogo className="w-10 h-10" />
            </div>

            {verificationSent ? (
              <div className="text-center py-4 flex flex-col items-center">
                <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-[var(--primary-brand-color)]/10">
                  <Mail className="w-8 h-8 text-[var(--primary-brand-color)]" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">Verify Your Email</h3>
                <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                  A verification link has been sent to your Gmail. Please verify it to log in.
                </p>
                <div className="text-xs text-slate-400 bg-white/5 border border-white/5 rounded-xl p-3 mb-6 text-left font-mono w-full">
                  Please check your spam or promotions tab if you don't receive it in a few minutes.
                </div>
                <button
                  onClick={() => {
                    setVerificationSent(false);
                    setIsSignUp(false);
                  }}
                  className="w-full h-12 bg-[var(--primary-brand-color)] hover:bg-[var(--primary-brand-hover)] text-white font-bold rounded-xl transition-colors"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-2xl font-bold text-white mb-2">
                  {isSignUp ? "Create a Nebula Account" : "Sign in to Nebula Drive"}
                </h3>
                <p className="text-slate-400 text-xs mb-6">
                  You need an account to save files instantly to your own secure cloud storage.
                </p>

                <form onSubmit={handleEmailAuth} className="flex flex-col gap-4 mb-6">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                    <input 
                      type="email" 
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--primary-brand-color)]/50"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                    <input 
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--primary-brand-color)]/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  {isSignUp && (
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                      <input 
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--primary-brand-color)]/50"
                      />
                    </div>
                  )}

                  {authError && <div className="text-rose-400 text-xs text-left font-medium">{authError}</div>}

                  <button 
                    type="submit"
                    disabled={authLoading}
                    className="w-full h-12 bg-[var(--primary-brand-color)] hover:bg-[var(--primary-brand-hover)] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : isSignUp ? "Sign Up" : "Sign In"}
                  </button>
                </form>

                <div className="relative flex items-center gap-4 my-6">
                  <div className="flex-1 border-t border-white/10"></div>
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Or</span>
                  <div className="flex-1 border-t border-white/10"></div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={authLoading}
                  className="w-full h-12 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-xl flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                  Continue with Google
                </button>

                <div className="mt-6 text-center text-sm text-slate-400">
                  {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                  <button 
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setAuthError("");
                      setConfirmPassword("");
                    }}
                    className="text-[var(--primary-brand-color)] hover:text-[var(--primary-brand-hover)] font-semibold transition-colors"
                  >
                    {isSignUp ? "Sign In" : "Sign Up"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
