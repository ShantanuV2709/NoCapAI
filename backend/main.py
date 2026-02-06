"""
Main FastAPI Application - Fake News Detection AI System
Provides endpoints for fake news detection, web verification, PDF processing, and DuckDuckGo search
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import os
import uuid
import re
from datetime import datetime
import asyncio
import time
import hashlib

# Caching Configuration
RESPONSE_CACHE = {}
CACHE_TTL = 3600  # 1 hour in seconds

# LangChain and LLM imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain

# Web scraping
import requests
from bs4 import BeautifulSoup

# PDF processing
import PyPDF2
import io

# DuckDuckGo search
from duckduckgo_search import DDGS

# EasyOCR
import easyocr
import numpy as np
from PIL import Image

# Initialize EasyOCR Reader globally
import torch
print("Initializing EasyOCR...")
try:
    use_gpu = torch.cuda.is_available()
    print(f"EasyOCR GPU Mode: {'ENABLED 🚀' if use_gpu else 'DISABLED 🐢'}")
    ocr_reader = easyocr.Reader(['en'], gpu=use_gpu)
    print("EasyOCR initialized successfully.")
except Exception as e:
    print(f"⚠️ EasyOCR initialization failed: {e}")
    ocr_reader = None

# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Internal imports
from db import db_manager
from rag import rag_system

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Google Generative AI
import google.generativeai as genai

# ==================== CONFIGURATION ====================

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("❌ GOOGLE_API_KEY not found in environment variables")

# Configure Google Generative AI
genai.configure(api_key=GOOGLE_API_KEY)

# Initialize Gemini model directly
# Using gemini-flash-latest as generic fallback for availability
llm_model = genai.GenerativeModel('models/gemini-flash-latest')

def llm_invoke(prompt: str) -> str:
    """Helper function to invoke Gemini model with error handling"""
    try:
        response = llm_model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"❌ Gemini Error: {e}")
        if "429" in str(e):
            return "VERDICT: UNKNOWN\n\nError: AI rate limit exceeded. Please try again in a minute."
        return f"VERDICT: UNKNOWN\n\nError generating response: {str(e)}"

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

# Initialize FastAPI app
app = FastAPI(
    title="NoCap AI API",
    description="AI-powered fake news detection with RAG, web verification, and explainable responses",
    version="1.0.0"
)

# Force Backend Reload for .env update

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Hardcode permissive CORS for debugging
CORS_ORIGINS = ["*"]

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_pna_header(request: Request, call_next):
    # Handle preflight requests explicitly if needed by some browsers
    if request.method == "OPTIONS":
        response = JSONResponse(content={"message": "OK"})
        # Reflect origin or default to *
        origin = request.headers.get("origin", "*")
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# ==================== REQUEST/RESPONSE MODELS ====================

class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000, description="The question or claim to check")
    session_id: Optional[str] = Field(None, description="Session ID for context")

class AskWebRequest(BaseModel):
    url: Optional[str] = Field(None, description="URL to scrape and analyze")
    question: Optional[str] = Field(None, description="Question about the URL content")
    session_id: Optional[str] = Field(None, description="Session ID for context")

class DuckDuckGoRequest(BaseModel):
    claim: str = Field(..., min_length=1, max_length=500, description="Claim to verify")
    session_id: Optional[str] = Field(None, description="Session ID")

class AskResponse(BaseModel):
    answer: str
    confidence: float
    source_type: str
    sources: List[Dict[str, Any]]
    session_id: str
    timestamp: str

# ==================== UTILITY FUNCTIONS ====================

def sanitize_input(text: str) -> str:
    """Remove HTML tags and limit length"""
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Limit length
    text = text[:2000]
    return text.strip()

def generate_session_id() -> str:
    """Generate a unique session ID"""
    return str(uuid.uuid4())

def calculate_confidence(source_type: str, evidence_count: int) -> float:
    """
    Calculate confidence score based on source and evidence
    
    Args:
        source_type: db/web/rag/llm
        evidence_count: Number of supporting sources
    
    Returns:
        Confidence score (0-100)
    """
    base_scores = {
        "db": 90,
        "web": 75,
        "rag": 70,
        "llm": 50
    }
    
    base = base_scores.get(source_type, 50)
    bonus = min(evidence_count * 5, 20)  # Up to 20 point bonus
    
    return min(base + bonus, 100)

# ==================== FAKE NEWS DETECTION PROMPTS ====================

FAKE_NEWS_DETECTION_PROMPT = PromptTemplate(
    input_variables=["question", "context"],
    template="""You are an expert fact-checker. Analyze the claim CONCISELY. Do not dump unnecessary information.

