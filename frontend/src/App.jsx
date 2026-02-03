import React from 'react';
import ChatBox from './components/ChatBox';
import ColorBends from './components/ColorBends';

function App() {
    return (
        <div className="relative min-h-screen overflow-hidden bg-[#0b0f1a]">
            {/* ColorBends Three.js Background */}
            <div className="fixed inset-0 z-0">
                <ColorBends
                    colors={["#6366f1", "#8b5cf6", "#22d3ee"]}
                    rotation={0}
                    speed={0.3}
                    scale={1}
                    frequency={1}
                    warpStrength={1}
                    mouseInfluence={0.5}
                    parallax={0.3}
                    noise={0.2}
                    transparent
                    autoRotate={0}
                />
            </div>

            {/* Dark overlay to reduce eye strain */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-[1]" />

            {/* Main content */}
            <div className="relative z-10 h-screen">
                <ChatBox />
            </div>
        </div>
    );
}

export default App;
