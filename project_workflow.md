# NOCAP AI - Visual Project Workflow

This document provides comprehensive visual diagrams showcasing how the NoCapAI fake news detection system works end-to-end.

---

## 🏗️ System Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        A[Web Browser - React App]
        B[Browser Extension]
    end
    
    subgraph "Frontend - React + Vite"
        C[App.jsx - Router]
        D[ChatBox Component]
        E[ImageUpload Component]
        F[TruthCard Generator]
    end
    
    subgraph "API Layer - FastAPI"
        G[ask Endpoint - Text Verification]
        H[analyze_image - OCR + Verification]
        I[ask_web - URL Scraping]
        J[duckduckgo_verify - Web Search]
        K[Rate Limiter - 10 req/min]
        L[CORS Middleware + PNA Headers]
    end
    
    subgraph "Core Services"
        M[RAG System]
        N[Database Manager]
        O[LLM Service - Gemini]
        P[DuckDuckGo Search]
        Q[EasyOCR Engine]
    end
    
    subgraph "Data Storage"
        R[(MongoDB)]
        S[(FAISS Vector Store)]
    end
    
    subgraph "External APIs"
        T[Google Gemini 1.5 Flash]
        U[SentenceTransformer Model]
    end
    
    A --> C
    B --> G
    C --> D
    C --> E
    C --> F
    
    D -->|POST request| G
    E -->|Upload| H
    D -->|URL mode| I
    D -->|Web verify| J
    
    G --> K
    H --> K
    I --> K
    J --> K
    K --> L
    
    L --> M
    L --> N
    L --> Q
    
    M --> O
    M --> S
    M --> U
    
    O --> T
    
    J --> P
    
    N --> R
    M --> R
    
    style A fill:#4CAF50
    style R fill:#FF9800
    style S fill:#2196F3
    style T fill:#9C27B0
    style U fill:#9C27B0
```

---

## 💬 User Verification Flow - Detailed

```mermaid
sequenceDiagram
    actor User
    participant UI as ChatBox (React)
    participant API as FastAPI Server
    participant DB as Database Manager
    participant RAG as RAG System
    participant FAISS as FAISS Index
    participant LLM as Gemini API
    participant Search as DuckDuckGo
    participant Mongo as MongoDB
    
    User->>UI: Types claim/question
    UI->>UI: Generate sessionId (UUID)
    UI->>API: POST /ask {question, session_id}
    
    API->>API: Rate limiting check (10/min)
    API->>API: Sanitize input
    
    rect rgb(50, 50, 100)
        Note over API,Mongo: STEP 1: Check Database Cache
        API->>DB: search_news_article(question)
        DB->>Mongo: Text search existing articles
        
        alt Cache Hit (Similar question found)
            Mongo-->>DB: Return cached answer
            DB-->>API: {answer, confidence: 95}
            API->>DB: save_chat_message()
            API-->>UI: {answer, source_type: "db", sources: []}
        end
    end
    
    rect rgb(100, 50, 50)
        Note over API,FAISS: STEP 2: RAG Vector Search
        API->>RAG: retrieve(question, source_type="web")
        RAG->>RAG: generate_embedding(question)
        RAG->>FAISS: Semantic similarity search (top_k=5)
        FAISS-->>RAG: Returns relevant chunks with scores
        
        alt High similarity chunks found (score < 100)
            RAG-->>API: {chunks, metadata, sources}
            API->>API: build_context_from_chunks()
            API->>LLM: Generate answer with context
            LLM-->>API: Generated answer
            API->>DB: save_chat_message()
            API-->>UI: {answer, source_type: "rag", sources: [...]}
        end
    end
    
    rect rgb(50, 100, 50)
        Note over API,Search: STEP 3: Live Web Search
        API->>Search: duckduckgo_search(question, max_results=5)
        Search-->>API: Returns search results with URLs
        
        loop For each result
            API->>API: scrape_url(url)
            API->>RAG: add_web_content(content, url)
            RAG->>FAISS: Store embeddings
            RAG->>Mongo: Store metadata
        end
        
        API->>RAG: retrieve(question, top_k=5)
        RAG-->>API: Fresh context from web
        
        API->>LLM: Generate verdict with evidence
        Note over LLM: Prompt: Analyze as FAKE/CREDIBLE/MISLEADING
        LLM-->>API: {verdict, explanation, confidence}
        
        API->>DB: save_chat_message()
        API->>DB: log_fake_news_detection()
        API-->>UI: {answer, sources, confidence}
    end
    
    UI->>UI: extractVerdict(answer)
    UI->>UI: Render MessageBubble with verdict badge
    UI-->>User: Display result + sources + confidence
    
    opt Generate Truth Card
        User->>UI: Click "Download Truth Card"
        UI->>UI: generateTruthCard() - HTML Canvas
        UI->>User: Download PNG image
    end
