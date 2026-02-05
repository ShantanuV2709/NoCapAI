import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FiTrendingUp, FiAlertTriangle, FiActivity } from 'react-icons/fi';

const API_BASE_URL = 'http://127.0.0.1:8000';

const TrendingSidebar = ({ onSelectQuery }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [trends, setTrends] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTrends = async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/trending`);
                setTrends(response.data.trends || []);
            } catch (error) {
                console.error("Error fetching trends:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTrends();
        // Refresh every minute
        const interval = setInterval(fetchTrends, 60000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className={`h-full border-l border-white/10 bg-white/5 backdrop-blur-xl hidden lg:flex flex-col relative z-20 transition-all duration-300 ${isOpen ? 'w-80' : 'w-12'}`}>
                {/* Collapsed placeholder or skeleton */}
                <div className="absolute top-4 left-3">
                    <div className="w-6 h-6 bg-white/10 rounded-full animate-pulse"></div>
                </div>
            </div>
        );
    }

    if (trends.length === 0) return null;

    return (
        <div className={`h-full border-l border-white/10 bg-[#0b0f1a]/50 backdrop-blur-xl hidden lg:flex flex-col relative z-20 transition-all duration-300 ${isOpen ? 'w-80' : 'w-12'}`}>

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="absolute top-6 -left-3 transform -translate-x-full lg:translate-x-0 lg:left-2 z-50 p-1.5 rounded-full bg-white/10 text-white/50 hover:text-white hover:bg-white/20 transition-colors border border-white/5"
            >
                {isOpen ? <FiTrendingUp size={16} /> : <FiTrendingUp size={20} className="text-pink-500 animate-pulse" />}
            </button>

            {/* Content Container - Clips content when closed */}
            <div className={`flex flex-col h-full overflow-hidden ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'} transition-opacity duration-200`}>
                <div className="p-6 pl-10"> {/* Added left padding for button space */}
                    <div className="flex items-center gap-2 mb-6">
                        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-purple-500 whitespace-nowrap">
                            Viral Debunks
                        </h2>
                    </div>

                    <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-100px)] custom-scrollbar">
                        {trends.map((item, index) => (
                            <div
                                key={index}
                                onClick={() => onSelectQuery(item.query)}
                                className="group p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-pink-500/50 transition-all cursor-pointer relative overflow-hidden shrink-0"
                            >
                                {/* Rank Number */}
                                <div className="absolute top-2 right-2 text-4xl font-black text-white/5 group-hover:text-white/10 transition-colors pointer-events-none">
                                    #{index + 1}
                                </div>

                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${item.verdict?.toLowerCase() === 'fake' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                                            item.verdict?.toLowerCase() === 'misleading' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' :
                                                'bg-gray-500/20 text-gray-300'
                                            }`}>
                                            {item.verdict || 'Suspicious'}
                                        </span>
                                        <div className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                                            <FiActivity size={10} />
                                            {item.count} checked
                                        </div>
                                    </div>

                                    <p className="text-sm text-gray-200 font-medium line-clamp-2 group-hover:text-white transition-colors">
                                        {item.query}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Credit */}
                <div className="mt-auto p-4 border-t border-white/10 text-center text-xs text-gray-500 whitespace-nowrap">
                    Data from last 24h
                </div>
            </div>

            {/* Collapsed State Icon (Separate from Toggle Button if desired, but here Toggle button acts as the icon) */}
        </div>
    );
};

export default TrendingSidebar;
