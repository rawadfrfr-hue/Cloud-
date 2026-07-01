import { useState, useEffect } from "react";
import { auth, googleProvider } from "./firebase";
import { signInWithPopup, User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import Dashboard from "./components/Dashboard";
import { Cloud, Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in", error);
    }
  };

  const handleEmailAuth = async (e: import("react").FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (isSignUp && password !== confirmPassword) {
      setAuthError("Passwords do not match");
      return;
    }
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Error with email auth", error);
      setAuthError(error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05070a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#05070a] text-slate-200 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-sky-500/10 blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
        </div>
        <div className="max-w-md w-full bg-white/5 backdrop-blur-2xl p-8 rounded-3xl shadow-2xl shadow-sky-900/20 border border-white/10 text-center relative z-10">
          <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-sky-500/20">
            <Cloud className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">R2Cloud</h1>
          <p className="text-slate-400 mb-8">Sign in to manage your files and extract ZIP archives directly in the cloud.</p>
          
          <form onSubmit={handleEmailAuth} className="flex flex-col gap-4 mb-6">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="email" 
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
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
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
              </div>
            )}
            {authError && <div className="text-rose-400 text-xs text-left">{authError}</div>}
            <button 
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-400 shadow-lg shadow-sky-500/20 text-white font-bold py-2.5 px-4 rounded-xl transition-all"
            >
              {isSignUp ? "Sign Up" : "Sign In"}
            </button>
          </form>

          <div className="relative flex items-center gap-4 my-6">
            <div className="flex-1 border-t border-white/10"></div>
            <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Or</span>
            <div className="flex-1 border-t border-white/10"></div>
          </div>

          <button
            onClick={handleSignIn}
            className="w-full bg-white/10 hover:bg-white/20 border border-white/10 text-white font-medium py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-3"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            Continue with Google
          </button>

          <div className="mt-6 text-sm text-slate-400">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button 
              onClick={() => {
                setIsSignUp(!isSignUp);
                setAuthError("");
                setConfirmPassword("");
              }}
              className="text-sky-400 hover:text-sky-300 font-medium transition-colors"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070a] text-slate-200 font-sans relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-sky-500/10 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
        <div className="absolute top-[30%] left-[40%] w-[30%] h-[30%] rounded-full bg-fuchsia-500/5 blur-[100px]"></div>
      </div>
      <Dashboard user={user} />
    </div>
  );
}