```

---

## 📸 Image Verification Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as ImageUpload Component
    participant API as /analyze_image
    participant OCR as EasyOCR Engine
    participant Verify as process_verification()
    participant LLM as Gemini API
    participant Mongo as MongoDB
    
    User->>UI: Upload/Drop image file
    UI->>UI: Preview image
    User->>UI: Click "Analyze Image"
    
    UI->>API: POST FormData {file, session_id}
    API->>API: Validate file type (jpg/png accepted)
    
    API->>OCR: easyocr.readtext(image_bytes)
    Note over OCR: Extract text from image
    OCR-->>API: Returns text blocks with confidence
    
    API->>API: Combine text blocks into full text
    
    alt Text extraction successful
        API->>Verify: process_verification(extracted_text)
        Note over Verify: Runs same multi-layer pipeline as text
        
        Verify->>Mongo: Check database cache
        Verify->>Verify: RAG retrieval if needed
        Verify->>LLM: Generate verdict
        
        Verify-->>API: {answer, confidence, sources}
        API-->>UI: Success response
        UI->>UI: Display verdict + extracted text
    else No text found
        API-->>UI: {error: "No text detected in image"}
        UI-->>User: Show error message
    end
```

---

## 🌐 URL Analysis Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as ChatBox
    participant API as /ask_web
    participant Scraper as BeautifulSoup
    participant RAG as RAG System
    participant LLM as Gemini API
    participant Mongo as MongoDB
    
    User->>UI: Paste URL in chat
    UI->>UI: Detect URL pattern
    UI->>UI: Switch to URL mode
    User->>UI: Optional question about article
    
    UI->>API: POST /ask_web {url, question, session_id}
    
    API->>Scraper: scrape_url(url)
    Scraper->>Scraper: requests.get(url)
    Scraper->>Scraper: BeautifulSoup parse HTML
    Scraper->>Scraper: Extract paragraphs + text
    Scraper-->>API: Returns cleaned article text
    
    API->>RAG: add_web_content(content, source_url)
    RAG->>RAG: chunk_text(content, chunk_size=400)
    
    loop For each chunk
        RAG->>RAG: generate_embedding(chunk)
        RAG->>RAG: Add to FAISS index
        RAG->>Mongo: save_web_embedding()
    end
    
    alt User asked specific question
        API->>RAG: retrieve(question, top_k=5)
        RAG-->>API: Relevant chunks
        API->>LLM: Answer question with context
    else No question - summarize article
        API->>LLM: Analyze article credibility
        Note over LLM: Assess bias, sources, claims
    end
    
    LLM-->>API: Analysis result
    API->>Mongo: save_chat_message()
    API-->>UI: {answer, sources: [{source_url}]}
    UI-->>User: Display analysis
