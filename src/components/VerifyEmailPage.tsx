import { useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { Mail, Check, X, Loader2 } from 'lucide-react';
import NebulaLogo from './NebulaLogo';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email address...");

  useEffect(() => {
    const verifyToken = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');

      if (!token) {
        setStatus("error");
        setMessage("Verification token is missing.");
        return;
      }

      try {
        const response = await fetch("/api/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });

        const data = await response.json();

        if (response.ok) {
          setStatus("success");
          setMessage("Your email has been successfully verified!");
        } else {
          setStatus("error");
          setMessage(data.error || "Failed to verify email.");
        }
      } catch (err) {
        setStatus("error");
        setMessage("An error occurred during verification.");
      }
    };

    verifyToken();
  }, []);

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-200 font-sans flex flex-col relative overflow-hidden justify-center items-center px-4 selection:bg-[#0095ff]/30 selection:text-white">
      {/* Background Gradients */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#0095ff]/8 blur-[130px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-500/8 blur-[130px]"></div>
      </div>

      <div className="max-w-md w-full bg-[#161b22]/90 border border-white/10 p-8 rounded-3xl shadow-2xl shadow-[#0095ff]/15 text-center relative z-10">
        <div className="flex justify-center mb-6">
          <NebulaLogo className="w-12 h-12" />
        </div>
        
        <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
          {status === "loading" && <Loader2 className="w-8 h-8 text-[#0095ff] animate-spin" />}
          {status === "success" && <Check className="w-8 h-8 text-emerald-400" />}
          {status === "error" && <X className="w-8 h-8 text-rose-400" />}
        </div>
        
        <h2 className="text-2xl font-bold text-white tracking-tight mb-4">
          {status === "loading" && "Verifying Email"}
          {status === "success" && "Email Verified!"}
          {status === "error" && "Verification Failed"}
        </h2>
        
        <p className="text-slate-300 mb-8 text-sm leading-relaxed">
          {message}
        </p>
        
        {status !== "loading" && (
          <button
            onClick={() => {
              navigate("/");
            }}
            className="w-full bg-[#0095ff] hover:bg-[#0084e0] active:scale-95 text-white font-bold py-2.5 px-4 rounded-xl cursor-pointer transition-all duration-150"
          >
            {status === "success" ? "Continue to Nebula Drive" : "Back to Home"}
          </button>
        )}
      </div>
    </div>
  );
}
