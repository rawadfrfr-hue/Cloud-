import React from "react";

interface NebulaLogoProps {
  className?: string;
}

export default function NebulaLogo({ className = "w-8 h-8" }: NebulaLogoProps) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 120 120" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Deep tech blue to cyan gradient */}
        <linearGradient id="blue-gradient" x1="10" y1="110" x2="110" y2="10">
          <stop offset="0%" stopColor="#0256cc" />
          <stop offset="50%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        
        {/* Radiant green to emerald gradient */}
        <linearGradient id="green-gradient" x1="10" y1="110" x2="110" y2="10">
          <stop offset="0%" stopColor="#15803d" />
          <stop offset="50%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#a3e635" />
        </linearGradient>

        <shadow id="glow">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0284c7" floodOpacity="0.3" />
        </shadow>
      </defs>

      {/* Main Stylized "N" Ribbon Group */}
      <g>
        {/* Left blue ribbon stroke */}
        <path
          d="M 20 78 
             C 18 68, 30 45, 48 42 
             C 52 41, 55 44, 52 48 
             L 38 78 
             C 34 86, 22 88, 20 78 Z"
          fill="url(#blue-gradient)"
        />

        {/* Central green ribbon loop */}
        <path
          d="M 38 42 
             C 48 40, 68 45, 70 68 
             C 71 78, 58 85, 48 78 
             C 42 74, 44 65, 52 58 
             C 62 50, 72 54, 78 62 
             C 82 68, 86 64, 84 58
             C 80 44, 60 36, 46 38
             C 40 39, 36 38, 38 42 Z"
          fill="url(#green-gradient)"
        />

        {/* Right blue ribbon stroke */}
        <path
          d="M 68 62 
             C 74 54, 88 38, 98 42 
             C 102 44, 104 54, 100 64 
             C 96 74, 86 82, 78 78 
             C 74 76, 72 68, 76 62
             L 84 48
             C 86 44, 94 40, 96 46
             L 76 74
             C 72 80, 64 74, 68 62 Z"
          fill="url(#blue-gradient)"
        />
      </g>
    </svg>
  );
}