```

---

## 🧩 Browser Extension Flow

```mermaid
sequenceDiagram
    actor User
    participant Page as Webpage
    participant Content as content.js
    participant Background as background.js (Service Worker)
    participant API as Backend /ask
    participant Shadow as Shadow DOM Modal
    
    User->>Page: Select text on any webpage
    User->>Page: Right-click → "Verify with NoCap AI"
    
    Page->>Background: chrome.contextMenus click event
    Background->>Background: Extract selected text
    Background->>Content: sendMessage {action: "SHOW_LOADING"}
    
    Content->>Shadow: createModal()
    Shadow->>Shadow: Inject styles (glassmorphism)
    Shadow-->>User: Show loading spinner overlay
    
    Background->>API: fetch("http://localhost:8000/ask")
    Note over Background,API: CORS + PNA headers included
    
    API->>API: Process verification pipeline
    API-->>Background: {answer, confidence, sources}
    
    Background->>Content: sendMessage {action: "SHOW_RESULT", data}
    
    Content->>Content: extractVerdict(answer)
    Content->>Shadow: updateModal(data)
    Shadow->>Shadow: Render verdict badge (FAKE/CREDIBLE)
    Shadow-->>User: Display result in overlay
    
    opt Close modal
        User->>Shadow: Click X button
        Shadow->>Shadow: Remove modalContainer
    end
```

---

## 🔍 RAG (Retrieval Augmented Generation) Pipeline

```mermaid
graph TD
    A[User Query] --> B{Check Database Cache}
    
    B -->|Hit| C[Return Cached Answer]
    B -->|Miss| D[Generate Query Embedding]
    
    C --> Z[Return Response]
    
    D --> E[SentenceTransformer: all-MiniLM-L6-v2]
    E --> F[384-dim Vector]
    
    F --> G[FAISS Similarity Search]
    G --> H[Top 5 Similar Chunks]
    
    H --> I{Score Threshold Check}
    I -->|Good Match < 100| J[Extract Context]
    I -->|No Match >= 100| K[Trigger Web Search]
    
    J --> L[Build Context String]
    K --> M[DuckDuckGo Search]
    
    M --> N[Scrape Top Results]
    N --> O[Add to RAG System]
    O --> P[Re-retrieve with Fresh Data]
    P --> L
    
    L --> Q[Load Chat History]
    Q --> R[Build Complete Prompt]
    
    R --> S[System Instructions + Context + History]
    S --> T[Gemini API Call]
    
    T --> U[Generate Answer]
    U --> V[Extract Verdict FAKE/CREDIBLE/MISLEADING]
    U --> W[Calculate Confidence 0-100]
    
    V --> X[Aggregate Response]
    W --> X
    
    X --> Y[Save to MongoDB]
    Y --> Z
    
    style A fill:#4CAF50
    style Z fill:#2196F3
    style G fill:#FF9800
    style T fill:#9C27B0
