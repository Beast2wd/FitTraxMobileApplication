"""
Security Module for FitTrax+ API
Implements JWT authentication, rate limiting, input validation, and audit logging
"""

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, validator, Field
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import os
import re
import secrets
import logging
import time
from functools import wraps
from collections import defaultdict
import threading

# ============================================================================
# CONFIGURATION
# ============================================================================

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
REFRESH_TOKEN_EXPIRE_DAYS = 30

# Password Configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security bearer
security = HTTPBearer(auto_error=False)

# Audit logger
audit_logger = logging.getLogger("audit")
audit_logger.setLevel(logging.INFO)

# ============================================================================
# CUSTOM IN-MEMORY RATE LIMITER
# ============================================================================

class InMemoryRateLimiter:
    """Simple in-memory rate limiter with sliding window"""
    
    def __init__(self):
        self.requests: Dict[str, List[float]] = defaultdict(list)
        self.lock = threading.Lock()
    
    def _clean_old_requests(self, key: str, window_seconds: int):
        """Remove requests outside the time window"""
        cutoff = time.time() - window_seconds
        self.requests[key] = [t for t in self.requests[key] if t > cutoff]
    
    def is_rate_limited(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """Check if request should be rate limited"""
        with self.lock:
            self._clean_old_requests(key, window_seconds)
            
            if len(self.requests[key]) >= max_requests:
                return True
            
            self.requests[key].append(time.time())
            return False
    
    def get_remaining(self, key: str, max_requests: int, window_seconds: int) -> int:
        """Get remaining requests in window"""
        with self.lock:
            self._clean_old_requests(key, window_seconds)
            return max(0, max_requests - len(self.requests[key]))

# Global rate limiter instance
rate_limiter = InMemoryRateLimiter()

# Rate limit configurations
RATE_LIMITS = {
    "auth": (10, 60),        # 10 requests per minute
    "ai": (20, 60),          # 20 requests per minute
    "sensitive": (30, 60),   # 30 requests per minute
    "default": (100, 60),    # 100 requests per minute
}

def check_rate_limit(request: Request, limit_type: str = "default") -> None:
    """Check rate limit and raise exception if exceeded"""
    # Get client identifier
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"
    
    # Get limit config
    max_requests, window_seconds = RATE_LIMITS.get(limit_type, RATE_LIMITS["default"])
    
    # Create unique key for this endpoint + IP
    key = f"{limit_type}:{client_ip}"
    
    if rate_limiter.is_rate_limited(key, max_requests, window_seconds):
        remaining = rate_limiter.get_remaining(key, max_requests, window_seconds)
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Try again later.",
            headers={
                "X-RateLimit-Limit": str(max_requests),
                "X-RateLimit-Remaining": str(remaining),
                "X-RateLimit-Reset": str(window_seconds)
            }
        )

# ============================================================================
# MODELS
# ============================================================================

class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    
    @validator('email')
    def validate_email(cls, v):
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, v):
            raise ValueError('Invalid email format')
        return v.lower().strip()
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v
    
    @validator('name')
    def validate_name(cls, v):
        # Sanitize name - remove any HTML/script tags
        v = re.sub(r'<[^>]*>', '', v)
        v = v.strip()
        if len(v) < 2 or len(v) > 100:
            raise ValueError('Name must be between 2 and 100 characters')
        return v