Claim: {question}

Additional Context: {context}

Your task:
1. Identify if the text contains a SINGLE claim or MULTIPLE distinct claims.
2. If MULTIPLE: Analyze the top 3 most controversial claims separately.
3. Determine if they are FAKE, MISLEADING, or CREDIBLE.
4. Provide a collective verdict (e.g., "MIXED" if they differ).

Format your response as:

VERDICT: [FAKE/MISLEADING/CREDIBLE/MIXED]

EXPLANATION:
[Summary of the main findings. If multiple claims, list them:]
1. [Claim 1 Subject]: [Status] - [Brief Reason]
2. [Claim 2 Subject]: [Status] - [Brief Reason]
(Limit to 3 sentences total for global summary)

EVIDENCE:
- [Key point 1]
- [Key point 2]
"""
)

WEB_CONTENT_ANALYSIS_PROMPT = PromptTemplate(
    input_variables=["question", "context", "url"],
    template="""You are analyzing content from a web article to answer a user's question.

Source URL: {url}

Article Content:
{context}

User Question: {question}

Provide a comprehensive answer based ONLY on the article content. If the article doesn't contain enough information, say so.

Include:
1. Direct answer to the question
2. Relevant quotes or facts from the article
3. Assessment of the article's credibility
4. Any potential bias or missing information