```

---

## 🗄️ Data Models & Storage

```mermaid
erDiagram
    MONGODB ||--o{ NEWS_ARTICLES : stores
    MONGODB ||--o{ SESSIONS : tracks
    MONGODB ||--o{ WEB_EMBEDDINGS : caches
    MONGODB ||--o{ PDF_EMBEDDINGS : caches
    MONGODB ||--o{ FAKE_NEWS_LOGS : logs
    
    FAISS ||--o{ WEB_VECTORS : indexes
    FAISS ||--o{ PDF_VECTORS : indexes
    
    NEWS_ARTICLES {
        ObjectId _id PK
        string session_id
        string question
        string answer
        string source_type
        float confidence
        array sources
        datetime timestamp
        object metadata
    }
    
    SESSIONS {
        string session_id PK
        datetime last_activity
        object context
        datetime created_at
    }
    
    WEB_EMBEDDINGS {
        ObjectId _id PK
        string content_hash
        string content
        string source_url
        string chunk_id
        int faiss_index
        datetime indexed_at
    }
    
    PDF_EMBEDDINGS {
        ObjectId _id PK
        string content_hash
        string content
        string pdf_name
        int page_number
        string chunk_id
        int faiss_index
        datetime indexed_at
    }
    
    FAKE_NEWS_LOGS {
        ObjectId _id PK
        string session_id
        string question
        string verdict
        float confidence
        array evidence
        datetime checked_at
    }
    
    WEB_VECTORS {
        int index PK
        array embedding
        object metadata
    }
    
    PDF_VECTORS {
        int index PK
        array embedding
        object metadata
    }
    
    WEB_VECTORS ||--|| WEB_EMBEDDINGS : references
    PDF_VECTORS ||--|| PDF_EMBEDDINGS : references
```

---

## 🎯 Component Interaction Map

```mermaid
graph LR
    subgraph "React Components"
        A[App.jsx<br/>Router + Layout]
        B[ChatBox.jsx<br/>Main Chat Interface]
        C[ImageUpload.jsx<br/>OCR Upload]
        D[TruthCardGenerator.jsx<br/>Social Media Export]
        E[MessageBubble.jsx<br/>Reply Display]
    end
    
    subgraph "Frontend Services"
        F[Voice Recognition<br/>Web Speech API]
        G[File Upload Handler]
    end
    
    subgraph "Backend Routes"
        H[ask<br/>Text Verification]
        I[analyze_image<br/>OCR Pipeline]
        J[ask_web<br/>URL Scraping]
        K[duckduckgo_verify<br/>Web Search]
        L[upload_pdf<br/>PDF Processing]
    end
    
    subgraph "Core Services"
        M[rag.py<br/>RAGSystem Class]
        N[db.py<br/>DatabaseManager Class]
        O[main.py<br/>process_verification()]
    end
    
    subgraph "External Tools"
        P[EasyOCR]
        Q[BeautifulSoup]
        R[DuckDuckGo Search]
    end
    
    A --> B
    A --> C
    A --> D
    B --> E
    
    B --> F
    C --> G
    
    B --> H
    C --> I
    B --> J
    B --> K
    
    I --> P
    J --> Q
    K --> R
    
    H --> O
    I --> O
    K --> O
    
    O --> M
    O --> N
    L --> M
    
    style M fill:#FF5722
    style N fill:#FF5722
    style O fill:#FF5722
```

---

## ⚡ Request/Response Flow Examples

### Example 1: "Is 5G causing COVID-19?"

```mermaid
graph LR
    A["User Claim:<br/>5G causes COVID-19"] --> B[Database: No cache]
    B --> C[RAG: No relevant chunks]
    C --> D["DuckDuckGo Search:<br/>5G COVID conspiracy"]
    D --> E["Scraped Sources:<br/>1. WHO fact-check<br/>2. Reuters debunk<br/>3. Scientific study"]
    E --> F["Add to FAISS:<br/>15 chunks indexed"]
    F --> G["Retrieve Context:<br/>Expert refutations"]
    G --> H["Gemini Analysis:<br/>Compare claim vs evidence"]
    H --> I["Response:<br/>VERDICT: FAKE<br/>Confidence: 92%<br/><br/>Sources: WHO, Reuters"]
    
    style A fill:#4CAF50
    style I fill:#EF4444
```

### Example 2: Screenshot Verification

```mermaid
graph LR
    A["User uploads:<br/>Screenshot of tweet"] --> B[EasyOCR Extraction]
    B --> C["Detected Text:<br/>Breaking: President resigns"]
    C --> D[Verify claim via pipeline]
    D --> E["Web Search:<br/>president resignation"]
    E --> F["Results:<br/>No credible sources found"]
    F --> G["Gemini Verdict:<br/>No evidence in news"]
    G --> H["Response:<br/>VERDICT: FAKE<br/>Confidence: 78%<br/><br/>No major outlets reporting"]
    
    style A fill:#FF9800
    style H fill:#EF4444
```

---

## 🔄 Caching & Performance Strategy

```mermaid
graph TD
    A[Request Arrives] --> B{Database Cache Hit?}
    
    B -->|Yes - Exact Match| C[Return Cached Answer<br/>~50ms]
    B -->|No| D{FAISS Vector Hit?}
    
    D -->|Yes - Score < 100| E[RAG Pipeline<br/>~500ms]
    D -->|No - Score >= 100| F[Web Search Pipeline<br/>~3000ms]
    
    E --> G[Generate with Context]
    F --> H[Scrape + Index + Generate]
    
    G --> I[Save to MongoDB]
    H --> J[Save to MongoDB + FAISS]
    
    I --> K[Return Response]
    J --> K
    C --> K
    
    style C fill:#4CAF50
    style E fill:#F59E0B
    style F fill:#EF4444
```

---

## 📊 Technology Stack Visualization

```mermaid
mindmap
  root((NoCapAI))
    Frontend
      React 19
      Vite Build Tool
      Tailwind CSS
      Framer Motion
      React Router
      React Icons
    Backend
      FastAPI
      Python 3.10+
      Uvicorn ASGI
      Pydantic Models
      SlowAPI Rate Limiting
    AI/ML
      Google Gemini 1.5 Flash
        Text Generation
        Claim Analysis
      SentenceTransformers
        all-MiniLM-L6-v2
        384-dim Embeddings
      EasyOCR
        Multi-language OCR
        Image Text Extraction
    Databases
      MongoDB
        Chat History
        Document Cache
        Embedding Metadata
        Session Management
      FAISS
        Vector Similarity Search
        Web Content Index
        PDF Content Index
    Web Tools
      DuckDuckGo Search
        Real-time Web Verification
      BeautifulSoup
        HTML Parsing
        Content Extraction
    Browser Extension
      Chrome Manifest V3
      Shadow DOM
      Content Scripts
      Background Service Worker
```

---

## 🎨 User Journey Map

### User Journey: Verifying a Claim

```mermaid
journey
    title User Checking Viral News Claim
    section Access
      Open NoCap AI website: 5: User
      See chat interface: 5: User
    section Interaction
      Type/Paste claim: 5: User
      Click Send or press Enter: 5: User
      Watch loading animation: 3: User, System
      See verdict appear: 4: User, System
    section Result
      Read verdict with explanation: 5: User
      Check confidence score: 5: User
      Click source links for evidence: 5: User
      Download Truth Card for sharing: 5: User
```

### Extension Journey: Quick Text Verification

```mermaid
journey
    title Verifying Text While Browsing
    section Discovery
      Browse social media/news: 5: User
      See suspicious claim: 3: User
    section Verification
      Select text: 5: User
      Right-click menu: 5: User
      Click "Verify with NoCap AI": 5: User
      Wait for overlay: 3: User, Extension
    section Result
      Read verdict in popup: 5: User
      See confidence score: 5: User
      Close or continue browsing: 5: User
```

---

## 🚀 Deployment Architecture

```mermaid
graph TB
    subgraph "Client Side"
        A[Desktop Browser]
        B[Mobile Browser]
        C[Browser Extension]
    end
    
    subgraph "Frontend Hosting"
        D[Vite Production Build<br/>Optimized React SPA]
        E[Static Assets<br/>CSS + JS + Images]
    end
    
    subgraph "Backend Server"
        F[FastAPI Application<br/>uvicorn --host 0.0.0.0]
        G[Rate Limiter<br/>10 req/min per IP]
        H[CORS + PNA Handler]
    end
    
    subgraph "Data Layer"
        I[(MongoDB Atlas<br/>Cloud Database)]
        J[(FAISS Index<br/>Local Disk Storage)]
    end
    
    subgraph "ML Layer"
        K[SentenceTransformer<br/>Local Model Files]
        L[EasyOCR<br/>Local OCR Engine]
    end
    
    subgraph "External Services"
        M[Google Gemini API<br/>Cloud LLM]
        N[DuckDuckGo Search<br/>Public API]
    end
    
    A --> D
    B --> D
    C --> F
    D --> E
    E --> F
    
    F --> G
    G --> H
    H --> I
    H --> J
    
    F --> K
    F --> L
    F --> M
    F --> N
    
    style D fill:#4CAF50
    style F fill:#2196F3
    style I fill:#FF9800
    style M fill:#9C27B0
```

---

## 📈 Performance Metrics Flow

```mermaid
graph LR
    A[Request Received] --> B[Rate Limiter Check<br/>~5ms]
    B --> C{Route Detection}
    
    C -->|Cached| D[MongoDB Lookup<br/>~50ms]
    C -->|RAG| E[Vector Search<br/>~200ms]
    C -->|Web| F[DuckDuckGo + Scrape<br/>~2000ms]
    
    D --> G[Total: ~55ms]
    
    E --> H[Embedding Generation<br/>~100ms]
    H --> I[FAISS Query<br/>~50ms]
    I --> J[LLM Call<br/>~800ms]
    J --> K[Total: ~1150ms]
    
    F --> L[Search Results<br/>~500ms]
    L --> M[Scrape 5 URLs<br/>~1000ms]
    M --> N[Index Chunks<br/>~300ms]
    N --> O[LLM Call<br/>~800ms]
    O --> P[Total: ~2600ms]
    
    style G fill:#4CAF50
    style K fill:#F59E0B
    style P fill:#EF4444
```

---

## 🔐 Security & Rate Limiting Flow

```mermaid
sequenceDiagram
    participant User
    participant CORS
    participant RateLimit
    participant API
    participant Sanitizer
    participant Services
    
    User->>CORS: HTTP Request
    CORS->>CORS: Check Origin Header
    CORS->>CORS: Add PNA Header (allow="(http://localhost:8000)")
    
    CORS->>RateLimit: Forward Request
    RateLimit->>RateLimit: Check IP Address
    RateLimit->>RateLimit: Count requests in window
    
    alt Rate Limit Exceeded (>10/min)
        RateLimit-->>User: 429 Too Many Requests
    else Within Limit
        RateLimit->>API: Process Request
        API->>Sanitizer: sanitize_input(text)
        Sanitizer->>Sanitizer: Remove HTML tags
        Sanitizer->>Sanitizer: Limit to 2000 chars
        Sanitizer-->>API: Clean text
        
        API->>Services: Execute Verification
        Services-->>API: Result
        API-->>User: 200 OK + Response
    end
```

---

## 🎯 Verdict Classification Logic

```mermaid
graph TD
    A[LLM Response] --> B{Parse Answer Text}
    
    B --> C{Contains 'FAKE'?}
    C -->|Yes| D[Verdict: FAKE<br/>Color: Red<br/>Icon: ⚠️]
    
    C -->|No| E{Contains 'CREDIBLE' or 'TRUE'?}
    E -->|Yes| F[Verdict: CREDIBLE<br/>Color: Green<br/>Icon: ✓]
    
    E -->|No| G{Contains 'MISLEADING'?}
    G -->|Yes| H[Verdict: MISLEADING<br/>Color: Yellow<br/>Icon: ⚡]
    
    G -->|No| I[Verdict: UNCERTAIN<br/>Color: Gray<br/>Icon: ?]
    
    D --> J[Display Badge]
    F --> J
    H --> J
    I --> J
    
    J --> K{Confidence Score}
    K -->|≥ 80| L[High Confidence Badge]
    K -->|50-79| M[Medium Confidence Badge]
    K -->|< 50| N[Low Confidence Badge]
```

---

## 📝 Multi-Layer Verification Pipeline

```mermaid
graph TD
    Start[User Query] --> Layer1{Layer 1: Database Cache}
    
    Layer1 -->|Cache Hit| Return1[Return Cached Result<br/>Source: Database<br/>Confidence: 95%]
    Layer1 -->|Cache Miss| Layer2{Layer 2: FAISS RAG Search}
    
    Layer2 -->|Relevant Chunks Found| Context2[Build Context from Chunks]
    Layer2 -->|No Relevant Data| Layer3{Layer 3: Web Search}
    
    Context2 --> LLM2[Gemini: Generate with Context<br/>Confidence: 70-85%]
    LLM2 --> Return2[Return RAG Result]
    
    Layer3 --> Search3[DuckDuckGo Search<br/>Fetch top 5 results]
    Search3 --> Scrape3[Scrape \u0026 Index Content]
    Scrape3 --> Fresh3[Fresh RAG Retrieval]
    Fresh3 --> LLM3[Gemini: Analyze Evidence<br/>Confidence: 60-80%]
    LLM3 --> Return3[Return Web-Verified Result]
    
    Return1 --> End[Response to User]
    Return2 --> End
    Return3 --> End
    
    style Layer1 fill:#10B981
    style Layer2 fill:#F59E0B
    style Layer3 fill:#EF4444
    style End fill:#3B82F6
```

---