class UserLogin(BaseModel):
    email: str
    password: str
    
    @validator('email')
    def validate_email(cls, v):
        return v.lower().strip()

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class TokenData(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str
    
    @validator('new_password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v

# ============================================================================
# PASSWORD UTILITIES
# ============================================================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

# ============================================================================
# JWT UTILITIES
# ============================================================================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

# ============================================================================
# AUTHENTICATION DEPENDENCIES
# ============================================================================

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[dict]:
    """Get current user if token provided, otherwise return None"""
    if not credentials:
        return None
    
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload:
        return None
    
    if payload.get("type") != "access":
        return None
    
    return {
        "user_id": payload.get("user_id"),
        "email": payload.get("email")
    }

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict:
    """Get current user - raises exception if not authenticated"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return {
        "user_id": payload.get("user_id"),
        "email": payload.get("email")
    }

# ============================================================================
# INPUT VALIDATION & SANITIZATION
# ============================================================================

def sanitize_string(value: str, max_length: int = 1000) -> str:
    """Sanitize a string input"""
    if not value:
        return ""
    # Remove HTML tags
    value = re.sub(r'<[^>]*>', '', value)
    # Remove potential MongoDB operators
    value = re.sub(r'\$[a-zA-Z]+', '', value)
    # Truncate
    return value[:max_length].strip()

def sanitize_search_query(query: str, max_length: int = 100) -> str:
    """Sanitize a search query for use in regex"""
    if not query:
        return ""
    # Escape regex special characters
    query = re.escape(query)
    # Remove any remaining potential injection patterns
    query = re.sub(r'\$[a-zA-Z]+', '', query)
    return query[:max_length].strip()

def validate_user_id(user_id: str) -> str:
    """Validate user_id format"""
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID is required")
    # Only allow alphanumeric, underscore, and hyphen
    if not re.match(r'^[a-zA-Z0-9_-]+$', user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    if len(user_id) > 100:
        raise HTTPException(status_code=400, detail="User ID too long")
    return user_id

def validate_base64_image(image_base64: str, max_size_mb: float = 10) -> str:
    """Validate base64 image data"""
    if not image_base64:
        raise HTTPException(status_code=400, detail="Image data is required")
    
    # Check size (base64 is ~33% larger than original)
    max_base64_size = int(max_size_mb * 1024 * 1024 * 1.33)
    if len(image_base64) > max_base64_size:
        raise HTTPException(
            status_code=413, 
            detail=f"Image too large. Maximum size is {max_size_mb}MB"
        )
    
    # Validate base64 format
    try:
        import base64
        # Remove data URL prefix if present
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]
        base64.b64decode(image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")
    
    return image_base64

# ============================================================================
# AUDIT LOGGING
# ============================================================================

class AuditLog:
    """Audit logging for sensitive operations"""
    
    @staticmethod
    def log_action(
        action: str,
        user_id: Optional[str],
        resource: str,
        resource_id: Optional[str] = None,
        details: Optional[dict] = None,
        ip_address: Optional[str] = None,
        success: bool = True
    ):
        """Log an audit event"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "action": action,
            "user_id": user_id,
            "resource": resource,
            "resource_id": resource_id,
            "details": details,
            "ip_address": ip_address,
            "success": success
        }
        
        if success:
            audit_logger.info(f"AUDIT: {log_entry}")
        else:
            audit_logger.warning(f"AUDIT_FAILED: {log_entry}")
    
    @staticmethod
    def log_auth(
        action: str,  # login, logout, register, password_change
        email: str,
        ip_address: Optional[str] = None,
        success: bool = True,
        failure_reason: Optional[str] = None
    ):
        """Log authentication events"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "action": f"AUTH_{action.upper()}",
            "email": email,
            "ip_address": ip_address,
            "success": success,
            "failure_reason": failure_reason
        }
        
        if success:
            audit_logger.info(f"AUTH: {log_entry}")
        else:
            audit_logger.warning(f"AUTH_FAILED: {log_entry}")
    
    @staticmethod
    def log_data_access(
        user_id: str,
        resource: str,
        action: str,  # read, create, update, delete
        target_user_id: Optional[str] = None,
        ip_address: Optional[str] = None
    ):
        """Log data access events"""
        # Flag if accessing another user's data
        cross_user = target_user_id and target_user_id != user_id
        
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "action": f"DATA_{action.upper()}",
            "user_id": user_id,
            "resource": resource,
            "target_user_id": target_user_id,
            "cross_user_access": cross_user,
            "ip_address": ip_address
        }
        
        if cross_user:
            audit_logger.warning(f"CROSS_USER_ACCESS: {log_entry}")
        else:
            audit_logger.info(f"DATA_ACCESS: {log_entry}")

# ============================================================================
# REQUEST HELPERS
# ============================================================================

def get_client_ip(request: Request) -> str:
    """Get the client's IP address from request"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
