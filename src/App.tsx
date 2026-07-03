import { useState, useEffect } from "react";
import { auth, googleProvider } from "./firebase";
import { signInWithPopup, User as FirebaseUser, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import Dashboard from "./components/Dashboard";
import SharePage from "./components/SharePage";
import VerifyEmailPage from "./components/VerifyEmailPage";
import NebulaLogo from "./components/NebulaLogo";
import { 
  Cloud, Loader2, Mail, Lock, Eye, EyeOff, Film, X, Check, Folder, Archive, Shield, Zap, Sparkles, ArrowRight, User
} from "lucide-react";

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const isShareView = window.location.pathname === "/share";
  const isVerifyView = window.location.pathname === "/verify";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u && !u.emailVerified) {
        auth.signOut();
        setUser(null);
      } else {
        setUser(u);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setShowAuthModal(false);
    } catch (error) {
      console.error("Error signing in", error);
    }
  };

  const handleEmailAuth = async (e: import("react").FormEvent) => {
    e.preventDefault();
    setAuthError("");
    
    if (isSignUp) {
      if (!fullName.trim()) {
        setAuthError("Full Name is required");
        return;
      }

      const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email);
      if (!isGmail) {
        setAuthError("Only official Google Gmail accounts (@gmail.com) are allowed.");
        return;
      }
      
      if (password !== confirmPassword) {
        setAuthError("Passwords do not match");
        return;
      }
      
      try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        
        if (userCred.user) {
          await updateProfile(userCred.user, {
            displayName: fullName.trim()
          });
        }
        
        // Call our backend to send custom verification email via Nodemailer
        const response = await fetch("/api/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to send verification email");
        }

        await auth.signOut();
        setVerificationSent(true);
        setShowAuthModal(false);
      } catch (error: any) {
        console.error("Error with email signup", error);
        if (error.code === 'auth/email-already-in-use') {
           setAuthError("Email is already registered. Please sign in instead.");
        } else {
           setAuthError(error.message);
        }
      }
    } else {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          await auth.signOut();
          
          // Optionally attempt to resend if they try to login again while unverified
          const response = await fetch("/api/send-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
          });
          
          if (!response.ok) {
            const errData = await response.json();
            setAuthError("Please verify your email. " + (errData.error || "Failed to resend link."));
          } else {
            setVerificationSent(true);
            setShowAuthModal(false);
          }
          return;
        }
        setShowAuthModal(false);
      } catch (error: any) {
        console.error("Error with email signin", error);
        setAuthError(error.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[var(--primary-brand-color)] animate-spin" />
      </div>
    );
  }

  // Render the public SharePage view bypass for guests or users alike
  if (isShareView) {
    return <SharePage />;
  }

  if (isVerifyView) {
    return <VerifyEmailPage />;
  }

  if (verificationSent) {
    return (
      <div className="min-h-screen bg-[#0d1117] text-slate-200 font-sans flex flex-col relative overflow-hidden justify-center items-center px-4 selection:bg-[#0095ff]/30 selection:text-white">
        {/* Background Gradients */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#0095ff]/8 blur-[130px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-500/8 blur-[130px]"></div>
        </div>

        <div className="max-w-md w-full bg-[#161b22]/90 border border-white/10 p-8 rounded-3xl shadow-2xl shadow-[#0095ff]/15 text-center relative z-10">
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-[#0095ff]/5">
            <Mail className="w-10 h-10 text-[#0095ff]" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight mb-4">
            Verify Your Email
          </h2>
          <p className="text-slate-300 mb-6 text-sm leading-relaxed">
            A verification link has been sent to your Gmail. Please verify it to log in.
          </p>
          <div className="text-xs text-slate-400 bg-white/5 border border-white/5 rounded-xl p-3 mb-6 text-left font-mono">
            Please check your spam or promotions tab if you don't receive it in a few minutes.
          </div>
          <button
            onClick={() => {
              setVerificationSent(false);
              setIsSignUp(false);
              setShowAuthModal(true);
            }}
            className="w-full bg-[#0095ff] hover:bg-[#0084e0] active:scale-95 text-white font-bold py-2.5 px-4 rounded-xl cursor-pointer transition-all duration-150"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0d1117] text-slate-200 font-sans flex flex-col relative overflow-x-hidden selection:bg-[#0095ff]/30 selection:text-white">
        {/* Background Gradients */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#0095ff]/8 blur-[130px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-500/8 blur-[130px]"></div>
        </div>

        {/* Header Navigation */}
        <header className="w-full h-20 border-b border-white/5 backdrop-blur-md bg-[#0d1117]/80 sticky top-0 z-40 px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center shadow-lg shadow-[#0095ff]/5">
              <NebulaLogo className="w-8 h-8" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">Nebula Drive</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setIsSignUp(false);
                setAuthError("");
                setShowAuthModal(true);
              }}
              className="text-sm font-medium text-slate-300 hover:text-white cursor-pointer transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setIsSignUp(true);
                setAuthError("");
                setShowAuthModal(true);
              }}
              className="text-sm font-semibold bg-[#0095ff] hover:bg-[#0084e0] active:scale-95 text-white px-4 py-2 rounded-xl shadow-md shadow-[#0095ff]/10 cursor-pointer transition-all duration-200"
            >
              Sign Up
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-16 sm:py-24 max-w-4xl mx-auto relative z-10 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-[#0095ff] font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Introducing Secure Cloud Decompression</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6">
            The Premium Cloud Workspace for <span className="bg-gradient-to-r from-[#0095ff] to-cyan-400 bg-clip-text text-transparent">Your Files</span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mb-10 leading-relaxed">
            Manage your files, extract ZIP archives on the fly, and stream high-definition movies and audio tracks directly from your private, state-of-the-art workspace.
          </p>
          <button
            onClick={() => {
              setIsSignUp(true);
              setAuthError("");
              setShowAuthModal(true);
            }}
            className="animate-pulse-soft bg-[#0095ff] hover:bg-[#0084e0] active:scale-95 text-white font-bold text-base py-4 px-8 rounded-2xl shadow-lg shadow-[#0095ff]/25 transition-all duration-200 flex items-center gap-3 cursor-pointer"
          >
            Get Started For Free
            <ArrowRight className="w-5 h-5" />
          </button>
        </section>

        {/* Features Section */}
        <section className="py-20 px-4 sm:px-8 max-w-6xl mx-auto w-full relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white tracking-tight mb-4">Ultimate Cloud Control</h2>
            <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto">Explore the custom features engineered to give you the fastest, most reliable remote workspace.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* ZIP Card */}
            <div className="group bg-[#161b22]/40 border border-white/5 rounded-2xl p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_0_25px_rgba(0,149,255,0.12)] hover:border-[#0095ff]/30">
              <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mb-6 text-[#0095ff] group-hover:bg-[#0095ff]/10 group-hover:border-[#0095ff]/20 transition-all">
                <Archive className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Direct ZIP Extraction</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Decompress, browse, and extract files directly in your browser window. Zero downloads required to inspect compression files.
              </p>
            </div>

            {/* Video Streaming Card */}
            <div className="group bg-[#161b22]/40 border border-white/5 rounded-2xl p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_0_25px_rgba(0,149,255,0.12)] hover:border-[#0095ff]/30">
              <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mb-6 text-[#0095ff] group-hover:bg-[#0095ff]/10 group-hover:border-[#0095ff]/20 transition-all">
                <Film className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">High-Definition Streaming</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Instantly stream movie backups, custom video templates, and sound tracks with an advanced, custom-designed built-in player.
              </p>
            </div>

            {/* File Management Card */}
            <div className="group bg-[#161b22]/40 border border-white/5 rounded-2xl p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_0_25px_rgba(0,149,255,0.12)] hover:border-[#0095ff]/30">
              <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mb-6 text-[#0095ff] group-hover:bg-[#0095ff]/10 group-hover:border-[#0095ff]/20 transition-all">
                <Folder className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Advanced File Explorer</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Organize documents, create nested subfolders, search dynamically, star favorites, and recover items from a secure trash layout.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-20 px-4 sm:px-8 max-w-6xl mx-auto w-full relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white tracking-tight mb-4">Simple, Transparent Pricing</h2>
            <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto">Scale your storage seamlessly. No hidden fees or locked features.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* Free Plan */}
            <div className="group bg-[#161b22]/40 border border-white/5 rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_0_25px_rgba(0,149,255,0.12)] hover:border-[#0095ff]/30">
              <div>
                <span className="text-xs uppercase tracking-widest text-[#0095ff] font-bold">Starter</span>
                <div className="flex items-baseline gap-1 mt-4 mb-2">
                  <span className="text-4xl font-extrabold text-white">$0</span>
                  <span className="text-slate-500 text-sm">/ forever</span>
                </div>
                <p className="text-slate-400 text-xs mb-6">Perfect for basic personal storage and file previews.</p>
                <div className="border-t border-white/5 my-6"></div>
                <ul className="space-y-3.5">
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>5 GB Cloud Storage</span>
                  </li>
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>Nested Subfolder Creation</span>
                  </li>
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>Basic Video & Audio Playback</span>
                  </li>
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>Secure Password Management</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => {
                  setIsSignUp(true);
                  setAuthError("");
                  setShowAuthModal(true);
                }}
                className="w-full mt-8 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 px-4 rounded-xl transition-all cursor-pointer border border-white/10"
              >
                Start Free
              </button>
            </div>

            {/* Pro Plan */}
            <div className="group bg-[#161b22]/60 border-2 border-[#0095ff]/30 rounded-3xl p-8 flex flex-col justify-between relative transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_0_30px_rgba(0,149,255,0.18)] hover:border-[#0095ff]">
              <div className="absolute top-0 right-6 -translate-y-1/2 bg-[#0095ff] text-white text-[10px] font-extrabold uppercase px-3 py-1 rounded-full tracking-wider shadow-lg">
                Most Popular
              </div>
              <div>
                <span className="text-xs uppercase tracking-widest text-cyan-400 font-bold">Professional</span>
                <div className="flex items-baseline gap-1 mt-4 mb-2">
                  <span className="text-4xl font-extrabold text-white">$9.99</span>
                  <span className="text-slate-500 text-sm">/ month</span>
                </div>
                <p className="text-slate-400 text-xs mb-6">Designed for creators and busy professionals.</p>
                <div className="border-t border-white/5 my-6"></div>
                <ul className="space-y-3.5">
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>100 GB High-Speed Storage</span>
                  </li>
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>Instant ZIP Decompression</span>
                  </li>
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>Ultra-HD Media Streaming</span>
                  </li>
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>Advanced Star & Label Filters</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => {
                  setIsSignUp(true);
                  setAuthError("");
                  setShowAuthModal(true);
                }}
                className="w-full mt-8 bg-[#0095ff] hover:bg-[#0084e0] text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-[#0095ff]/15 transition-all cursor-pointer"
              >
                Go Professional
              </button>
            </div>

            {/* Enterprise Plan */}
            <div className="group bg-[#161b22]/40 border border-white/5 rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_0_25px_rgba(0,149,255,0.12)] hover:border-[#0095ff]/30">
              <div>
                <span className="text-xs uppercase tracking-widest text-[#0095ff] font-bold">Enterprise</span>
                <div className="flex items-baseline gap-1 mt-4 mb-2">
                  <span className="text-4xl font-extrabold text-white">Custom</span>
                </div>
                <p className="text-slate-400 text-xs mb-6">For teams requiring scalable, custom-built workspace solutions.</p>
                <div className="border-t border-white/5 my-6"></div>
                <ul className="space-y-3.5">
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>Unlimited Shared Storage</span>
                  </li>
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>Bespoke Cloud CDN Routing</span>
                  </li>
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>Advanced Security Compliance</span>
                  </li>
                  <li className="flex items-center gap-3 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-[#0095ff] shrink-0" />
                    <span>24/7 Dedicated Account Manager</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => {
                  setIsSignUp(true);
                  setAuthError("");
                  setShowAuthModal(true);
                }}
                className="w-full mt-8 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 px-4 rounded-xl transition-all cursor-pointer border border-white/10"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full py-10 px-4 sm:px-8 border-t border-white/5 bg-[#0d1117] mt-auto">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-500 font-medium">
            <div className="flex items-center gap-3">
              <NebulaLogo className="w-5 h-5 text-slate-500" />
              <span>© 2026 Nebula Drive. Engineered for ultimate security and speed.</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="#privacy" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#terms" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#docs" className="hover:text-white transition-colors">Documentation</a>
            </div>
          </div>
        </footer>

        {/* Modal Auth Overlay */}
        {showAuthModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="max-w-md w-full bg-[#161b22] border border-white/10 p-8 rounded-3xl shadow-2xl shadow-[#0095ff]/15 text-center relative animate-fade-in-up">
              {/* Close Button */}
              <button
                onClick={() => setShowAuthModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-[#0095ff]/5">
                <NebulaLogo className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight mb-2">
                {isSignUp ? "Create Your Workspace" : "Welcome Back"}
              </h2>
              <p className="text-slate-400 mb-8 text-xs">
                {isSignUp 
                  ? "Register to begin uploading and managing your remote cloud workspace." 
                  : "Sign in to manage your files, extract ZIP archives, and stream high-definition media."}
              </p>
              
              <form onSubmit={handleEmailAuth} className="flex flex-col gap-4 mb-6">
                {isSignUp && (
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Full Name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#0095ff]/50"
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="email" 
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#0095ff]/50"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#0095ff]/50"
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
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#0095ff]/50"
                    />
                  </div>
                )}
                {authError && <div className="text-rose-400 text-xs text-left">{authError}</div>}
                <button 
                  type="submit"
                  className="w-full bg-[#0095ff] hover:bg-[#0084e0] active:scale-98 shadow-lg shadow-[#0095ff]/20 text-white font-bold py-2.5 px-4 rounded-xl cursor-pointer transition-all duration-150"
                >
                  {isSignUp ? "Sign Up" : "Sign In"}
                </button>
              </form>

              <div className="relative flex items-center gap-4 my-6">
                <div className="flex-1 border-t border-white/10"></div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Or</span>
                <div className="flex-1 border-t border-white/10"></div>
              </div>

              <button
                onClick={handleSignIn}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-3 px-4 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-3"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                Continue with Google
              </button>

              <div className="mt-6 text-xs text-slate-400">
                {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                <button 
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setAuthError("");
                    setConfirmPassword("");
                  }}
                  className="text-[#0095ff] hover:text-cyan-400 font-medium transition-colors cursor-pointer"
                >
                  {isSignUp ? "Sign In" : "Sign Up"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-200 font-sans relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#0095ff]/5 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px]"></div>
      </div>
      <Dashboard user={user} />
    </div>
  );
}

