"""
Production Configuration Module for FitTrax+ API
Handles environment-based configuration, security warnings, and production readiness checks
"""

import os
import logging
import warnings
from typing import Optional, List
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# ============================================================================
# ENVIRONMENT DETECTION
# ============================================================================

def get_environment() -> str:
    """Get current environment (development, staging, production)"""
    return os.getenv('ENVIRONMENT', 'development').lower()

def is_production() -> bool:
    """Check if running in production"""
    return get_environment() == 'production'

def is_development() -> bool:
    """Check if running in development"""
    return get_environment() == 'development'

# ============================================================================
# CONFIGURATION CLASSES
# ============================================================================

class DatabaseConfig:
    """Database configuration"""
    MONGO_URL: str = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
    DB_NAME: str = os.getenv('DB_NAME', 'fitness_tracker_db')
    
    # Production recommendations
    MAX_POOL_SIZE: int = int(os.getenv('MONGO_MAX_POOL_SIZE', '100'))
    MIN_POOL_SIZE: int = int(os.getenv('MONGO_MIN_POOL_SIZE', '10'))
    
    @classmethod
    def validate(cls) -> List[str]:
        """Validate database configuration"""
        issues = []
        if 'localhost' in cls.MONGO_URL and is_production():
            issues.append("WARNING: Using localhost MongoDB in production")
        return issues

class SecurityConfig:
    """Security configuration"""
    JWT_SECRET_KEY: str = os.getenv('JWT_SECRET_KEY', '')
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '1440'))  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', '30'))
    
    # HTTPS enforcement
    ENFORCE_HTTPS: bool = os.getenv('ENFORCE_HTTPS', 'false').lower() == 'true'
    
    @classmethod
    def validate(cls) -> List[str]:
        """Validate security configuration"""
        issues = []
        
        if not cls.JWT_SECRET_KEY:
            issues.append("CRITICAL: JWT_SECRET_KEY is not set")
        elif len(cls.JWT_SECRET_KEY) < 32:
            issues.append("WARNING: JWT_SECRET_KEY should be at least 32 characters")
            
        if is_production() and not cls.ENFORCE_HTTPS:
            issues.append("WARNING: HTTPS enforcement is disabled in production")
            
        return issues

class StripeConfig:
    """Stripe payment configuration"""
    SECRET_KEY: str = os.getenv('STRIPE_SECRET_KEY', '')
    PUBLISHABLE_KEY: str = os.getenv('STRIPE_PUBLISHABLE_KEY', '')
    WEBHOOK_SECRET: str = os.getenv('STRIPE_WEBHOOK_SECRET', '')
    PRICE_ID: str = os.getenv('STRIPE_PRICE_ID', '')
    
    @classmethod
    def is_live_mode(cls) -> bool:
        """Check if using live Stripe keys"""
        return cls.SECRET_KEY.startswith('sk_live_')
    
    @classmethod
    def is_test_mode(cls) -> bool:
        """Check if using test Stripe keys"""
        return cls.SECRET_KEY.startswith('sk_test_')
    
    @classmethod
    def validate(cls) -> List[str]:
        """Validate Stripe configuration"""
        issues = []
        
        if not cls.SECRET_KEY or 'REPLACE' in cls.SECRET_KEY:
            issues.append("WARNING: Stripe secret key not configured")
        elif cls.is_live_mode() and is_development():
            issues.append("CRITICAL: Using LIVE Stripe keys in development!")
        elif cls.is_test_mode() and is_production():
            issues.append("WARNING: Using TEST Stripe keys in production")
            
        if not cls.WEBHOOK_SECRET or 'REPLACE' in cls.WEBHOOK_SECRET:
            issues.append("WARNING: Stripe webhook secret not configured")
            
        return issues

class CORSConfig:
    """CORS configuration"""
    ALLOWED_ORIGINS: List[str] = [
        origin.strip() 
        for origin in os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:8081').split(',')
        if origin.strip()
    ]
    
    # Add production domains
    if is_production():
        # Add your production domains here
        pass
    
    @classmethod
    def validate(cls) -> List[str]:
        """Validate CORS configuration"""
        issues = []
        
        if '*' in cls.ALLOWED_ORIGINS:
            issues.append("CRITICAL: CORS allows all origins (*)")
        elif not cls.ALLOWED_ORIGINS:
            issues.append("WARNING: No CORS origins configured")
            
        return issues

class RateLimitConfig:
    """Rate limiting configuration"""
    AUTH_LIMIT: int = int(os.getenv('RATE_LIMIT_AUTH', '10'))  # per minute
    AI_LIMIT: int = int(os.getenv('RATE_LIMIT_AI', '20'))  # per minute
    DEFAULT_LIMIT: int = int(os.getenv('RATE_LIMIT_DEFAULT', '100'))  # per minute
    WINDOW_SECONDS: int = 60
    
    @classmethod
    def validate(cls) -> List[str]:
        """Validate rate limit configuration"""
        issues = []
        
        if cls.AUTH_LIMIT > 20:
            issues.append("WARNING: Auth rate limit is high (>20/min)")
        if cls.AI_LIMIT > 50:
            issues.append("WARNING: AI rate limit is high (>50/min), may incur costs")
            
        return issues

class APIConfig:
    """API configuration"""
    LLM_KEY: str = os.getenv('EMERGENT_LLM_KEY', '')
    REQUEST_TIMEOUT: int = int(os.getenv('REQUEST_TIMEOUT', '30'))
    MAX_REQUEST_SIZE: int = int(os.getenv('MAX_REQUEST_SIZE', str(10 * 1024 * 1024)))  # 10MB
    
    @classmethod
    def validate(cls) -> List[str]:
        """Validate API configuration"""
        issues = []
        
        if not cls.LLM_KEY:
            issues.append("WARNING: EMERGENT_LLM_KEY not set, AI features will fail")
            
        return issues

