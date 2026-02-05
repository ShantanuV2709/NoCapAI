import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FiSend,
    FiMenu,
    FiPlus,
    FiUser,
    FiMessageSquare,
    FiCamera,
    FiX,
    FiShare2,
    FiDownload,
    FiFile
} from 'react-icons/fi';
import html2canvas from 'html2canvas';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import SkeletonLoader from './SkeletonLoader';

const API_BASE_URL = 'http://localhost:8000';

const ChatBox = () => {
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState('');
    const [error, setError] = useState('');
    const [history, setHistory] = useState([]);
    const [currentResult, setCurrentResult] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);


    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);
    const pdfInputRef = useRef(null);
    const cardRef = useRef(null);

    // Extract verdict from AI response
    const extractVerdict = (answer) => {
        const match = answer.match(/VERDICT:\s*(FAKE|MISLEADING|CREDIBLE)/i);
        return match ? match[1].toUpperCase() : 'UNKNOWN';
    };

    // Load history from backend
    const loadHistory = async (sessionId) => {
        try {
            console.log('Loading history for session:', sessionId);
            const response = await axios.get(`${API_BASE_URL}/session/${sessionId}/history`);
            console.log('History response:', response.data);
            const backendHistory = response.data.history.map(item => ({
                id: item._id,
                question: item.question,
                answer: item.answer,
                verdict: extractVerdict(item.answer),
                confidence: item.confidence,
                sourceType: item.source_type,
                timestamp: item.timestamp
            }));
            console.log('Processed history:', backendHistory);
            setHistory(backendHistory);
        } catch (err) {
            console.error('Failed to load history from backend:', err);
            // Fall back to localStorage if backend fails
            const savedHistory = localStorage.getItem('analysis_history');
            if (savedHistory) {
                setHistory(JSON.parse(savedHistory));
            }
        }
    };

    // Initialize session ID on mount
    useEffect(() => {
        let storedSessionId = localStorage.getItem('fake_news_session_id');

        if (!storedSessionId) {
            storedSessionId = uuidv4();
            localStorage.setItem('fake_news_session_id', storedSessionId);
        }

        setSessionId(storedSessionId);

        // Load history from backend
        loadHistory(storedSessionId);
    }, []);


    // Detect if input contains URL
    const hasURL = (text) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return urlRegex.test(text);
    };

    // Handle textarea auto-resize
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [inputValue]);

    // Handle File Selection
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setInputValue(''); // Clear text when image selected
        }
    };

    const removeImage = () => {
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Generate and Download Truth Card
    const handleDownloadCard = async () => {
        if (!cardRef.current) return;

        try {
            const canvas = await html2canvas(cardRef.current, {
                backgroundColor: null,
                scale: 2, // Retina quality
                logging: false,
                useCORS: true // For images
            });

            // Create filename from question
            const slug = currentResult?.question
                ? currentResult.question.substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase()
                : 'verdict';

            const link = document.createElement('a');
            link.download = `NoCap_${slug}_${currentResult?.verdict}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error("Card generation failed:", err);
            setError("Failed to generate card. Please try again.");
        }
    };

    // Send message (Text or Image)
    const handleAnalyze = async () => {
        if ((!inputValue.trim() && !selectedFile) || isLoading) return;

        setIsLoading(true);
        setError('');
        setShowResult(false);
        const userInput = inputValue.trim();

        try {
            let response;

            if (selectedFile) {
                // Image or PDF Analysis
                const formData = new FormData();
                formData.append('file', selectedFile);
                formData.append('session_id', sessionId);

                const endpoint = selectedFile.type === 'application/pdf' ? '/analyze_pdf' : '/analyze_image';

                response = await axios.post(`${API_BASE_URL}${endpoint}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                // Clear selection after upload
                // removeImage(); 
            } else if (hasURL(userInput)) {
                // ... URL Logic ...
                const urlMatch = userInput.match(/(https?:\/\/[^\s]+)/);
                const url = urlMatch ? urlMatch[0] : '';

                response = await axios.post(`${API_BASE_URL}/ask_web`, {
                    url: url,
                    question: userInput.replace(url, '').trim() || 'Analyze this article',
                    session_id: sessionId
                });
            } else {
                // ... Text Logic ...
                response = await axios.post(`${API_BASE_URL}/ask`, {
                    question: userInput,
                    session_id: sessionId
                });
            }

            // Common Result Handling
            const result = {
                id: uuidv4(),
                question: response.data.question || userInput || (selectedFile ? selectedFile.name : "Analysis"),
                answer: response.data.answer,
                verdict: extractVerdict(response.data.answer),
                confidence: response.data.confidence,
                sourceType: response.data.source_type,
                timestamp: new Date().toISOString()
            };

            setCurrentResult(result);
            addToHistory(result);
            setShowResult(true);

            // Clean up inputs if successful
            setInputValue('');
            removeImage();

        } catch (err) {
            console.error('Error analyzing:', err);
            setError(err.response?.data?.error || err.response?.data?.detail || 'Failed to analyze. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const addToHistory = (result) => {
        const newHistory = [result, ...history].slice(0, 20);
        setHistory(newHistory);
        localStorage.setItem('analysis_history', JSON.stringify(newHistory));
    };

    const handleNewAnalysis = () => {
        setCurrentResult(null);
        setShowResult(false);
        setInputValue('');
        setError('');
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAnalyze();
        }
    };

    return (
        <div className="flex h-screen text-white overflow-hidden">{/* Removed bg-black to show gradient blobs */}
            {/* Left Sidebar - Collapsible with Glassmorphism */}
            <div
                className={`bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-0'
                    } overflow-hidden`}
            >
                {/* History Header */}
                <div className="p-4 border-b border-white/10">
                    <h2 className="text-lg font-semibold mb-4">History</h2>
                    <button
                        onClick={handleNewAnalysis}
                        className="w-full bg-white/10 backdrop-blur-md hover:bg-white/20 text-white py-2 px-4 rounded-lg flex items-center justify-center space-x-2 transition-all border border-white/10"
                    >
                        <FiPlus size={16} />
                        <span>New Analysis</span>
                    </button>
                </div>

                {/* Recent Checks */}
                <div className="flex-1 overflow-y-auto">
                    <div className="p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">RECENT CHECKS</p>
                        <div className="space-y-2">
                            {history.length === 0 ? (
                                <p className="text-sm text-gray-500 italic text-center py-4">
                                    No analysis history yet.<br />Submit a query to get started!
                                </p>
                            ) : (
                                history.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            setCurrentResult(item);
                                            setShowResult(true);
                                        }}
                                        className="w-full text-left p-3 rounded-lg bg-white/5 backdrop-blur-md hover:bg-white/10 transition-all group border border-white/10"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start space-x-2 flex-1 min-w-0">
                                                <FiMessageSquare size={14} className="mt-1 flex-shrink-0 text-gray-400" />
                                                <p className="text-sm text-gray-300 truncate">{item.question.substring(0, 40)}...</p>
                                            </div>
                                        </div>
                                        <div className="mt-2 ml-6">
                                            <span className={`text-xs px-2 py-0.5 rounded backdrop-blur-sm ${item.verdict === 'FAKE' ? 'bg-red-500/30 text-red-300 border border-red-500/50' :
                                                item.verdict === 'MISLEADING' ? 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/50' :
                                                    item.verdict === 'CREDIBLE' ? 'bg-green-500/30 text-green-300 border border-green-500/50' :
                                                        'bg-gray-500/30 text-gray-300 border border-gray-500/50'
                                                }`}>
                                                {item.verdict}
                                            </span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col">
                {/* Top Bar with Glassmorphism */}
                <div className="h-16 border-b border-white/10 bg-black/40 backdrop-blur-xl flex items-center justify-between px-6">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-all backdrop-blur-md border border-white/10"
                    >
                        <FiMenu size={20} />
                    </button>
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
                        <FiUser size={20} />
                    </div>
                </div>

                {/* Center Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                    <div className="w-full max-w-6xl mx-auto min-h-full flex flex-col justify-center"> {/* Increased max-width and added horizontal padding */}
                        <AnimatePresence mode="wait">
                            {!showResult && !isLoading ? (
                                <motion.div
                                    key="input"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="text-center"
                                >
                                    {/* Logo */}
                                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-2xl">
                                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>

                                    {/* Title */}
                                    <h1 className="text-4xl font-bold mb-3">NoCap AI</h1>
                                    <p className="text-gray-300 mb-8">
                                        Paste an article below to verify its credibility via AI & Web Search.
                                    </p>

                                    {/* Input Area - Glassmorphism */}
                                    <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                                        <textarea
                                            ref={textareaRef}
                                            value={inputValue}
                                            onChange={(e) => setInputValue(e.target.value)}
                                            onKeyPress={handleKeyPress}
                                            placeholder="Paste article text here..."
                                            disabled={isLoading}
                                            className="w-full bg-transparent text-white placeholder-gray-400 p-6 pr-16 pb-16 resize-none focus:outline-none min-h-[120px] max-h-[400px]"
                                            rows={3}
                                            style={{ display: previewUrl ? 'none' : 'block' }}
                                        />

                                        {/* Image Preview */}
                                        {/* File Preview (Compact Pill) */}
                                        {selectedFile && (
                                            <div className="absolute top-4 left-4 right-16 flex flex-wrap gap-2 pointer-events-none">
                                                <div className="pointer-events-auto flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-full text-sm text-white shadow-lg animate-fade-in">
                                                    {selectedFile.type === 'application/pdf' ? (
                                                        <FiFile className="text-pink-400" />
                                                    ) : (
                                                        <img src={previewUrl} alt="Thumbnail" className="w-6 h-6 rounded object-cover border border-white/30" />
                                                    )}
                                                    <span className="truncate max-w-[150px]">{selectedFile.name}</span>
                                                    <button
                                                        onClick={removeImage}
                                                        className="ml-1 hover:text-red-400 transition-colors p-0.5 rounded-full hover:bg-white/10"
                                                    >
                                                        <FiX size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Action Bar (Glassmorphic Pill) */}
                                        <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-white/5 border border-white/10 p-1.5 rounded-xl backdrop-blur-sm transition-all hover:bg-white/10">
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                onChange={handleFileChange}
                                                accept="image/*"
                                                className="hidden"
                                            />
                                            <input
                                                type="file"
                                                ref={pdfInputRef}
                                                onChange={handleFileChange}
                                                accept="application/pdf"
                                                className="hidden"
                                            />

                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all group relative"
                                                title="Upload Image"
                                            >
                                                <FiCamera size={20} />
                                                <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap">Upload Image</span>
                                            </button>

                                            <div className="w-px h-6 bg-white/10" /> {/* Divider */}

                                            <button
                                                onClick={() => pdfInputRef.current?.click()}
                                                className="p-2 text-gray-400 hover:text-pink-400 hover:bg-white/10 rounded-lg transition-all group relative"
                                                title="Upload PDF"
                                            >
                                                <FiFile size={20} />
                                                <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap">Upload Document</span>
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleAnalyze}
                                            disabled={(!inputValue.trim() && !selectedFile) || isLoading}
                                            className="absolute bottom-4 right-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl"
                                        >
                                            {isLoading ? (
                                                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                                            ) : (
                                                <FiSend size={20} />
                                            )}
                                        </button>
                                    </div>

                                    {/* Tip */}
                                    <p className="text-sm text-gray-400 mt-4">
                                        Tip: Press Enter to analyze immediately.
                                    </p>

                                    {/* Error Message */}
                                    {error && (
                                        <div className="mt-4 bg-red-500/20 backdrop-blur-md border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
                                            {error}
                                        </div>
                                    )}
                                </motion.div>
                            ) : isLoading ? (
                                <motion.div
                                    key="loading"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <SkeletonLoader />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="result"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="space-y-6"
                                >
                                    {/* Result Header */}
                                    <div className="flex flex-wrap gap-4 items-center justify-between">
                                        <h2 className="text-2xl font-bold">Analysis Result</h2>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleDownloadCard}
                                                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition text-sm text-gray-200"
                                                title="Download Truth Card"
                                            >
                                                <FiShare2 /> Share
                                            </button>
                                            <div className={`px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md border ${currentResult?.verdict === 'FAKE' ? 'bg-red-500/30 text-red-300 border-red-500/50' :
                                                currentResult?.verdict === 'MISLEADING' ? 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50' :
                                                    currentResult?.verdict === 'CREDIBLE' ? 'bg-green-500/30 text-green-300 border-green-500/50' :
                                                        'bg-gray-500/30 text-gray-300 border-gray-500/50'
                                                }`}>
                                                {currentResult?.verdict} ({currentResult?.confidence}%)
                                            </div>
                                        </div>
                                    </div>

                                    {/* Original Question - Glassmorphism */}
                                    <div className="bg-white/5 backdrop-blur-xl rounded-xl p-6 border border-white/10 shadow-xl">
                                        <p className="text-sm text-gray-400 mb-2">Your Question:</p>
                                        <p className="text-gray-200">{currentResult?.question}</p>
                                    </div>

                                    {/* Answer - Glassmorphism */}
                                    <div className="bg-white/5 backdrop-blur-xl rounded-xl p-6 border border-white/10 shadow-xl">
                                        <div className="prose prose-invert max-w-none">
                                            <ReactMarkdown>{currentResult?.answer}</ReactMarkdown>
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <button
                                        onClick={handleNewAnalysis}
                                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white py-3 px-6 rounded-xl font-medium transition-all duration-300 shadow-lg hover:shadow-xl"
                                    >
                                        New Analysis
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
            {/* Hidden Truth Card for Export */}
            {currentResult && (
                <div style={{ position: 'fixed', top: '-3000px', left: '-3000px' }}>
                    <div
                        ref={cardRef}
                        className={`w-[1080px] h-[1080px] p-16 flex flex-col justify-between relative overflow-hidden font-sans
                            ${currentResult.verdict === 'FAKE' ? 'bg-gradient-to-br from-red-950 via-gray-900 to-black' :
                                currentResult.verdict === 'CREDIBLE' ? 'bg-gradient-to-br from-green-950 via-gray-900 to-black' :
                                    'bg-gradient-to-br from-yellow-950 via-gray-900 to-black'}
                        `}
                    >
                        {/* Background Elements */}
                        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white opacity-[0.03] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
                        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-white opacity-[0.03] rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2"></div>

                        {/* Decor */}
                        <div className="absolute top-8 right-8 text-white/20 text-xl font-mono tracking-widest">VERIFIED</div>

                        {/* Content */}
                        <div className="z-10">
                            <h2 className="text-5xl font-bold text-white mb-12 flex items-center gap-4">
                                <img src="/logo.png" alt="NoCap Logo" className="w-20 h-20 rounded-full border-4 border-white/10 shadow-lg" />
                                NoCap AI
                            </h2>

                            <div className="bg-white/10 backdrop-blur-xl border border-white/10 p-12 rounded-3xl mb-12 shadow-2xl">
                                <p className="text-white/60 text-3xl mb-6 font-mono tracking-wide">CLAIM:</p>
                                <p className="text-white text-4xl font-medium leading-normal">
                                    "{currentResult.question}"
                                </p>
                            </div>
                        </div>

                        {/* Verdict Stamp */}
                        <div className="z-10 text-center relative mb-12 flex flex-col items-center">
                            <div className={`
                                inline-block text-7xl font-black tracking-widest px-12 py-6 border-[10px] rounded-3xl transform -rotate-3 shadow-[0_0_100px_rgba(0,0,0,0.5)] backdrop-blur-sm uppercase
                                ${currentResult.verdict === 'FAKE' ? 'text-red-500 border-red-500 shadow-red-500/20' :
                                    currentResult.verdict === 'CREDIBLE' ? 'text-green-500 border-green-500 shadow-green-500/20' :
                                        'text-yellow-500 border-yellow-500 shadow-yellow-500/20'}
                            `}>
                                {currentResult.verdict}
                            </div>
                            <p className="text-white/40 mt-8 text-2xl font-mono uppercase tracking-[0.5em]">
                                Confidence: {currentResult.confidence}%
                            </p>
                        </div>

                        {/* Footer */}
                        <div className="z-10 flex justify-between items-center border-t border-white/10 pt-8">
                            <p className="text-white/40 text-2xl">nocap-ai.com</p>
                            <p className="text-white/40 text-2xl">{new Date().toLocaleDateString()}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatBox;
