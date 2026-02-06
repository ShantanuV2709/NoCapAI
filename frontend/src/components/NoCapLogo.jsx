import React from 'react';

const NoCapLogo = ({ className = "w-10 h-10" }) => {
    return (
        <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Baseball Cap */}
            <g transform="translate(10, 20)">
                {/* Cap Dome */}
                <path
                    d="M10 50 C10 20 20 10 50 10 C80 10 90 20 90 50"
                    fill="#8b5cf6"
                    stroke="#7c3aed"
                    strokeWidth="4"
                />
                {/* Visor */}
                <path
                    d="M10 50 L90 50 L75 45 L25 45 Z"
                    fill="#7c3aed"
                />
                <path
                    d="M90 50 Q110 55 90 65 L80 65"
                    stroke="#8b5cf6"
                    strokeWidth="6"
                    strokeLinecap="round"
                    fill="none"
                />
            </g>

            {/* Prohibition Sign (The Cross) */}
            <circle cx="50" cy="50" r="35" stroke="#ef4444" strokeWidth="8" />
            <line x1="25" y1="25" x2="75" y2="75" stroke="#ef4444" strokeWidth="8" strokeLinecap="round" />
        </svg>
    );
};

export default NoCapLogo;
