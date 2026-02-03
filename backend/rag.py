"""
Retrieval-Augmented Generation (RAG) System
Handles text embedding, FAISS vector storage, and semantic retrieval
"""

import os
import pickle
import hashlib
from typing import List, Dict, Optional, Tuple
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from datetime import datetime

# Text chunking
from langchain.text_splitter import RecursiveCharacterTextSplitter

# Initialize embedding model globally (loaded once)
print("🔄 Loading embedding model...")
embedding_model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
EMBEDDING_DIMENSION = 384  # Dimension for all-MiniLM-L6-v2
print("✅ Embedding model loaded")


class RAGSystem:
    """Manages embeddings and retrieval for web and PDF content"""
    
    def __init__(self, index_dir: str = "./faiss_index"):
        """
        Initialize RAG system with FAISS indices
        
        Args:
            index_dir: Directory to store FAISS indices
        """
        self.index_dir = index_dir
        os.makedirs(index_dir, exist_ok=True)
        
        # Separate indices for web and PDF content
        self.web_index_path = os.path.join(index_dir, "web_index.faiss")
        self.web_metadata_path = os.path.join(index_dir, "web_metadata.pkl")
        self.pdf_index_path = os.path.join(index_dir, "pdf_index.faiss")
        self.pdf_metadata_path = os.path.join(index_dir, "pdf_metadata.pkl")
        
        # Initialize or load indices
        self.web_index, self.web_metadata = self._load_or_create_index("web")
        self.pdf_index, self.pdf_metadata = self._load_or_create_index("pdf")
        
        # Text splitter for chunking
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        
        # Session context storage (in-memory for now)
        self.session_contexts: Dict[str, List[Dict]] = {}
    
    def _load_or_create_index(self, index_type: str) -> Tuple[faiss.Index, List[Dict]]:
        """
        Load existing FAISS index or create new one
        
        Args:
            index_type: "web" or "pdf"
        
        Returns:
            Tuple of (FAISS index, metadata list)
        """
        index_path = self.web_index_path if index_type == "web" else self.pdf_index_path
        metadata_path = self.web_metadata_path if index_type == "web" else self.pdf_metadata_path
        
        # Try to load existing index
        if os.path.exists(index_path) and os.path.exists(metadata_path):
            try:
                index = faiss.read_index(index_path)
                with open(metadata_path, 'rb') as f:
                    metadata = pickle.load(f)
                print(f"✅ Loaded {index_type} index with {index.ntotal} vectors")
                return index, metadata
            except Exception as e:
                print(f"⚠️ Error loading {index_type} index: {e}. Creating new index.")
        
        # Create new index (using L2 distance)
        index = faiss.IndexFlatL2(EMBEDDING_DIMENSION)
        metadata = []
        print(f"✅ Created new {index_type} index")
        return index, metadata
    
    def _save_index(self, index_type: str):
        """
        Save FAISS index and metadata to disk
        
        Args:
            index_type: "web" or "pdf"
        """
        if index_type == "web":
            faiss.write_index(self.web_index, self.web_index_path)
            with open(self.web_metadata_path, 'wb') as f:
                pickle.dump(self.web_metadata, f)
        else:
            faiss.write_index(self.pdf_index, self.pdf_index_path)
            with open(self.pdf_metadata_path, 'wb') as f:
                pickle.dump(self.pdf_metadata, f)
        
        print(f"💾 Saved {index_type} index to disk")
    
    def chunk_text(self, text: str) -> List[str]:
        """
        Split text into chunks
        
        Args:
            text: Text to chunk
        
        Returns:
            List of text chunks
        """
        chunks = self.text_splitter.split_text(text)
        return chunks
    
    def generate_embedding(self, text: str) -> np.ndarray:
        """
        Generate embedding for text
        
        Args:
            text: Input text
        
        Returns:
            Numpy array of embedding
        """
        embedding = embedding_model.encode(text, convert_to_numpy=True)
        return embedding
    
    def generate_embeddings_batch(self, texts: List[str]) -> np.ndarray:
        """
        Generate embeddings for multiple texts (more efficient)
        
        Args:
            texts: List of texts
        
        Returns:
            Numpy array of embeddings
        """
        embeddings = embedding_model.encode(texts, convert_to_numpy=True, show_progress_bar=True)
        return embeddings
    
    def add_web_content(
        self,
        content: str,
        source_url: str,
        session_id: Optional[str] = None
    ) -> Dict:
        """
        Add web content to RAG system
        
        Args:
            content: Web page content
            source_url: URL of the source
            session_id: Optional session ID
        
        Returns:
            Result dictionary with stats
        """
        # Check for duplicates using hash
        content_hash = hashlib.md5(content.encode()).hexdigest()
        
        # Check if content already exists
        for meta in self.web_metadata:
            if meta.get("content_hash") == content_hash:
                print(f"⚠️ Content already indexed from {source_url}")
                return {
                    "status": "duplicate",
                    "chunks_added": 0,
                    "message": "Content already exists in index"
                }
        
        # Chunk the content
        chunks = self.chunk_text(content)
        
        if not chunks:
            return {
                "status": "error",
                "chunks_added": 0,
                "message": "No content to chunk"
            }
        
        # Generate embeddings for all chunks
        embeddings = self.generate_embeddings_batch(chunks)
        
        # Add to FAISS index
        self.web_index.add(embeddings.astype('float32'))
        
        # Store metadata for each chunk
        for i, chunk in enumerate(chunks):
            chunk_id = f"{content_hash}_{i}"
            self.web_metadata.append({
                "chunk_id": chunk_id,
                "content": chunk,
                "content_hash": content_hash,
                "source_url": source_url,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "timestamp": datetime.utcnow().isoformat(),
                "session_id": session_id
            })
        
        # Save to disk
        self._save_index("web")
        
        return {
            "status": "success",
            "chunks_added": len(chunks),
            "source_url": source_url,
            "content_hash": content_hash
        }
    
    def add_pdf_content(
        self,
        content: str,
        pdf_name: str,
        page_number: int = 0,
        session_id: Optional[str] = None
    ) -> Dict:
        """
        Add PDF content to RAG system
        
        Args:
            content: PDF page content
            pdf_name: Name of the PDF file
            page_number: Page number
            session_id: Optional session ID
        
        Returns:
            Result dictionary with stats
        """
        # Chunk the content
        chunks = self.chunk_text(content)
        
        if not chunks:
            return {
                "status": "error",
                "chunks_added": 0,
                "message": "No content to chunk"
            }
        
        # Generate embeddings
        embeddings = self.generate_embeddings_batch(chunks)
        
        # Add to FAISS index
        self.pdf_index.add(embeddings.astype('float32'))
        
        # Store metadata
        content_hash = hashlib.md5(content.encode()).hexdigest()
        for i, chunk in enumerate(chunks):
            chunk_id = f"{pdf_name}_{page_number}_{i}"
            self.pdf_metadata.append({
                "chunk_id": chunk_id,
                "content": chunk,
                "content_hash": content_hash,
                "pdf_name": pdf_name,
                "page_number": page_number,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "timestamp": datetime.utcnow().isoformat(),
                "session_id": session_id
            })
        
        # Save to disk
        self._save_index("pdf")
        
        return {
            "status": "success",
            "chunks_added": len(chunks),
            "pdf_name": pdf_name,
            "page_number": page_number
        }
    
    def retrieve(
        self,
        query: str,
        source_type: str = "web",
        top_k: int = 5,
        score_threshold: float = 100.0,
        session_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Retrieve relevant chunks for a query
        
        Args:
            query: Search query
            source_type: "web" or "pdf"
            top_k: Number of results to return
            score_threshold: Maximum distance threshold (lower is better)
            session_id: Optional session ID for context
        
        Returns:
            List of relevant chunks with metadata
        """
        # Select appropriate index
        index = self.web_index if source_type == "web" else self.pdf_index
        metadata = self.web_metadata if source_type == "web" else self.pdf_metadata
        
        if index.ntotal == 0:
            print(f"⚠️ No {source_type} content indexed yet")
            return []
        
        # Add session context if available
        enhanced_query = query
        if session_id and session_id in self.session_contexts:
            last_context = self.session_contexts[session_id][-1] if self.session_contexts[session_id] else None
            if last_context:
                enhanced_query = f"{last_context.get('question', '')} {query}"
        
        # Generate query embedding
        query_embedding = self.generate_embedding(enhanced_query)
        
        # Search FAISS index
        distances, indices = index.search(
            query_embedding.reshape(1, -1).astype('float32'),
            min(top_k, index.ntotal)
        )
        
        # Filter by score threshold and prepare results
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if dist <= score_threshold and idx < len(metadata):
                result = metadata[idx].copy()
                result["score"] = float(dist)
                result["similarity"] = 1 / (1 + dist)  # Convert distance to similarity
                results.append(result)
        
        return results
    
    def update_session_context(self, session_id: str, question: str, answer: str):
        """
        Update session context for better follow-up questions
        
        Args:
            session_id: Session identifier
            question: User's question
            answer: AI's answer
        """
        if session_id not in self.session_contexts:
            self.session_contexts[session_id] = []
        
        self.session_contexts[session_id].append({
            "question": question,
            "answer": answer,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Keep only last 5 exchanges per session
        if len(self.session_contexts[session_id]) > 5:
            self.session_contexts[session_id] = self.session_contexts[session_id][-5:]
    
    def get_stats(self) -> Dict:
        """Get statistics about the RAG system"""
        return {
            "web_vectors": self.web_index.ntotal,
            "pdf_vectors": self.pdf_index.ntotal,
            "web_chunks": len(self.web_metadata),
            "pdf_chunks": len(self.pdf_metadata),
            "active_sessions": len(self.session_contexts)
        }
    
    def clear_index(self, index_type: str):
        """
        Clear an index (useful for testing)
        
        Args:
            index_type: "web" or "pdf"
        """
        if index_type == "web":
            self.web_index, self.web_metadata = self._load_or_create_index("web")
        else:
            self.pdf_index, self.pdf_metadata = self._load_or_create_index("pdf")
        
        self._save_index(index_type)
        print(f"🗑️ Cleared {index_type} index")


# Singleton instance
rag_system = RAGSystem()
