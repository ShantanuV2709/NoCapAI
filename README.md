<div align="center">

  <img src="logo.png" alt="NoCap AI Logo" width="200" />

  # NoCap AI
  
  **No Cap. Just Facts.**
  
  [![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-blue?style=for-the-badge&logo=react)](https://reactjs.org/)
  [![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
  [![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
  [![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?style=for-the-badge&logo=mongodb)](https://www.mongodb.com/)

  <p align="center">
    <b>An advanced AI-powered system that verifies news, claims, and images using a multi-layered verification pipeline (Database → RAG → Web Search → LLM).</b>
  </p>
</div>

---

> Want to see how everything works? Check out the [Visual Project Workflow](project_workflow.md) with 12+ interactive architecture diagrams and data flow visualizations.

---

## 🚀 Overview

**NoCap AI** is a state-of-the-art fake news detection solution designed to bring transparency to information. It replaces uncertainty with evidence-backed verdicts. Whether you are verifying a viral tweet, checking a news article, or analyzing a screenshot, NoCap AI provides instant, explainable credibility scores using Google's Gemini AI and real-time DuckDuckGo search.

## ✨ Key Features

### 🛡️ Multi-Source Verification
- **Hybrid Pipeline:** Intelligent routing through Database Cache → Vector Search (RAG) → Live Web Search → LLM Analysis.
- **Real-Time Fact Checking:** Cross-references claims with trusted news sources instantly.

### 📸 Image Analysis
- **OCR Integration:** Extract text from screenshots, memes, or scanned documents using simple drag-and-drop.
- **Visual Verification:** Verifies the text content found within images against reputable sources.

### 🧠 Explainable AI
- **Transparent Verdicts:** Returns clear labels (`FAKE`, `CREDIBLE`, `MISLEADING`) with detailed explanations.
- **Confidence Scores:** Visual badges indicating the AI's certainty level (High/Medium/Low).
- **Source Citation:** Links directly to the articles and sources used to form the verdict.

### 💬 Conversational Memory
- **Smart Context:** Remembers previous questions for follow-ups (e.g., "Is it true?" -> "Who said that?").
- **Voice Input:** Speak your claims directly using the microphone integration.

### � Truth Card Generator
- **Shareable Images:** Generate stunning 1080x1080 social media cards of verification results.
- **Smart Filenames:** Downloads as `NoCap_[claim]_[verdict].png` for easy organization.
- **Premium Design:** Dynamic gradients, glassmorphism effects, and professional typography.

### 🧩 Browser Extension
- **Right-Click Verification:** Verify selected text on any webpage instantly.
- **Zero Friction:** No need to switch tabs or copy-paste.
- **Works Everywhere:** Twitter, news sites, forums - select, right-click, verify!

### �📱 Modern & Responsive UI
- **Glassmorphism Design:** A premium, modern interface with smooth animations and dark mode aesthetics.
- **URL Auto-Detection:** Automatically switches mode when a link is pasted to analyze the article content.

---


## 🛠️ Tech Stack

- **Frontend:** React.js, Vite, Tailwind CSS, Framer Motion (Animations), React Icons
- **Backend:** Python, FastAPI, LangChain, Google Gemini 1.5 Flash
- **Database:** MongoDB (History & Logs), FAISS (Vector Store for RAG)
- **Tools:** EasyOCR (Image Processing), BeautifulSoup (Web Scraping), DuckDuckGo Search

---

## ⚙️ Installation & Setup

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- MongoDB (Local or Atlas)
- Google Gemini API Key

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/NoCapAI.git
cd NoCapAI
```

### 2. Backend Setup
Navigate to the backend folder and install dependencies:
```bash
cd backend
# Create virtual environment
python -m venv venv
# Activate virtual environment
# Windows:
.\venv\Scripts\activate
# Mac/Linux:
# source venv/bin/activate

# Install requirements
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload
```
The backend API will run at `http://localhost:8000`.

### 3. Frontend Setup
Open a new terminal, navigate to the frontend folder:
```bash
cd frontend
# Install dependencies
npm install

# Run the development server
npm run dev
```
The application will be accessible at `http://localhost:5173`.

### 4. Browser Extension (Optional)
To use the Chrome/Edge extension:
```bash
1. Open chrome://extensions
2. Enable "Developer Mode"
3. Click "Load Unpacked"
4. Select the NoCapAI/extension folder
```
Then right-click selected text on any webpage and choose "Verify with NoCap AI"!

---

## 📁 Project Structure

```
NoCapAI/
├── backend/            # FastAPI Backend
│   ├── faiss_index/    # Vector Store
│   ├── main.py         # App Entry Point & Logic
│   ├── db.py           # MongoDB Integration
│   ├── rag.py          # RAG & Embeddings System
│   └── requirements.txt
│
├── frontend/           # React Frontend
│   ├── src/
│   │   ├── components/ # ChatBox & UI Components
│   │   ├── App.jsx     # Main Layout
│   │   └── main.jsx    # Entry Point
│   ├── index.css       # Tailwind & Glassmorphism Styles
│   └── vite.config.js
│
├── extension/          # Browser Extension
│   ├── manifest.json   # Extension Config
│   ├── background.js   # Service Worker
│   ├── content.js      # Overlay UI
│   └── popup.html      # Extension Popup
│
└── README.md           # Project Documentation
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

<div align="center">
  <small>&copy; 2026 NoCap AI.</small>
</div>