# ============================================================================
# PRODUCTION READINESS CHECK
# ============================================================================

def run_production_checks() -> dict:
    """Run all production readiness checks"""
    results = {
        'environment': get_environment(),
        'is_production': is_production(),
        'checks': {},
        'issues': [],
        'warnings': [],
        'critical': []
    }
    
    # Run all validations
    configs = [
        ('Database', DatabaseConfig),
        ('Security', SecurityConfig),
        ('Stripe', StripeConfig),
        ('CORS', CORSConfig),
        ('RateLimit', RateLimitConfig),
        ('API', APIConfig)
    ]
    
    for name, config_class in configs:
        issues = config_class.validate()
        results['checks'][name] = {
            'passed': len(issues) == 0,
            'issues': issues
        }
        
        for issue in issues:
            if issue.startswith('CRITICAL'):
                results['critical'].append(issue)
            elif issue.startswith('WARNING'):
                results['warnings'].append(issue)
            results['issues'].append(issue)
    
    # Overall status
    results['ready_for_production'] = (
        len(results['critical']) == 0 and
        is_production()
    )
    
    return results

def log_startup_checks():
    """Log startup configuration checks"""
    results = run_production_checks()
    
    logger.info(f"=" * 60)
    logger.info(f"FitTrax+ API Starting - Environment: {results['environment'].upper()}")
    logger.info(f"=" * 60)
    
    if results['critical']:
        for issue in results['critical']:
            logger.error(issue)
    
    if results['warnings']:
        for issue in results['warnings']:
            logger.warning(issue)
    
    if not results['issues']:
        logger.info("✅ All configuration checks passed")
    
    logger.info(f"=" * 60)
    
    return results

# ============================================================================
# MIDDLEWARE HELPERS
# ============================================================================

class HTTPSRedirectMiddleware:
    """Middleware to enforce HTTPS in production"""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and SecurityConfig.ENFORCE_HTTPS:
            # Check for HTTPS indicators (works behind reverse proxy)
            headers = dict(scope.get("headers", []))
            
            x_forwarded_proto = headers.get(b"x-forwarded-proto", b"").decode()
            x_forwarded_ssl = headers.get(b"x-forwarded-ssl", b"").decode()
            
            is_https = (
                x_forwarded_proto == "https" or
                x_forwarded_ssl == "on" or
                scope.get("scheme") == "https"
            )
            
            if not is_https:
                # Return 301 redirect to HTTPS
                host = headers.get(b"host", b"").decode()
                path = scope.get("path", "/")
                query_string = scope.get("query_string", b"").decode()
                
                if query_string:
                    url = f"https://{host}{path}?{query_string}"
                else:
                    url = f"https://{host}{path}"
                
                response_headers = [
                    (b"location", url.encode()),
                    (b"content-type", b"text/plain"),
                ]
                
                await send({
                    "type": "http.response.start",
                    "status": 301,
                    "headers": response_headers,
                })
                await send({
                    "type": "http.response.body",
                    "body": b"Redirecting to HTTPS...",
                })
                return
        
        await self.app(scope, receive, send)

class RequestSizeLimitMiddleware:
    """Middleware to limit request body size"""
    
    def __init__(self, app, max_size: int = 10 * 1024 * 1024):  # 10MB default
        self.app = app
        self.max_size = max_size
    
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope.get("headers", []))
            content_length = headers.get(b"content-length", b"0")
            
            try:
                size = int(content_length.decode())
                if size > self.max_size:
                    response_headers = [
                        (b"content-type", b"application/json"),
                    ]
                    
                    await send({
                        "type": "http.response.start",
                        "status": 413,
                        "headers": response_headers,
                    })
                    await send({
                        "type": "http.response.body",
                        "body": b'{"detail": "Request body too large"}',
                    })
                    return
            except (ValueError, AttributeError):
                pass
        
        await self.app(scope, receive, send)

# ============================================================================
# AUDIT LOG STORAGE
# ============================================================================

class AuditLogStorage:
    """Store audit logs in MongoDB for production"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.audit_logs
    
    async def log(self, event: dict):
        """Store audit log event"""
        try:
            await self.collection.insert_one(event)
        except Exception as e:
            logger.error(f"Failed to store audit log: {e}")
    
    async def get_logs(self, user_id: str = None, action: str = None, 
                       limit: int = 100, skip: int = 0) -> List[dict]:
        """Retrieve audit logs with filtering"""
        query = {}
        if user_id:
            query["user_id"] = user_id
        if action:
            query["action"] = {"$regex": action, "$options": "i"}
        
        cursor = self.collection.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        logs = await cursor.to_list(length=limit)
        
        # Convert ObjectId to string
        for log in logs:
            log["_id"] = str(log["_id"])
        
        return logs
    
    async def setup_indexes(self):
        """Create indexes for efficient querying"""
        await self.collection.create_index("timestamp")
        await self.collection.create_index("user_id")
        await self.collection.create_index("action")
        await self.collection.create_index([("timestamp", -1), ("user_id", 1)])

# Export configurations
__all__ = [
    'get_environment',
    'is_production', 
    'is_development',
    'DatabaseConfig',
    'SecurityConfig',
    'StripeConfig',
    'CORSConfig',
    'RateLimitConfig',
    'APIConfig',
    'run_production_checks',
    'log_startup_checks',
    'HTTPSRedirectMiddleware',
    'RequestSizeLimitMiddleware',
    'AuditLogStorage'
]
