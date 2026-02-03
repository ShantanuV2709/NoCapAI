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
    FiX
} from 'react-icons/fi';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';

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
                // Image Analysis
                const formData = new FormData();
                formData.append('file', selectedFile);
                formData.append('session_id', sessionId);

                response = await axios.post(`${API_BASE_URL}/analyze_image`, formData, {
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
                question: response.data.question || userInput || "Image Analysis",
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
                            {!showResult ? (
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
                                            className="w-full bg-transparent text-white placeholder-gray-400 p-6 pr-16 resize-none focus:outline-none min-h-[120px] max-h-[400px]"
                                            rows={3}
                                            style={{ display: previewUrl ? 'none' : 'block' }}
                                        />

                                        {/* Image Preview */}
                                        {previewUrl && (
                                            <div className="p-6 relative">
                                                <div className="relative inline-block">
                                                    <img src={previewUrl} alt="Preview" className="max-h-60 rounded-xl border border-white/20" />
                                                    <button
                                                        onClick={removeImage}
                                                        className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white shadow-lg hover:bg-red-600 transition"
                                                    >
                                                        <FiX size={12} />
                                                    </button>
                                                </div>
                                                <p className="text-sm text-gray-400 mt-2">Image selected. Click Analyze.</p>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="absolute bottom-4 left-4">
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                onChange={handleFileChange}
                                                accept="image/*"
                                                className="hidden"
                                            />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="p-2 text-gray-400 hover:text-white transition-colors hover:bg-white/10 rounded-lg"
                                                title="Upload Image"
                                            >
                                                <FiCamera size={24} />
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
                                        <div className={`px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md border ${currentResult?.verdict === 'FAKE' ? 'bg-red-500/30 text-red-300 border-red-500/50' :
                                            currentResult?.verdict === 'MISLEADING' ? 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50' :
                                                currentResult?.verdict === 'CREDIBLE' ? 'bg-green-500/30 text-green-300 border-green-500/50' :
                                                    'bg-gray-500/30 text-gray-300 border-gray-500/50'
                                            }`}>
                                            {currentResult?.verdict} ({currentResult?.confidence}%)
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
        </div>
    );
};

export default ChatBox;
