import React from 'react';

const SkeletonLoader = () => {
    return (
        <div className="w-full max-w-2xl mx-auto mt-6 bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 animate-pulse">
            {/* Verdict Header Placeholder */}
            <div className="flex items-center justify-between mb-6">
                <div className="h-8 bg-white/10 rounded-md w-1/4"></div>
                <div className="h-6 bg-white/5 rounded-full w-12"></div>
            </div>

            {/* Content Text Lines */}
            <div className="space-y-4 mb-8">
                <div className="h-4 bg-white/10 rounded w-full"></div>
                <div className="h-4 bg-white/10 rounded w-[95%]"></div>
                <div className="h-4 bg-white/10 rounded w-[90%]"></div>
                <div className="h-4 bg-white/5 rounded w-[80%]"></div>
            </div>

            {/* Source/Footer Area */}
            <div className="flex justify-between items-center pt-4 border-t border-white/5">
                <div className="flex space-x-2">
                    <div className="h-8 w-24 bg-white/10 rounded-full"></div>
                    <div className="h-8 w-24 bg-white/5 rounded-full"></div>
                </div>
                <div className="h-4 w-32 bg-white/10 rounded"></div>
            </div>
        </div>
    );
};

export default SkeletonLoader;