Be objective and cite specific parts of the article."""
)

# ==================== API ENDPOINTS ====================

@app.get("/")
async def root():
    """Health check endpoint"""
    stats = rag_system.get_stats()
    db_stats = db_manager.get_collection_stats()
    
    return {
        "status": "online",
        "service": "Fake News Detection API",
        "version": "1.0.0",
        "rag_stats": stats,
        "database_stats": db_stats,
        "ocr_status": "online" if ocr_reader else "offline",
        "timestamp": datetime.utcnow().isoformat()
    }

async def process_verification(question: str, session_id: str) -> dict:
    """Core verification logic shared by text and image endpoints"""
    
    # Check Cache
    query_hash = hashlib.md5(question.lower().strip().encode()).hexdigest()
    if query_hash in RESPONSE_CACHE:
        entry = RESPONSE_CACHE[query_hash]
        if time.time() - entry['timestamp'] < CACHE_TTL:
            print(f"🚀 Returning cached response for: {question[:30]}...")
            return entry['data']
    
    # Get session context
    last_conversation = db_manager.get_last_conversation(session_id)
    context_str = ""
    if last_conversation:
        context_str = f"Previous Q: {last_conversation.get('question', '')}\\nPrevious A: {last_conversation.get('answer', '')}"
    
    sources = []
    source_type = "llm"
    answer = ""
    web_verification = None
    
    # Step 0: DuckDuckGo Web Search
    try:
        ddgs = DDGS()
        search_results = ddgs.text(question, max_results=10)
        
        if search_results:
            reputable_sources = []
            all_sources = []
            reputable_domains = ['reuters.com', 'apnews.com', 'bbc.com', 'cnn.com', 'nytimes.com', 
                                'theguardian.com', 'washingtonpost.com', 'npr.org', 'factcheck.org',
                                'snopes.com', 'politifact.com', 'timesofindia.com', 'indiatoday.in', 'thehindu.com',]
            
            for result in search_results:
                url = result.get("href", "").lower()
                source_info = {
                    "title": result.get("title"),
                    "url": result.get("href"),
                    "snippet": result.get("body")
                }
                all_sources.append(source_info)
                if any(domain in url for domain in reputable_domains):
                    reputable_sources.append(source_info)
            
            article_found = len(all_sources) > 0
            on_reputable_site = len(reputable_sources) > 0
            
            web_verification = {
                "article_found": article_found,
                "on_reputable_sources": on_reputable_site,
                "reputable_source_count": len(reputable_sources),
                "total_results": len(all_sources),
                "search_results": search_results[:5],
                "reputable_sources": reputable_sources[:3]
            }
            
            sources.append({
                "type": "web_search",
                "article_found": article_found,
                "reputable_sources": len(reputable_sources),
                "total_sources": len(all_sources),
                "results": search_results[:5]
            })
    except Exception as e:
        print(f"⚠️ DuckDuckGo search failed: {e}")

    # Step 1: MongoDB Search
    db_results = db_manager.search_news_article(question, limit=3)
    if db_results:
        source_type = "db"
        db_context = "FOUND IN DATABASE:\n"
        for i, article in enumerate(db_results):
            db_context += f"Article {i+1}:\n"
            db_context += f"LABEL/VERDICT: {article.get('prediction', 'Unknown')}\n"
            db_context += f"Title: {article.get('title', 'N/A')}\n"
            db_context += f"Content: {str(article.get('text', article.get('content', '')))[:500]}...\n\n"
        
        prompt = FAKE_NEWS_DETECTION_PROMPT.format(question=question, context=db_context)
        answer = llm_invoke(prompt)
        sources = [{"type": "database", "data": str(article)[:200]} for article in db_results[:3]]
    
    # Step 2: RAG
    if not db_results and not answer:
        rag_results = rag_system.retrieve(query=question, source_type="web", top_k=5, session_id=session_id)
        if rag_results:
            source_type = "rag"
            rag_context = "\n\n".join([f"Source {i+1} (from {r.get('source_url', 'unknown')}): {r.get('content', '')}" for i, r in enumerate(rag_results)])
            prompt = FAKE_NEWS_DETECTION_PROMPT.format(question=question, context=rag_context)
            answer = llm_invoke(prompt)
            sources = [{"type": "rag", "url": r.get("source_url", ""), "content": r.get("content", "")[:200], "score": r.get("score", 0)} for r in rag_results[:3]]

    # Step 3: LLM + Web Verification
    if not answer:
        llm_context = context_str or "No previous context."
        if web_verification:
            llm_context += f"\n\nWEB VERIFICATION:\nArticle Found: {'Yes' if web_verification['article_found'] else 'No'}\nReputable: {'Yes' if web_verification['on_reputable_sources'] else 'No'}\n"
            for i, result in enumerate(web_verification['search_results'][:3]):
                llm_context += f"{i+1}. {result.get('title')}\n   {result.get('body')[:200]}...\n\n"
        
        prompt = FAKE_NEWS_DETECTION_PROMPT.format(question=question, context=llm_context)
        answer = llm_invoke(prompt)
        source_type = "web_search" if web_verification else "llm"
        if not sources:
            sources = [{"type": "llm", "info": "Generated from AI knowledge"}]

    confidence = calculate_confidence(source_type, len(sources))
    verdict_match = re.search(r'VERDICT:\s*(FAKE|MISLEADING|CREDIBLE)', answer, re.IGNORECASE)
    verdict = verdict_match.group(1) if verdict_match else "UNKNOWN"

    result = {
        "answer": answer,
        "confidence": confidence,
        "source_type": source_type,
        "sources": sources,
        "verdict": verdict,
        "web_verification": web_verification
    }
    
    # Save to Cache
    RESPONSE_CACHE[query_hash] = {'data': result, 'timestamp': time.time()}
    
    return result


@app.post("/ask", response_model=AskResponse)
@limiter.limit("100/minute")
async def ask_question(request: Request, ask_request: AskRequest):
    """
    Main fake news detection endpoint (Refactored)
    """
    question = sanitize_input(ask_request.question)
    session_id = ask_request.session_id or generate_session_id()
    
    # Update Session Activity
    db_manager.create_or_update_session(session_id, context={"last_action": "text_query", "last_question": question[:50]})
    
    result = await process_verification(question, session_id)
    
    # Save to database
    db_manager.save_chat_message(
        session_id=session_id,
        question=question,
        answer=result['answer'],
        source_type=result['source_type'],
        confidence=result['confidence'],
        sources=result['sources']
    )
    
    db_manager.log_fake_news_detection(
        question=question,
        verdict=result['verdict'],
        confidence=result['confidence'],
        evidence=[s.get("content", s.get("data", ""))[:100] for s in result['sources']],
        session_id=session_id
    )
    
    rag_system.update_session_context(session_id, question, result['answer'])
    
    return AskResponse(
        answer=result['answer'],
        confidence=result['confidence'],
        source_type=result['source_type'],
        sources=result['sources'],
        session_id=session_id,
        timestamp=datetime.utcnow().isoformat()
    )


@app.post("/analyze_image")
async def analyze_image(
    file: UploadFile = File(...),
    session_id: str = Form(...)
):
    """
    Analyze image for fake news using EasyOCR + Verification Pipeline
    """
    # Update Session Activity
    db_manager.create_or_update_session(session_id, context={"last_action": "image_analysis"})
    if not ocr_reader:
        raise HTTPException(status_code=503, detail="OCR service is unavailable")

    try:
        # Read image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        image_np = np.array(image)
        
        # OCR
        print("Processing image with EasyOCR...")
        ocr_results = ocr_reader.readtext(image_np, detail=0)
        extracted_text = " ".join(ocr_results).strip()
        print(f"Extracted Text: {extracted_text[:100]}...")
        
        if not extracted_text or len(extracted_text) < 10:
             return JSONResponse(
                status_code=400,
                content={"error": "Could not extract sufficient text from the image. Please ensure the text is clear."}
            )
            
        # Verify the extracted claim
        result = await process_verification(extracted_text, session_id)
        
        # Save (marking as image source implicitly via logic or adding metadata?)
        # We'll save it as a regular chat for now, maybe append [IMAGE] to question?
        # Or Just save the extracted text.
        
        db_manager.save_chat_message(
            session_id=session_id,
            question=f"[IMAGE] {extracted_text}", # Mark as image source
            answer=result['answer'],
            source_type=result['source_type'],
            confidence=result['confidence'],
            sources=result['sources']
        )
        
        return {
            "question": extracted_text,
            "answer": result['answer'],
            "confidence": result['confidence'],
            "source_type": result['source_type'],
            "sources": result['sources'],
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        print(f"Image analysis failed: {e}")
        return JSONResponse(status_code=500, content={"error": f"Failed to process image: {str(e)}"})

@app.post("/ask_web")
@limiter.limit("50/minute")
async def ask_web(request: Request, web_request: AskWebRequest):
    """
    Scrape URL and answer questions using RAG
    """
    session_id = web_request.session_id or generate_session_id()
    
    # Update Session Activity
    db_manager.create_or_update_session(session_id, context={"last_action": "web_scan", "url": web_request.url})
    
    if not web_request.url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    url = web_request.url.strip()
    question = sanitize_input(web_request.question) if web_request.question else "Summarize this article and assess its credibility"
    
    try:
        # Scrape the website with comprehensive headers to bypass basic blocks
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        # Parse HTML
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()
        
        # Extract text from paragraphs and headers
        paragraphs = soup.find_all(['p', 'h1', 'h2', 'h3', 'article'])
        content = "\n\n".join([p.get_text().strip() for p in paragraphs if p.get_text().strip()])
        
        if not content or len(content) < 50:
            raise HTTPException(status_code=400, detail="Could not extract meaningful content from URL")
        
        # Add to RAG system
        rag_result = rag_system.add_web_content(
            content=content,
            source_url=url,
            session_id=session_id
        )
        
        # Also save to MongoDB
        if rag_result["status"] == "success":
            db_manager.save_web_embedding(
                content=content[:1000],  # Save truncated version
                source_url=url,
                chunk_id=rag_result.get("content_hash", ""),
                metadata={"chunks_added": rag_result.get("chunks_added", 0)}
            )
        
        # Retrieve relevant chunks
        retrieved = rag_system.retrieve(
            query=question,
            source_type="web",
            top_k=5,
            session_id=session_id
        )
        
        # Generate answer using LLM
        context = "\n\n".join([r.get("content", "") for r in retrieved[:3]])
        
        prompt = WEB_CONTENT_ANALYSIS_PROMPT.format(
            url=url,
            context=context,
            question=question
        )
        
        answer = llm_invoke(prompt)
        
        # Calculate confidence
        confidence = calculate_confidence("web", len(retrieved))
        
        # Save to chat history
        db_manager.save_chat_message(
            session_id=session_id,
            question=f"[WEB] {question} - {url}",
            answer=answer,
            source_type="web",
            confidence=confidence,
            sources=[{"url": url, "chunks": len(retrieved)}]
        )
        
        return {
            "question": question,
            "answer": answer,
            "source_url": url,
            "chunks_processed": rag_result.get("chunks_added", 0),
            "confidence": confidence,
            "source_type": "web",
            "sources": [{"url": url, "chunks": len(retrieved)}],
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing web content: {str(e)}")

@app.post("/analyze_pdf")
async def analyze_pdf(
    file: UploadFile = File(...),
    session_id: str = Form(...)
):
    """
    Analyze PDF content for fake news
    """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # Update Session Activity
    db_manager.create_or_update_session(session_id, context={"last_action": "pdf_analysis"})

    try:
        # Read PDF content
        content = await file.read()
        pdf_file = io.BytesIO(content)
        
        # Extract text
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        extracted_text = ""
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text:
                extracted_text += text + "\n\n"
        
        extracted_text = extracted_text.strip()
        print(f"Extracted PDF Text: {extracted_text[:100]}...")
        
        if not extracted_text or len(extracted_text) < 50:
             return JSONResponse(
                status_code=400,
                content={"error": "Could not extract sufficient text from the PDF. It might be scanned or empty."}
            )
            
        # Verify the extracted claim
        result = await process_verification(extracted_text, session_id)
        
        db_manager.save_chat_message(
            session_id=session_id,
            question=f"[PDF] {file.filename}: {extracted_text[:100]}...",
            answer=result['answer'],
            source_type="pdf_analysis", # Distinct from RAG
            confidence=result['confidence'],
            sources=result['sources']
        )
        
        return {
            "question": extracted_text[:500] + "..." if len(extracted_text) > 500 else extracted_text,
            "answer": result['answer'],
            "confidence": result['confidence'],
            "source_type": result['source_type'],
            "sources": result['sources'],
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        print(f"PDF analysis failed: {e}")
        return JSONResponse(status_code=500, content={"error": f"Failed to process PDF: {str(e)}"})

@app.post("/upload_pdf")
@limiter.limit("20/minute")
async def upload_pdf(request: Request, file: UploadFile = File(...)):
    """
    Upload and process PDF for question answering
    """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    try:
        # Read PDF content
        content = await file.read()
        pdf_file = io.BytesIO(content)
        
        # Extract text from PDF
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        pages_processed = 0
        total_chunks = 0
        
        for page_num, page in enumerate(pdf_reader.pages):
            text = page.extract_text()
            
            if text and len(text.strip()) > 50:
                # Add to RAG system
                result = rag_system.add_pdf_content(
                    content=text,
                    pdf_name=file.filename,
                    page_number=page_num,
                    session_id=None
                )
                
                if result["status"] == "success":
                    pages_processed += 1
                    total_chunks += result.get("chunks_added", 0)
                    
                    # Save to MongoDB
                    db_manager.save_pdf_embedding(
                        content=text[:1000],
                        pdf_name=file.filename,
                        page_number=page_num,
                        chunk_id=f"{file.filename}_{page_num}",
                        metadata={"chunks": result.get("chunks_added", 0)}
                    )
        
        return {
            "status": "success",
            "pdf_name": file.filename,
            "pages_processed": pages_processed,
            "total_pages": len(pdf_reader.pages),
            "chunks_created": total_chunks,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

@app.post("/duckduckgo_verify")
@limiter.limit("30/minute")
async def duckduckgo_verify(request: Request, ddg_request: DuckDuckGoRequest):
    """
    Verify claim using DuckDuckGo web search
    """
    claim = sanitize_input(ddg_request.claim)
    session_id = ddg_request.session_id or generate_session_id()
    
    try:
        # Search DuckDuckGo
        ddgs = DDGS()
        results = ddgs.text(claim, max_results=5)
        
        if not results:
            raise HTTPException(status_code=404, detail="No search results found")
        
        # Extract sources
        sources = []
        contradictions = []
        confirmations = []
        
        for i, result in enumerate(results):
            source = {
                "title": result.get("title", ""),
                "url": result.get("href", ""),
                "snippet": result.get("body", ""),
                "rank": i + 1
            }
            sources.append(source)
            
            # Simple keyword analysis for contradictions/confirmations
            snippet_lower = result.get("body", "").lower()
            claim_lower = claim.lower()
            
            # Check for contradiction keywords
            if any(word in snippet_lower for word in ["false", "fake", "debunked", "myth", "incorrect"]):
                contradictions.append(source)
            elif any(word in snippet_lower for word in ["confirmed", "true", "verified", "accurate"]):
                confirmations.append(source)
        
        # Generate credibility summary using LLM
        sources_text = "\n\n".join([
            f"{s['title']}\n{s['snippet']}\nURL: {s['url']}"
            for s in sources
        ])
        
        verification_prompt = f"""Based on web search results, verify this claim:

