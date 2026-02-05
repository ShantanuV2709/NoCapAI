"""
Database layer for MongoDB integration
Handles all database operations including chat history, embeddings, and session management
"""

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, DuplicateKeyError
from datetime import datetime
from typing import Dict, List, Optional, Any
import os
from dotenv import load_dotenv
import hashlib

# Load environment variables
load_dotenv()

# MongoDB Configuration
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
DATABASE_NAME = os.getenv("DATABASE_NAME", "Fake_News")

class DatabaseManager:
    """Manages all MongoDB operations for the fake news detection system"""
    
    def __init__(self):
        """Initialize MongoDB connection and collections"""
        try:
            self.client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            # Test connection
            self.client.admin.command('ping')
            print(f"✅ Connected to MongoDB: {DATABASE_NAME}")
            
            self.db = self.client[DATABASE_NAME]
            
            # Initialize collections
            self.news_article = self.db["news_article"]  # Existing collection
            self.chat_history = self.db["chat_history"]
            self.web_embeddings = self.db["web_embeddings"]
            self.pdf_embeddings = self.db["pdf_embeddings"]
            self.fake_news_logs = self.db["fake_news_logs"]
            self.user_sessions = self.db["user_sessions"]
            
            # Create indexes for better performance
            self._create_indexes()
            
        except ConnectionFailure as e:
            print(f"❌ Failed to connect to MongoDB: {e}")
            raise
    
    def _create_indexes(self):
        """Create indexes for efficient querying"""
        try:
            self.chat_history.create_index([("session_id", 1), ("timestamp", -1)])
            self.chat_history.create_index("timestamp")
            
            # Create text index for full-text search on news articles
            self.news_article.create_index([("text", "text")])
            
            self.user_sessions.create_index("session_id", unique=True)
            self.web_embeddings.create_index("content_hash", unique=True)
            self.pdf_embeddings.create_index("content_hash", unique=True)
            self.fake_news_logs.create_index("timestamp")
            print("✅ Database indexes created")
        except Exception as e:
            print(f"⚠️ Error creating indexes: {e}")
    
    # ==================== CHAT HISTORY OPERATIONS ====================
    
    def save_chat_message(
        self,
        session_id: str,
        question: str,
        answer: str,
        source_type: str,
        confidence: float = 0.0,
        sources: List[Dict] = None,
        metadata: Dict = None
    ) -> str:
        """
        Save a chat message to history (news_article collection)
        """
        # Extract verdict for backward compatibility with 'prediction' field
        import re
        verdict_match = re.search(r'VERDICT:\s*(FAKE|MISLEADING|CREDIBLE)', answer, re.IGNORECASE)
        prediction = verdict_match.group(1).title() if verdict_match else "Unknown"

        # Extract explanation for backward compatibility
        explanation_match = re.search(r'EXPLANATION:\s*(.*?)(?:\n\n\w+:|\n\w+:|$)', answer, re.DOTALL | re.IGNORECASE)
        explanation = explanation_match.group(1).strip() if explanation_match else answer

        document = {
            "session_id": session_id,
            "question": question,
            "text": question,  # Alias for compatibility
            "answer": answer,
            "prediction": prediction, 
            "label": prediction, # Legacy field alias
            "explanation": explanation, # Legacy field extraction
            "source_type": source_type,
            "confidence": confidence,
            "sources": sources or [],
            "metadata": metadata or {},
            "timestamp": datetime.utcnow()
        }
        
        # Save to chat_history (Correct Collection)
        result = self.chat_history.insert_one(document)
        return str(result.inserted_id)
    
    def get_session_history(
        self,
        session_id: str,
        limit: int = 20
    ) -> List[Dict]:
        """
        Get chat history from chat_history collection (with legacy fallback)
        """
        messages = []
        
        # 1. Fetch from new Schema (chat_history)
        cursor_new = self.chat_history.find().sort("timestamp", -1).limit(limit)
        
        for doc in cursor_new:
            messages.append({
                "_id": str(doc["_id"]),
                "session_id": doc.get("session_id"),
                "question": doc.get("question"),
                "answer": doc.get("answer"),
                "source_type": doc.get("source_type"),
                "confidence": doc.get("confidence", 0.0),
                "timestamp": doc.get("timestamp")
            })
            
        # 2. Fetch from Legacy Schema (news_article) if we need more
        if len(messages) < limit:
            remaining = limit - len(messages)
            # Exclude items that might be in both (unlikely given separate collections)
            cursor_legacy = self.news_article.find().sort("timestamp", -1).limit(remaining)
            
            for doc in cursor_legacy:
                # Only add if it looks like a chat message (has answer/prediction)
                # and isn't just a raw article
                if "answer" in doc or "prediction" in doc:
                    msg = {
                        "_id": str(doc["_id"]),
                        "session_id": doc.get("session_id", "legacy"),
                        "question": doc.get("question", doc.get("text", "")),
                        "answer": doc.get("answer", ""),
                        "source_type": doc.get("source_type", "legacy"),
                        "confidence": doc.get("confidence", 0.0),
                        "timestamp": doc.get("timestamp")
                    }
                     # If answer is missing (legacy data), construct one from prediction
                    if not msg["answer"] and "prediction" in doc:
                        msg["answer"] = f"VERDICT: {doc['prediction'].upper()}\\n\\n(Historical Record)"
                    
                    messages.append(msg)

        return messages
    
    def get_last_conversation(self, session_id: str) -> Optional[Dict]:
        """Get the last Q&A pair from chat_history"""
        result = self.chat_history.find_one(
            {"session_id": session_id},
            sort=[("timestamp", -1)]
        )
        return result
    
    # ==================== SESSION MANAGEMENT ====================
    
    def create_or_update_session(
        self,
        session_id: str,
        context: Dict = None
    ) -> None:
        """
        Create or update a user session
        
        Args:
            session_id: Session identifier
            context: Session context data
        """
        self.user_sessions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "context": context or {},
                    "last_activity": datetime.utcnow()
                },
                "$setOnInsert": {
                    "created_at": datetime.utcnow()
                }
            },
            upsert=True
        )
    
    def get_session_context(self, session_id: str) -> Optional[Dict]:
        """Get session context"""
        session = self.user_sessions.find_one({"session_id": session_id})
        return session.get("context") if session else None
    
    # ==================== FAKE NEWS DETECTION ====================
    
    def search_news_article(self, query: str, limit: int = 5) -> List[Dict]:
        """
        Search for news articles in existing collection
        Performs text search on the news_article collection
        
        Args:
            query: Search query
            limit: Maximum results
        
        Returns:
            List of matching articles
        """
        try:
            # Try text search first (requires text index)
            results = list(self.news_article.find(
                {"$text": {"$search": query}}
            ).limit(limit))
            
            if results:
                return results
        except Exception as e:
            # Text index doesn't exist, fall back to regex
            print(f"⚠️ Text search failed (no index), using regex: {e}")
        
        # Fall back to regex search on common fields
        regex_query = {"$regex": query, "$options": "i"}
        results = list(self.news_article.find({
            "$or": [
                {"title": regex_query},
                {"content": regex_query},
                {"text": regex_query},
                {"article": regex_query},
                {"claim": regex_query},
                {"description": regex_query}
            ]
        }).limit(limit))
        
        return results
    
    def log_fake_news_detection(
        self,
        question: str,
        verdict: str,
        confidence: float,
        evidence: List[str],
        session_id: str
    ) -> str:
        """
        Log a fake news detection result
        
        Args:
            question: The claim being checked
            verdict: Fake/Misleading/Credible
            confidence: Confidence score
            evidence: List of evidence
            session_id: Session ID
        
        Returns:
            Log ID
        """
        document = {
            "question": question,
            "verdict": verdict,
            "confidence": confidence,
            "evidence": evidence,
            "session_id": session_id,
            "timestamp": datetime.utcnow()
        }
        
        result = self.fake_news_logs.insert_one(document)
        return str(result.inserted_id)
    
    # ==================== EMBEDDINGS MANAGEMENT ====================
    
    def save_web_embedding(
        self,
        content: str,
        source_url: str,
        chunk_id: str,
        metadata: Dict = None
    ) -> Optional[str]:
        """
        Save web content embedding metadata
        Uses content hash to avoid duplicates
        
        Args:
            content: The actual content chunk
            source_url: URL of the source
            chunk_id: Unique chunk identifier
            metadata: Additional metadata
        
        Returns:
            Document ID or None if duplicate
        """
        content_hash = hashlib.md5(content.encode()).hexdigest()
        
        document = {
            "content": content,
            "content_hash": content_hash,
            "source_url": source_url,
            "chunk_id": chunk_id,
            "metadata": metadata or {},
            "timestamp": datetime.utcnow()
        }
        
        try:
            result = self.web_embeddings.insert_one(document)
            return str(result.inserted_id)
        except DuplicateKeyError:
            print(f"⚠️ Duplicate content detected, skipping: {chunk_id}")
            return None
    
    def save_pdf_embedding(
        self,
        content: str,
        pdf_name: str,
        page_number: int,
        chunk_id: str,
        metadata: Dict = None
    ) -> Optional[str]:
        """
        Save PDF content embedding metadata
        
        Args:
            content: The actual content chunk
            pdf_name: Name of the PDF file
            page_number: Page number
            chunk_id: Unique chunk identifier
            metadata: Additional metadata
        
        Returns:
            Document ID or None if duplicate
        """
        content_hash = hashlib.md5(content.encode()).hexdigest()
        
        document = {
            "content": content,
            "content_hash": content_hash,
            "pdf_name": pdf_name,
            "page_number": page_number,
            "chunk_id": chunk_id,
            "metadata": metadata or {},
            "timestamp": datetime.utcnow()
        }
        
        try:
            result = self.pdf_embeddings.insert_one(document)
            return str(result.inserted_id)
        except DuplicateKeyError:
            print(f"⚠️ Duplicate PDF content detected, skipping: {chunk_id}")
            return None
    
    def check_content_exists(self, content: str, source_type: str = "web") -> bool:
        """
        Check if content already exists in embeddings
        
        Args:
            content: Content to check
            source_type: "web" or "pdf"
        
        Returns:
            True if exists, False otherwise
        """
        content_hash = hashlib.md5(content.encode()).hexdigest()
        collection = self.web_embeddings if source_type == "web" else self.pdf_embeddings
        
        return collection.find_one({"content_hash": content_hash}) is not None
    
    # ==================== UTILITY METHODS ====================
    
    def get_collection_stats(self) -> Dict[str, int]:
        """Get statistics about all collections"""
        return {
            "news_articles": self.news_article.count_documents({}),
            "chat_history": self.chat_history.count_documents({}),
            "web_embeddings": self.web_embeddings.count_documents({}),
            "pdf_embeddings": self.pdf_embeddings.count_documents({}),
            "fake_news_logs": self.fake_news_logs.count_documents({}),
            "user_sessions": self.user_sessions.count_documents({})
        }
    
    def close(self):
        """Close MongoDB connection"""
        self.client.close()
        print("✅ MongoDB connection closed")


# Singleton instance
db_manager = DatabaseManager()