Claim: {claim}

Search Results:
{sources_text}

Provide:
1. VERDICT: FAKE, MISLEADING, or CREDIBLE
2. CREDIBILITY SCORE: 0-100
3. Summary of findings
4. Key contradictions or confirmations
5. Recommendation

Be objective and evidence-based."""
        
        verdict_response = llm_invoke(verification_prompt)
        
        # Extract credibility score
        score_match = re.search(r'CREDIBILITY SCORE:\s*(\d+)', verdict_response)
        credibility_score = int(score_match.group(1)) if score_match else 50
        
        # Save to database
        db_manager.save_chat_message(
            session_id=session_id,
            question=f"[VERIFY] {claim}",
            answer=verdict_response,
            source_type="web_search",
            confidence=credibility_score,
            sources=sources
        )
        
        return {
            "claim": claim,
            "verdict": verdict_response,
            "credibility_score": credibility_score,
            "sources": sources,
            "contradictions": contradictions,
            "confirmations": confirmations,
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during verification: {str(e)}")

@app.get("/session/{session_id}/history")
async def get_session_history(session_id: str):
    """Get chat history for a session"""
    history = db_manager.get_session_history(session_id, limit=20)
    
    # Convert ObjectId to string for JSON serialization
    for msg in history:
        msg["_id"] = str(msg["_id"])
    
    return {
        "session_id": session_id,
        "history": history,
        "count": len(history)
    }

@app.get("/trending")
async def get_trending_debunks():
    """Get top 5 trending fake news topics"""
    try:
        trends = db_manager.get_trending_stats(limit=5)
        return {"trends": trends}
    except Exception as e:
        print(f"Error fetching trending: {e}")
        return {"trends": []}

# ==================== ERROR HANDLERS ====================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom HTTP exception handler"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """General exception handler"""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc),
            "timestamp": datetime.utcnow().isoformat()
        }
    )

# ==================== STARTUP/SHUTDOWN ====================

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    print("🚀 Starting Fake News Detection API")
    print(f"📊 Database: {db_manager.get_collection_stats()}")
    print(f"🔍 RAG System: {rag_system.get_stats()}")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("👋 Shutting down Fake News Detection API")
    db_manager.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
