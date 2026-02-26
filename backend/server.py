from fastapi import FastAPI, APIRouter, HTTPException, Request, Body, Depends, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime, timedelta
from dotenv import load_dotenv
from pathlib import Path
import os
import logging
import base64
import re
import certifi

# Load environment variables FIRST before any other imports that use them
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

# Security imports
from security import (
    UserRegister, UserLogin, Token, PasswordChange,
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, decode_token,
    get_current_user, get_current_user_optional,
    sanitize_string, sanitize_search_query, validate_user_id, validate_base64_image,
    AuditLog, get_client_ip, check_rate_limit
)

# Production configuration imports
from config import (
    DatabaseConfig, SecurityConfig, CORSConfig, APIConfig,
    log_startup_checks, AuditLogStorage,
    HTTPSRedirectMiddleware, RequestSizeLimitMiddleware,
    is_production
)

# MongoDB connection with production settings and multi-user support
# Check if using localhost (no SSL needed) or remote MongoDB (SSL needed)
mongo_url = DatabaseConfig.MONGO_URL
is_localhost = 'localhost' in mongo_url or '127.0.0.1' in mongo_url

if is_localhost:
    # Local MongoDB - no SSL
    client = AsyncIOMotorClient(
        mongo_url,
        maxPoolSize=DatabaseConfig.MAX_POOL_SIZE,
        minPoolSize=DatabaseConfig.MIN_POOL_SIZE,
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=20000,
        socketTimeoutMS=60000,
        retryWrites=True,
        retryReads=True,
        maxIdleTimeMS=45000,
        waitQueueTimeoutMS=10000,
    )
else:
    # Remote MongoDB - use SSL with certifi
    client = AsyncIOMotorClient(
        mongo_url,
        maxPoolSize=DatabaseConfig.MAX_POOL_SIZE,
        minPoolSize=DatabaseConfig.MIN_POOL_SIZE,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=20000,
        socketTimeoutMS=60000,
        retryWrites=True,
        retryReads=True,
        maxIdleTimeMS=45000,
        waitQueueTimeoutMS=10000,
    )
db = client[DatabaseConfig.DB_NAME]

# Initialize audit log storage
audit_storage = AuditLogStorage(db)

# Create the main app
app = FastAPI(
    title="FitTrax+ API", 
    version="2.0",
    description="Fitness tracking API with AI-powered features",
    docs_url="/api/docs" if not is_production() else None,  # Disable docs in production
    redoc_url="/api/redoc" if not is_production() else None
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# GLOBAL EXCEPTION HANDLERS (Multi-user stability)
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions gracefully"""
    logger.error(f"Unhandled exception for {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal error occurred. Please try again.",
            "error_type": type(exc).__name__
        }
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

# Middleware for request tracking and timeout
from starlette.middleware.base import BaseHTTPMiddleware
import asyncio

class RequestTimeoutMiddleware(BaseHTTPMiddleware):
    """Middleware to handle request timeouts and prevent hanging connections"""
    
    async def dispatch(self, request: Request, call_next):
        try:
            # Set a 60-second timeout for all requests
            response = await asyncio.wait_for(call_next(request), timeout=60.0)
            return response
        except asyncio.TimeoutError:
            logger.warning(f"Request timeout for {request.url.path}")
            return JSONResponse(
                status_code=504,
                content={"detail": "Request timeout. Please try again."}
            )
        except Exception as e:
            logger.error(f"Request error for {request.url.path}: {str(e)}")
            return JSONResponse(
                status_code=500,
                content={"detail": "An error occurred processing your request."}
            )

app.add_middleware(RequestTimeoutMiddleware)

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

# User Profile Models
class UserProfile(BaseModel):
    user_id: str
    name: str
    age: int
    gender: str  # "male" or "female"
    height_feet: int
    height_inches: int
    weight: float  # in lbs
    goal_weight: float  # in lbs
    activity_level: str  # sedentary, light, moderate, active, very_active
    daily_calorie_goal: Optional[float] = None
    created_at: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())

class UserProfileCreate(BaseModel):
    user_id: str
    name: str
    age: int
    gender: str
    height_feet: int
    height_inches: int
    weight: float
    goal_weight: float
    activity_level: str
    custom_calorie_goal: Optional[int] = None  # User's manually set calorie goal

# Food/Meal Models
class FoodAnalysisRequest(BaseModel):
    user_id: str
    image_base64: str
    meal_category: str  # breakfast, lunch, dinner, snack
    local_date: str = ""  # Local date in YYYY-MM-DD format from client

class FoodAnalysis(BaseModel):
    food_name: str
    calories: float
    protein: float
    carbs: float
    fat: float
    sugar: float = 0
    fiber: float = 0
    portion_size: str

class Meal(BaseModel):
    meal_id: str
    user_id: str
    food_name: str
    calories: float
    protein: float
    carbs: float
    fat: float
    sugar: float = 0
    fiber: float = 0
    meal_category: str
    image_base64: str
    timestamp: str
    date: str = ""  # Local date in YYYY-MM-DD format for easier querying

# Workout Models
class Workout(BaseModel):
    workout_id: str
    user_id: str
    workout_type: str  # cardio, strength, flexibility, sports, other
    duration: int  # minutes
    calories_burned: float
    notes: Optional[str] = ""
    timestamp: str

class WorkoutCreate(BaseModel):
    workout_id: str
    user_id: str
    workout_type: str
    duration: int
    calories_burned: float
    notes: Optional[str] = ""
    timestamp: str

# Water Intake Models
class WaterIntake(BaseModel):
    water_id: str
    user_id: str
    amount: float  # in oz
    timestamp: str

class WaterIntakeCreate(BaseModel):
    water_id: str
    user_id: str
    amount: float
    timestamp: str

# Heart Rate Models
class HeartRate(BaseModel):
    heart_rate_id: str
    user_id: str
    bpm: int
    activity_type: str  # resting, workout, general
    notes: Optional[str] = ""
    timestamp: str

class HeartRateCreate(BaseModel):
    heart_rate_id: str
    user_id: str
    bpm: int
    activity_type: str
    notes: Optional[str] = ""
    timestamp: str

# Workout Plan Models
class Exercise(BaseModel):
    name: str
    sets: Optional[int] = 0
    reps: Optional[str] = ""
    duration: Optional[int] = 0  # minutes
    rest: Optional[int] = 0  # seconds
    notes: Optional[str] = ""

class WorkoutDay(BaseModel):
    day: int
    title: str
    estimated_duration: int  # minutes
    exercises: List[Exercise]

class WorkoutPlan(BaseModel):
    plan_id: str
    name: str
    description: str
    level: str  # beginner, intermediate, advanced
    goal: str  # weight_loss, muscle_gain, endurance, general
    type: str  # strength, cardio, flexibility, mixed
    duration_weeks: int
    days: List[WorkoutDay]
    created_at: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())

# User Plan Models
class UserPlan(BaseModel):
    user_plan_id: str
    user_id: str
    plan_id: str
    start_date: str
    current_day: int
    completed_days: List[int]
    status: str  # active, completed, paused

class UserPlanCreate(BaseModel):
    user_plan_id: str
    user_id: str
    plan_id: str
    start_date: str
    current_day: int = 1
    completed_days: List[int] = []
    status: str = "active"

# Scheduled Workout Models
class ScheduledWorkout(BaseModel):
    scheduled_id: str
    user_id: str
    workout_plan_id: Optional[str] = None
    workout_day: Optional[int] = None
    custom_workout: Optional[dict] = None
    scheduled_date: str
    scheduled_time: str
    reminder_enabled: bool = False
    reminder_minutes_before: int = 15
    completed: bool = False
    notes: Optional[str] = ""

class ScheduledWorkoutCreate(BaseModel):
    scheduled_id: str
    user_id: str
    workout_plan_id: Optional[str] = None
    workout_day: Optional[int] = None
    custom_workout: Optional[dict] = None
    scheduled_date: str
    scheduled_time: str
    reminder_enabled: bool = False
    reminder_minutes_before: int = 15
    completed: bool = False
    notes: Optional[str] = ""

# ============================================================================
# NUTRITION TRACKING MODELS
# ============================================================================

class NutritionGoals(BaseModel):
    user_id: str
    daily_calories: float = 2000
    protein_grams: float = 150
    carbs_grams: float = 200
    fat_grams: float = 65
    protein_percentage: Optional[float] = 30
    carbs_percentage: Optional[float] = 40
    fat_percentage: Optional[float] = 30
    updated_at: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())

class NutritionGoalsUpdate(BaseModel):
    daily_calories: Optional[float] = None
    protein_grams: Optional[float] = None
    carbs_grams: Optional[float] = None
    fat_grams: Optional[float] = None
    protein_percentage: Optional[float] = None
    carbs_percentage: Optional[float] = None
    fat_percentage: Optional[float] = None

class CustomFood(BaseModel):
    food_id: str
    user_id: str
    name: str
    brand: Optional[str] = ""
    serving_size: str = "1 serving"
    calories: float
    protein: float
    carbs: float
    fat: float
    fiber: Optional[float] = 0
    sugar: Optional[float] = 0
    sodium: Optional[float] = 0
    is_favorite: bool = False
    created_at: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())

class CustomFoodCreate(BaseModel):
    name: str
    brand: Optional[str] = ""
    serving_size: str = "1 serving"
    calories: float
    protein: float
    carbs: float
    fat: float
    fiber: Optional[float] = 0
    sugar: Optional[float] = 0
    sodium: Optional[float] = 0

class SavedMeal(BaseModel):
    saved_meal_id: str
    user_id: str
    name: str
    description: Optional[str] = ""
    foods: List[dict]  # List of food items with portions
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float
    meal_category: str  # breakfast, lunch, dinner, snack
    created_at: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())

class QuickLogFood(BaseModel):
    user_id: str
    name: str
    calories: float
    protein: float
    carbs: float
    fat: float
    meal_category: str
    serving_size: Optional[str] = "1 serving"
    servings: Optional[float] = 1.0

class CopyMealRequest(BaseModel):
    user_id: str
    source_date: str
    target_date: str
    meal_category: Optional[str] = None  # If None, copy all meals from that day

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def calculate_bmr(age: int, gender: str, height_feet: int, height_inches: int, weight: float) -> float:
    """Calculate Basal Metabolic Rate using Mifflin-St Jeor equation"""
    # Convert height to cm and weight to kg
    height_cm = (height_feet * 12 + height_inches) * 2.54
    weight_kg = weight * 0.453592
    
    if gender.lower() == "male":
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    else:
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
    
    return bmr

def calculate_daily_calories(bmr: float, activity_level: str, goal_weight: float, current_weight: float) -> float:
    """Calculate daily calorie goal based on BMR, activity level, and goal"""
    # Activity multipliers
    activity_multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9
    }
    
    tdee = bmr * activity_multipliers.get(activity_level, 1.2)
    
    # Adjust for goal
    if goal_weight < current_weight:  # Weight loss
        tdee -= 500  # 500 calorie deficit for ~1 lb/week loss
    elif goal_weight > current_weight:  # Weight gain
        tdee += 300  # 300 calorie surplus for weight gain
    
    return round(tdee)

def calculate_heart_rate_zones(age: int):
    """Calculate heart rate zones based on age"""
    max_hr = 220 - age
    return {
        "max_heart_rate": max_hr,
        "resting": {"min": 50, "max": 100},
        "fat_burn": {"min": int(max_hr * 0.5), "max": int(max_hr * 0.7)},
        "cardio": {"min": int(max_hr * 0.7), "max": int(max_hr * 0.85)},
        "peak": {"min": int(max_hr * 0.85), "max": max_hr}
    }

async def analyze_food_with_ai(image_base64: str) -> FoodAnalysis:
    """Analyze food image using GPT-4o"""
    try:
        api_key = os.getenv('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
        
        # Create chat instance
        chat = LlmChat(
            api_key=api_key,
            session_id=f"food_analysis_{datetime.now().timestamp()}",
            system_message="You are a nutrition expert. Analyze food images and provide accurate nutritional information. Always respond with valid JSON."
        ).with_model("openai", "gpt-4o")
        
        # Create image content
        image_content = ImageContent(image_base64=image_base64)
        
        # Create user message with structured output request
        prompt = """Analyze this food image and provide nutritional information.

IMPORTANT: You MUST respond with ONLY a valid JSON object, no other text.

If you can identify food in the image, return:
{
  "food_name": "name of the food",
  "calories": numeric value,
  "protein": numeric value in grams,
  "carbs": numeric value in grams,
  "fat": numeric value in grams,
  "sugar": numeric value in grams,
  "fiber": numeric value in grams,
  "portion_size": "description like '1 cup' or '200g'",
  "is_food": true
}

If the image does NOT contain food, return:
{
  "food_name": "Not a food item",
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0,
  "sugar": 0,
  "fiber": 0,
  "portion_size": "N/A",
  "is_food": false,
  "message": "This image does not appear to contain food"
}

Provide your best estimate for the portion shown in the image."""
        
        user_message = UserMessage(
            text=prompt,
            file_contents=[image_content]
        )
        
        # Get response
        response = await chat.send_message(user_message)
        logger.info(f"AI Response: {response}")
        
        # Parse response
        import json
        import re
        
        response_text = response.strip()
        
        # Try to extract JSON from the response
        json_data = None
        
        # Method 1: Check for markdown code blocks
        if "```json" in response_text:
            try:
                json_str = response_text.split("```json")[1].split("```")[0].strip()
                json_data = json.loads(json_str)
            except:
                pass
        elif "```" in response_text:
            try:
                json_str = response_text.split("```")[1].split("```")[0].strip()
                json_data = json.loads(json_str)
            except:
                pass
        
        # Method 2: Try to find JSON object in response
        if json_data is None:
            try:
                # Find JSON object pattern
                json_match = re.search(r'\{[^{}]*\}', response_text, re.DOTALL)
                if json_match:
                    json_data = json.loads(json_match.group())
            except:
                pass
        
        # Method 3: Try parsing entire response as JSON
        if json_data is None:
            try:
                json_data = json.loads(response_text)
            except:
                pass
        
        # If still no JSON, check if AI said it's not food
        if json_data is None:
            lower_response = response_text.lower()
            if "not a food" in lower_response or "not food" in lower_response or "unable to" in lower_response or "cannot" in lower_response:
                return FoodAnalysis(
                    food_name="Not a food item",
                    calories=0,
                    protein=0,
                    carbs=0,
                    fat=0,
                    sugar=0,
                    fiber=0,
                    portion_size="N/A"
                )
            else:
                # Fallback - return unknown
                logger.warning(f"Could not parse AI response as JSON: {response_text[:200]}")
                raise HTTPException(status_code=400, detail="Could not identify food in image. Please try again with a clearer photo of food.")
        
        # Check if it's a food item
        if not json_data.get("is_food", True):
            return FoodAnalysis(
                food_name="Not a food item",
                calories=0,
                protein=0,
                carbs=0,
                fat=0,
                sugar=0,
                fiber=0,
                portion_size="N/A"
            )
        
        return FoodAnalysis(
            food_name=json_data.get("food_name", "Unknown Food"),
            calories=float(json_data.get("calories", 0)),
            protein=float(json_data.get("protein", 0)),
            carbs=float(json_data.get("carbs", 0)),
            fat=float(json_data.get("fat", 0)),
            sugar=float(json_data.get("sugar", 0)),
            fiber=float(json_data.get("fiber", 0)),
            portion_size=json_data.get("portion_size", "1 serving")
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing food: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze food image: {str(e)}")

# ============================================================================
# API ENDPOINTS
# ============================================================================

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@api_router.post("/auth/register", response_model=Token)
async def register(request: Request, user_data: UserRegister):
    """Register a new user"""
    try:
        # Rate limit check
        check_rate_limit(request, "auth")
        
        # Check if email already exists
        existing_user = await db.auth_users.find_one({"email": user_data.email})
        if existing_user:
            AuditLog.log_auth("register", user_data.email, get_client_ip(request), False, "Email already exists")
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create user
        import uuid
        user_id = f"user_{uuid.uuid4().hex[:16]}"
        hashed_password = get_password_hash(user_data.password)
        
        user_doc = {
            "user_id": user_id,
            "email": user_data.email,
            "name": sanitize_string(user_data.name, 100),
            "password_hash": hashed_password,
            "created_at": datetime.utcnow().isoformat(),
            "is_active": True
        }
        
        await db.auth_users.insert_one(user_doc)
        
        # Create tokens
        token_data = {"user_id": user_id, "email": user_data.email}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)
        
        AuditLog.log_auth("register", user_data.email, get_client_ip(request), True)
        
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=60 * 24 * 60  # 24 hours in seconds
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=500, detail="Registration failed")

@api_router.post("/auth/login", response_model=Token)
async def login(request: Request, credentials: UserLogin):
    """Login and get access token"""
    try:
        # Rate limit check
        check_rate_limit(request, "auth")
        
        user = await db.auth_users.find_one({"email": credentials.email})
        
        if not user or not verify_password(credentials.password, user["password_hash"]):
            AuditLog.log_auth("login", credentials.email, get_client_ip(request), False, "Invalid credentials")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        if not user.get("is_active", True):
            AuditLog.log_auth("login", credentials.email, get_client_ip(request), False, "Account disabled")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is disabled"
            )
        
        # Create tokens
        token_data = {"user_id": user["user_id"], "email": user["email"]}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)
        
        # Update last login
        await db.auth_users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"last_login": datetime.utcnow().isoformat()}}
        )
        
        AuditLog.log_auth("login", credentials.email, get_client_ip(request), True)
        
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=60 * 24 * 60
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail="Login failed")

@api_router.post("/auth/refresh", response_model=Token)
async def refresh_token_endpoint(request: Request, refresh_token: str = Body(..., embed=True)):
    """Refresh access token"""
    try:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        
        # Verify user still exists and is active
        user = await db.auth_users.find_one({"user_id": payload["user_id"]})
        if not user or not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="User not found or disabled")
        
        # Create new tokens
        token_data = {"user_id": user["user_id"], "email": user["email"]}
        new_access_token = create_access_token(token_data)
        new_refresh_token = create_refresh_token(token_data)
        
        return Token(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            expires_in=60 * 24 * 60
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {str(e)}")
        raise HTTPException(status_code=500, detail="Token refresh failed")

@api_router.post("/auth/change-password")
async def change_password(
    request: Request,
    password_data: PasswordChange,
    current_user: dict = Depends(get_current_user)
):
    """Change user password"""
    try:
        user = await db.auth_users.find_one({"user_id": current_user["user_id"]})
        
        if not verify_password(password_data.current_password, user["password_hash"]):
            AuditLog.log_auth("password_change", current_user["email"], get_client_ip(request), False, "Invalid current password")
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        
        # Update password
        new_hash = get_password_hash(password_data.new_password)
        await db.auth_users.update_one(
            {"user_id": current_user["user_id"]},
            {"$set": {"password_hash": new_hash, "password_changed_at": datetime.utcnow().isoformat()}}
        )
        
        AuditLog.log_auth("password_change", current_user["email"], get_client_ip(request), True)
        
        return {"message": "Password changed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Password change error: {str(e)}")
        raise HTTPException(status_code=500, detail="Password change failed")

@api_router.get("/auth/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
    user = await db.auth_users.find_one({"user_id": current_user["user_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name"),
        "created_at": user.get("created_at"),
        "last_login": user.get("last_login")
    }

# ============================================================================
# USER PROFILE ENDPOINTS
# ============================================================================

@api_router.post("/user/profile")
async def create_or_update_profile(profile_data: UserProfileCreate):
    """Create or update user profile"""
    try:
        # Calculate BMR and daily calorie goal
        bmr = calculate_bmr(
            profile_data.age,
            profile_data.gender,
            profile_data.height_feet,
            profile_data.height_inches,
            profile_data.weight
        )
        
        ai_daily_calories = calculate_daily_calories(
            bmr,
            profile_data.activity_level,
            profile_data.goal_weight,
            profile_data.weight
        )
        
        # Determine effective daily calorie goal
        # Use custom goal if provided, otherwise use AI-calculated goal
        effective_calorie_goal = profile_data.custom_calorie_goal if profile_data.custom_calorie_goal else ai_daily_calories
        
        # Create profile dict with all data
        profile_dict = profile_data.dict()
        profile_dict['daily_calorie_goal'] = ai_daily_calories  # Always store AI goal
        profile_dict['effective_calorie_goal'] = effective_calorie_goal  # Store active goal
        profile_dict['created_at'] = datetime.utcnow().isoformat()
        
        # Upsert to database
        await db.users.update_one(
            {"user_id": profile_data.user_id},
            {"$set": profile_dict},
            upsert=True
        )
        
        return {
            "message": "Profile saved successfully",
            "profile": profile_dict
        }
    
    except Exception as e:
        logger.error(f"Error saving profile: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/user/profile/{user_id}")
async def get_profile(user_id: str):
    """Get user profile"""
    profile = await db.users.find_one({"user_id": user_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Remove MongoDB _id field
    profile.pop('_id', None)
    return profile

class FitnessGoalsRequest(BaseModel):
    user_id: str
    fitness_goals: List[str]

@api_router.post("/profile/fitness-goals")
async def save_fitness_goals(data: FitnessGoalsRequest):
    """Save user's fitness goals and return workout recommendations"""
    try:
        # Map goals to workout types
        goal_workout_mapping = {
            'weight_loss': {'types': ['hiit', 'cardio'], 'focus': 'High intensity, calorie burn'},
            'muscle_gain': {'types': ['strength', 'weight_training'], 'focus': 'Progressive overload'},
            'endurance': {'types': ['cardio', 'circuit'], 'focus': 'Stamina building'},
            'flexibility': {'types': ['yoga', 'stretching'], 'focus': 'Mobility and recovery'},
            'tone': {'types': ['full_body', 'resistance'], 'focus': 'Lean muscle definition'},
            'general': {'types': ['mixed', 'functional'], 'focus': 'Overall fitness'},
        }
        
        # Get recommended workout types based on goals
        recommended_workouts = []
        for goal in data.fitness_goals:
            if goal in goal_workout_mapping:
                recommended_workouts.extend(goal_workout_mapping[goal]['types'])
        
        # Remove duplicates while preserving order
        seen = set()
        unique_workouts = []
        for w in recommended_workouts:
            if w not in seen:
                seen.add(w)
                unique_workouts.append(w)
        
        # Update user profile with fitness goals
        await db.users.update_one(
            {"user_id": data.user_id},
            {
                "$set": {
                    "fitness_goals": data.fitness_goals,
                    "recommended_workout_types": unique_workouts,
                    "goals_updated_at": datetime.utcnow().isoformat()
                }
            },
            upsert=True
        )
        
        return {
            "success": True,
            "fitness_goals": data.fitness_goals,
            "recommended_workout_types": unique_workouts,
            "message": "Fitness goals saved successfully"
        }
    except Exception as e:
        logger.error(f"Error saving fitness goals: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/profile/fitness-goals/{user_id}")
async def get_fitness_goals(user_id: str):
    """Get user's fitness goals and workout recommendations"""
    try:
        profile = await db.users.find_one({"user_id": user_id})
        if not profile:
            return {
                "fitness_goals": [],
                "recommended_workout_types": []
            }
        
        return {
            "fitness_goals": profile.get("fitness_goals", []),
            "recommended_workout_types": profile.get("recommended_workout_types", [])
        }
    except Exception as e:
        logger.error(f"Error getting fitness goals: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# FOOD ANALYSIS ENDPOINTS
# ============================================================================

@api_router.post("/analyze-food")
async def analyze_food(request: Request, food_request: FoodAnalysisRequest):
    """Analyze food image with AI and save meal"""
    try:
        # Validate user_id
        validated_user_id = validate_user_id(food_request.user_id)
        
        # Validate and sanitize image
        validated_image = validate_base64_image(food_request.image_base64, max_size_mb=10)
        
        # Sanitize meal category
        meal_category = sanitize_string(food_request.meal_category, 50)
        if meal_category not in ["breakfast", "lunch", "dinner", "snack"]:
            meal_category = "snack"
        
        # Audit log
        AuditLog.log_data_access(
            validated_user_id, "food_analysis", "create", 
            ip_address=get_client_ip(request)
        )
        
        # Analyze food with AI
        analysis = await analyze_food_with_ai(validated_image)
        
        # Use local_date from request or default to UTC date
        meal_date = food_request.local_date if food_request.local_date else datetime.utcnow().strftime("%Y-%m-%d")
        
        # Create meal record
        meal = Meal(
            meal_id=f"meal_{int(datetime.now().timestamp() * 1000)}",
            user_id=validated_user_id,
            food_name=analysis.food_name,
            calories=analysis.calories,
            protein=analysis.protein,
            carbs=analysis.carbs,
            fat=analysis.fat,
            sugar=analysis.sugar,
            fiber=analysis.fiber,
            meal_category=meal_category,
            image_base64=validated_image,
            timestamp=datetime.utcnow().isoformat(),
            date=meal_date
        )
        
        # Save to database
        await db.meals.insert_one(meal.dict())
        
        return {
            "meal": meal.dict(),
            "analysis": analysis.dict()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in analyze_food: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to analyze food")

# ============================================================================
# ANALYZE INGREDIENT ENDPOINT (AI-powered nutritional analysis)
# ============================================================================

class AnalyzeIngredientRequest(BaseModel):
    ingredient_name: str
    quantity: str = "1 serving"

@api_router.post("/analyze-ingredient")
async def analyze_ingredient(request: AnalyzeIngredientRequest):
    """Analyze a single ingredient using AI to get nutritional information"""
    try:
        api_key = os.getenv('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
        
        prompt = f"""You are a nutrition expert. Analyze the following ingredient and provide accurate nutritional information.

Ingredient: {request.ingredient_name}
Quantity: {request.quantity}

Provide the nutritional values for this specific quantity. Be accurate based on standard nutritional databases (USDA, etc.).

RESPOND ONLY WITH A JSON OBJECT in this exact format, no other text:
{{
    "ingredient": "{request.ingredient_name}",
    "quantity": "{request.quantity}",
    "calories": <number>,
    "protein": <number in grams>,
    "carbs": <number in grams>,
    "fat": <number in grams>,
    "fiber": <number in grams>,
    "sugar": <number in grams>
}}

Important:
- Use realistic values based on the specified quantity
- Round to one decimal place
- If the ingredient is unclear, provide your best estimate for a typical serving
"""

        chat = LlmChat(
            api_key=api_key,
            session_id=f"ingredient_{datetime.utcnow().timestamp()}",
            system_message="You are a nutritional analysis AI. Always respond with valid JSON only."
        ).with_model("openai", "gpt-4o")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse the JSON response
        # Clean up the response to extract JSON
        json_str = response.strip()
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0].strip()
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0].strip()
        
        try:
            nutrition_data = json.loads(json_str)
        except json.JSONDecodeError:
            # Try to extract just the JSON object if there's extra text
            import re
            json_match = re.search(r'\{[^{}]*\}', json_str, re.DOTALL)
            if json_match:
                nutrition_data = json.loads(json_match.group())
            else:
                # Return default values if parsing fails
                logger.warning(f"Failed to parse ingredient nutrition response: {response[:200]}")
                nutrition_data = {
                    "ingredient": request.ingredient_name,
                    "quantity": request.quantity,
                    "calories": 50,
                    "protein": 2,
                    "carbs": 5,
                    "fat": 2,
                }
        
        return {
            "ingredient": nutrition_data.get("ingredient", request.ingredient_name),
            "quantity": nutrition_data.get("quantity", request.quantity),
            "calories": round(nutrition_data.get("calories", 0)),
            "protein": round(nutrition_data.get("protein", 0), 1),
            "carbs": round(nutrition_data.get("carbs", 0), 1),
            "fat": round(nutrition_data.get("fat", 0), 1),
            "fiber": round(nutrition_data.get("fiber", 0), 1),
            "sugar": round(nutrition_data.get("sugar", 0), 1),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing ingredient: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze ingredient: {str(e)}")

# ============================================================================
# MEALS ENDPOINTS
# ============================================================================

@api_router.get("/meals/{user_id}")
async def get_meals(user_id: str, days: int = 7):
    """Get user's meals for the last N days"""
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        cutoff_iso = cutoff_date.isoformat()
        
        meals_cursor = db.meals.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff_iso}
        }).sort("timestamp", -1)
        
        meals = await meals_cursor.to_list(length=1000)
        
        # Remove MongoDB _id field
        for meal in meals:
            meal.pop('_id', None)
        
        return {"meals": meals}
    
    except Exception as e:
        logger.error(f"Error getting meals: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/meals/{meal_id}")
async def delete_meal(meal_id: str):
    """Delete a meal"""
    result = await db.meals.delete_one({"meal_id": meal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meal not found")
    
    return {"message": "Meal deleted successfully"}

class MealUpdate(BaseModel):
    calories: float
    protein: float
    carbs: float
    fat: float

@api_router.put("/meals/{meal_id}")
async def update_meal(meal_id: str, update: MealUpdate):
    """Update meal nutrition values"""
    result = await db.meals.update_one(
        {"meal_id": meal_id},
        {"$set": {
            "calories": update.calories,
            "protein": update.protein,
            "carbs": update.carbs,
            "fat": update.fat,
            "updated_at": datetime.utcnow().isoformat(),
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Meal not found")
    
    return {"message": "Meal updated successfully"}

@api_router.delete("/meals/{meal_id}")
async def delete_meal(meal_id: str):
    """Delete a meal"""
    result = await db.meals.delete_one({"meal_id": meal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meal not found")
    
    return {"message": "Meal deleted successfully"}

@api_router.delete("/meals/clear-day/{user_id}")
async def clear_day_meals(user_id: str, date: str = Query(..., description="Date in YYYY-MM-DD format")):
    """Delete all meals for a user on a specific date"""
    try:
        result = await db.meals.delete_many({
            "user_id": user_id,
            "date": date
        })
        return {
            "message": f"Deleted {result.deleted_count} meals",
            "deleted_count": result.deleted_count,
            "user_id": user_id,
            "date": date
        }
    except Exception as e:
        logger.error(f"Error clearing day meals: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# NUTRITION TRACKING ENDPOINTS
# ============================================================================

# Sample food database for search
FOOD_DATABASE = [
    {"food_id": "fd_001", "name": "Chicken Breast (grilled)", "brand": "Generic", "serving_size": "4 oz (113g)", "calories": 187, "protein": 35, "carbs": 0, "fat": 4, "fiber": 0},
    {"food_id": "fd_002", "name": "Brown Rice (cooked)", "brand": "Generic", "serving_size": "1 cup (195g)", "calories": 216, "protein": 5, "carbs": 45, "fat": 2, "fiber": 4},
    {"food_id": "fd_003", "name": "Broccoli (steamed)", "brand": "Generic", "serving_size": "1 cup (156g)", "calories": 55, "protein": 4, "carbs": 11, "fat": 1, "fiber": 5},
    {"food_id": "fd_004", "name": "Salmon (baked)", "brand": "Generic", "serving_size": "4 oz (113g)", "calories": 234, "protein": 25, "carbs": 0, "fat": 14, "fiber": 0},
    {"food_id": "fd_005", "name": "Egg (large, whole)", "brand": "Generic", "serving_size": "1 large (50g)", "calories": 72, "protein": 6, "carbs": 0, "fat": 5, "fiber": 0},
    {"food_id": "fd_006", "name": "Greek Yogurt (plain)", "brand": "Generic", "serving_size": "1 cup (245g)", "calories": 130, "protein": 22, "carbs": 8, "fat": 0, "fiber": 0},
    {"food_id": "fd_007", "name": "Oatmeal (cooked)", "brand": "Generic", "serving_size": "1 cup (234g)", "calories": 158, "protein": 6, "carbs": 27, "fat": 3, "fiber": 4},
    {"food_id": "fd_008", "name": "Banana (medium)", "brand": "Generic", "serving_size": "1 medium (118g)", "calories": 105, "protein": 1, "carbs": 27, "fat": 0, "fiber": 3},
    {"food_id": "fd_009", "name": "Almonds (raw)", "brand": "Generic", "serving_size": "1 oz (28g)", "calories": 164, "protein": 6, "carbs": 6, "fat": 14, "fiber": 4},
    {"food_id": "fd_010", "name": "Avocado", "brand": "Generic", "serving_size": "1/2 medium (68g)", "calories": 114, "protein": 1, "carbs": 6, "fat": 10, "fiber": 5},
    {"food_id": "fd_011", "name": "Sweet Potato (baked)", "brand": "Generic", "serving_size": "1 medium (114g)", "calories": 103, "protein": 2, "carbs": 24, "fat": 0, "fiber": 4},
    {"food_id": "fd_012", "name": "Quinoa (cooked)", "brand": "Generic", "serving_size": "1 cup (185g)", "calories": 222, "protein": 8, "carbs": 39, "fat": 4, "fiber": 5},
    {"food_id": "fd_013", "name": "Tuna (canned in water)", "brand": "Generic", "serving_size": "3 oz (85g)", "calories": 73, "protein": 17, "carbs": 0, "fat": 1, "fiber": 0},
    {"food_id": "fd_014", "name": "Spinach (raw)", "brand": "Generic", "serving_size": "2 cups (60g)", "calories": 14, "protein": 2, "carbs": 2, "fat": 0, "fiber": 1},
    {"food_id": "fd_015", "name": "Cottage Cheese (low fat)", "brand": "Generic", "serving_size": "1 cup (226g)", "calories": 163, "protein": 28, "carbs": 6, "fat": 2, "fiber": 0},
    {"food_id": "fd_016", "name": "Whole Wheat Bread", "brand": "Generic", "serving_size": "1 slice (43g)", "calories": 81, "protein": 4, "carbs": 14, "fat": 1, "fiber": 2},
    {"food_id": "fd_017", "name": "Turkey Breast (deli)", "brand": "Generic", "serving_size": "3 oz (85g)", "calories": 72, "protein": 13, "carbs": 2, "fat": 1, "fiber": 0},
    {"food_id": "fd_018", "name": "Black Beans (canned)", "brand": "Generic", "serving_size": "1/2 cup (130g)", "calories": 114, "protein": 8, "carbs": 20, "fat": 0, "fiber": 8},
    {"food_id": "fd_019", "name": "Peanut Butter", "brand": "Generic", "serving_size": "2 tbsp (32g)", "calories": 188, "protein": 8, "carbs": 6, "fat": 16, "fiber": 2},
    {"food_id": "fd_020", "name": "Apple (medium)", "brand": "Generic", "serving_size": "1 medium (182g)", "calories": 95, "protein": 0, "carbs": 25, "fat": 0, "fiber": 4},
    {"food_id": "fd_021", "name": "Protein Shake", "brand": "Optimum Nutrition", "serving_size": "1 scoop (31g)", "calories": 120, "protein": 24, "carbs": 3, "fat": 1, "fiber": 1},
    {"food_id": "fd_022", "name": "Ground Beef (93% lean)", "brand": "Generic", "serving_size": "4 oz (113g)", "calories": 170, "protein": 23, "carbs": 0, "fat": 8, "fiber": 0},
    {"food_id": "fd_023", "name": "White Rice (cooked)", "brand": "Generic", "serving_size": "1 cup (158g)", "calories": 206, "protein": 4, "carbs": 45, "fat": 0, "fiber": 1},
    {"food_id": "fd_024", "name": "Milk (2%)", "brand": "Generic", "serving_size": "1 cup (244g)", "calories": 122, "protein": 8, "carbs": 12, "fat": 5, "fiber": 0},
    {"food_id": "fd_025", "name": "Cheese (cheddar)", "brand": "Generic", "serving_size": "1 oz (28g)", "calories": 113, "protein": 7, "carbs": 0, "fat": 9, "fiber": 0},
]

@api_router.get("/nutrition/goals/{user_id}")
async def get_nutrition_goals(user_id: str):
    """Get user's nutrition goals"""
    goals = await db.nutrition_goals.find_one({"user_id": user_id})
    
    if not goals:
        # Get user profile to calculate default goals
        profile = await db.users.find_one({"user_id": user_id})
        
        if profile:
            # Calculate based on profile
            daily_calories = profile.get('daily_calorie_goal', 2000)
            # Default macro split: 30% protein, 40% carbs, 30% fat
            protein_cals = daily_calories * 0.30
            carbs_cals = daily_calories * 0.40
            fat_cals = daily_calories * 0.30
            
            goals = {
                "user_id": user_id,
                "daily_calories": daily_calories,
                "protein_grams": round(protein_cals / 4),  # 4 cal per gram protein
                "carbs_grams": round(carbs_cals / 4),  # 4 cal per gram carbs
                "fat_grams": round(fat_cals / 9),  # 9 cal per gram fat
                "protein_percentage": 30,
                "carbs_percentage": 40,
                "fat_percentage": 30,
            }
        else:
            # Default goals
            goals = {
                "user_id": user_id,
                "daily_calories": 2000,
                "protein_grams": 150,
                "carbs_grams": 200,
                "fat_grams": 65,
                "protein_percentage": 30,
                "carbs_percentage": 40,
                "fat_percentage": 30,
            }
    
    goals.pop('_id', None)
    return {"goals": goals}

@api_router.post("/nutrition/goals/{user_id}")
async def set_nutrition_goals(user_id: str, goals: NutritionGoalsUpdate):
    """Set user's nutrition goals"""
    update_data = {k: v for k, v in goals.dict().items() if v is not None}
    update_data["user_id"] = user_id
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    await db.nutrition_goals.update_one(
        {"user_id": user_id},
        {"$set": update_data},
        upsert=True
    )
    
    return {"message": "Goals updated successfully", "goals": update_data}

@api_router.get("/nutrition/foods/search")
async def search_foods(q: str, user_id: Optional[str] = None):
    """Search food database and user's custom foods"""
    results = []
    
    # Sanitize search query to prevent regex injection
    safe_query = sanitize_search_query(q, max_length=100)
    if not safe_query:
        return {"foods": []}
    
    query_lower = safe_query.lower()
    
    # Search built-in food database
    for food in FOOD_DATABASE:
        if query_lower in food["name"].lower() or query_lower in food.get("brand", "").lower():
            results.append({**food, "source": "database"})
    
    # Search user's custom foods if user_id provided
    if user_id:
        validated_user_id = validate_user_id(user_id)
        custom_foods_cursor = db.custom_foods.find({
            "user_id": validated_user_id,
            "$or": [
                {"name": {"$regex": safe_query, "$options": "i"}},
                {"brand": {"$regex": safe_query, "$options": "i"}}
            ]
        })
        custom_foods = await custom_foods_cursor.to_list(length=50)
        for food in custom_foods:
            food.pop('_id', None)
            food["source"] = "custom"
            results.append(food)
    
    # Sort by relevance (exact matches first)
    results.sort(key=lambda x: (
        0 if query_lower == x["name"].lower() else 
        1 if x["name"].lower().startswith(query_lower) else 2
    ))
    
    return {"foods": results[:30]}

@api_router.get("/nutrition/foods/frequent/{user_id}")
async def get_frequent_foods(user_id: str, limit: int = 10):
    """Get user's most frequently logged foods"""
    # Aggregate meals to find frequent foods
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": "$food_name",
            "count": {"$sum": 1},
            "avg_calories": {"$avg": "$calories"},
            "avg_protein": {"$avg": "$protein"},
            "avg_carbs": {"$avg": "$carbs"},
            "avg_fat": {"$avg": "$fat"},
            "last_logged": {"$max": "$timestamp"}
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit}
    ]
    
    frequent = await db.meals.aggregate(pipeline).to_list(length=limit)
    
    foods = [{
        "name": item["_id"],
        "log_count": item["count"],
        "calories": round(item["avg_calories"]),
        "protein": round(item["avg_protein"]),
        "carbs": round(item["avg_carbs"]),
        "fat": round(item["avg_fat"]),
        "last_logged": item["last_logged"]
    } for item in frequent]
    
    return {"frequent_foods": foods}

@api_router.post("/nutrition/custom-foods/{user_id}")
async def create_custom_food(user_id: str, food: CustomFoodCreate):
    """Create a custom food item"""
    custom_food = CustomFood(
        food_id=f"custom_{int(datetime.now().timestamp() * 1000)}",
        user_id=user_id,
        **food.dict()
    )
    
    await db.custom_foods.insert_one(custom_food.dict())
    return {"message": "Custom food created", "food": custom_food.dict()}

@api_router.get("/nutrition/custom-foods/{user_id}")
async def get_custom_foods(user_id: str):
    """Get user's custom foods"""
    foods_cursor = db.custom_foods.find({"user_id": user_id}).sort("created_at", -1)
    foods = await foods_cursor.to_list(length=100)
    
    for food in foods:
        food.pop('_id', None)
    
    return {"custom_foods": foods}

@api_router.delete("/nutrition/custom-foods/{food_id}")
async def delete_custom_food(food_id: str):
    """Delete a custom food"""
    result = await db.custom_foods.delete_one({"food_id": food_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Custom food not found")
    
    return {"message": "Custom food deleted"}

@api_router.post("/nutrition/quick-log")
async def quick_log_food(food: QuickLogFood):
    """Quick log a food item"""
    meal = Meal(
        meal_id=f"meal_{int(datetime.now().timestamp() * 1000)}",
        user_id=food.user_id,
        food_name=food.name,
        calories=food.calories * food.servings,
        protein=food.protein * food.servings,
        carbs=food.carbs * food.servings,
        fat=food.fat * food.servings,
        meal_category=food.meal_category,
        image_base64="",
        timestamp=datetime.utcnow().isoformat()
    )
    
    await db.meals.insert_one(meal.dict())
    return {"message": "Food logged successfully", "meal": meal.dict()}

@api_router.post("/nutrition/copy-meals")
async def copy_meals(request: CopyMealRequest):
    """Copy meals from one day to another"""
    # Get meals from source date
    source_start = f"{request.source_date}T00:00:00"
    source_end = f"{request.source_date}T23:59:59"
    
    query = {
        "user_id": request.user_id,
        "timestamp": {"$gte": source_start, "$lte": source_end}
    }
    
    if request.meal_category:
        query["meal_category"] = request.meal_category
    
    source_meals = await db.meals.find(query).to_list(length=100)
    
    if not source_meals:
        raise HTTPException(status_code=404, detail="No meals found on source date")
    
    # Create new meals for target date
    new_meals = []
    for meal in source_meals:
        new_meal = {
            "meal_id": f"meal_{int(datetime.now().timestamp() * 1000)}_{len(new_meals)}",
            "user_id": request.user_id,
            "food_name": meal["food_name"],
            "calories": meal["calories"],
            "protein": meal["protein"],
            "carbs": meal["carbs"],
            "fat": meal["fat"],
            "meal_category": meal["meal_category"],
            "image_base64": meal.get("image_base64", ""),
            "timestamp": f"{request.target_date}T{meal['timestamp'].split('T')[1] if 'T' in meal['timestamp'] else '12:00:00'}"
        }
        new_meals.append(new_meal)
    
    if new_meals:
        await db.meals.insert_many(new_meals)
    
    return {"message": f"Copied {len(new_meals)} meals", "meals_copied": len(new_meals)}

@api_router.get("/nutrition/daily-summary/{user_id}")
async def get_daily_summary(user_id: str, date: Optional[str] = None):
    """Get detailed daily nutrition summary"""
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Query by date field first (for newer records), fall back to timestamp for older records
    start_time = f"{date}T00:00:00"
    end_time = f"{date}T23:59:59"
    
    # Get meals for the day - check both date field and timestamp for backwards compatibility
    meals_cursor = db.meals.find({
        "user_id": user_id,
        "$or": [
            {"date": date},  # New format with date field
            {"date": {"$exists": False}, "timestamp": {"$gte": start_time, "$lte": end_time}}  # Old format
        ]
    }).sort("timestamp", 1)
    
    meals = await meals_cursor.to_list(length=100)
    
    # Get user's goals
    goals_result = await get_nutrition_goals(user_id)
    goals = goals_result["goals"]
    
    # Calculate totals
    totals = {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0,
        "sugar": 0
    }
    
    # Group by meal category
    by_category = {
        "breakfast": {"meals": [], "totals": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "sugar": 0}},
        "lunch": {"meals": [], "totals": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "sugar": 0}},
        "dinner": {"meals": [], "totals": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "sugar": 0}},
        "snack": {"meals": [], "totals": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "sugar": 0}},
    }
    
    for meal in meals:
        meal.pop('_id', None)
        category = meal.get("meal_category", "snack")
        if category not in by_category:
            category = "snack"
        
        by_category[category]["meals"].append(meal)
        by_category[category]["totals"]["calories"] += meal.get("calories", 0)
        by_category[category]["totals"]["protein"] += meal.get("protein", 0)
        by_category[category]["totals"]["carbs"] += meal.get("carbs", 0)
        by_category[category]["totals"]["fat"] += meal.get("fat", 0)
        by_category[category]["totals"]["sugar"] += meal.get("sugar", 0)
        
        totals["calories"] += meal.get("calories", 0)
        totals["protein"] += meal.get("protein", 0)
        totals["carbs"] += meal.get("carbs", 0)
        totals["fat"] += meal.get("fat", 0)
        totals["sugar"] += meal.get("sugar", 0)
    
    # Add sugar goal default if not present
    sugar_goal = goals.get("sugar_grams", 50)
    
    # Calculate remaining
    remaining = {
        "calories": goals["daily_calories"] - totals["calories"],
        "protein": goals["protein_grams"] - totals["protein"],
        "carbs": goals["carbs_grams"] - totals["carbs"],
        "fat": goals["fat_grams"] - totals["fat"],
        "sugar": sugar_goal - totals["sugar"]
    }
    
    # Calculate progress percentages
    progress = {
        "calories": min(100, round((totals["calories"] / goals["daily_calories"]) * 100)) if goals["daily_calories"] > 0 else 0,
        "protein": min(100, round((totals["protein"] / goals["protein_grams"]) * 100)) if goals["protein_grams"] > 0 else 0,
        "carbs": min(100, round((totals["carbs"] / goals["carbs_grams"]) * 100)) if goals["carbs_grams"] > 0 else 0,
        "fat": min(100, round((totals["fat"] / goals["fat_grams"]) * 100)) if goals["fat_grams"] > 0 else 0,
        "sugar": min(100, round((totals["sugar"] / sugar_goal) * 100)) if sugar_goal > 0 else 0
    }
    
    # Add sugar_grams to goals for frontend
    goals["sugar_grams"] = sugar_goal
    
    return {
        "date": date,
        "totals": totals,
        "goals": goals,
        "remaining": remaining,
        "progress": progress,
        "by_category": by_category,
        "meal_count": len(meals)
    }

@api_router.get("/nutrition/weekly-summary/{user_id}")
async def get_weekly_summary(user_id: str):
    """Get weekly nutrition trends"""
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=7)
    
    # Get goals
    goals_result = await get_nutrition_goals(user_id)
    goals = goals_result["goals"]
    
    # Get meals for the week
    meals_cursor = db.meals.find({
        "user_id": user_id,
        "timestamp": {
            "$gte": start_date.strftime("%Y-%m-%dT00:00:00"),
            "$lte": end_date.strftime("%Y-%m-%dT23:59:59")
        }
    })
    
    meals = await meals_cursor.to_list(length=1000)
    
    # Group by day
    daily_data = {}
    for i in range(7):
        day = (end_date - timedelta(days=i)).strftime("%Y-%m-%d")
        daily_data[day] = {
            "calories": 0,
            "protein": 0,
            "carbs": 0,
            "fat": 0,
            "meal_count": 0
        }
    
    for meal in meals:
        day = meal["timestamp"][:10]
        if day in daily_data:
            daily_data[day]["calories"] += meal.get("calories", 0)
            daily_data[day]["protein"] += meal.get("protein", 0)
            daily_data[day]["carbs"] += meal.get("carbs", 0)
            daily_data[day]["fat"] += meal.get("fat", 0)
            daily_data[day]["meal_count"] += 1
    
    # Calculate averages
    days_with_data = sum(1 for d in daily_data.values() if d["meal_count"] > 0)
    
    averages = {
        "calories": round(sum(d["calories"] for d in daily_data.values()) / max(days_with_data, 1)),
        "protein": round(sum(d["protein"] for d in daily_data.values()) / max(days_with_data, 1)),
        "carbs": round(sum(d["carbs"] for d in daily_data.values()) / max(days_with_data, 1)),
        "fat": round(sum(d["fat"] for d in daily_data.values()) / max(days_with_data, 1))
    }
    
    # Goal adherence (days within 10% of goal)
    adherence = {
        "calories": sum(1 for d in daily_data.values() if d["meal_count"] > 0 and abs(d["calories"] - goals["daily_calories"]) <= goals["daily_calories"] * 0.1),
        "protein": sum(1 for d in daily_data.values() if d["meal_count"] > 0 and abs(d["protein"] - goals["protein_grams"]) <= goals["protein_grams"] * 0.1)
    }
    
    return {
        "daily_data": daily_data,
        "averages": averages,
        "goals": goals,
        "days_logged": days_with_data,
        "adherence": adherence,
        "insights": generate_nutrition_insights(averages, goals, daily_data)
    }

def generate_nutrition_insights(averages: dict, goals: dict, daily_data: dict) -> List[str]:
    """Generate actionable nutrition insights"""
    insights = []
    
    # Calorie insights
    cal_diff = averages["calories"] - goals["daily_calories"]
    if cal_diff > 200:
        insights.append(f"You're averaging {abs(round(cal_diff))} calories over your daily goal. Consider smaller portions or lower-calorie alternatives.")
    elif cal_diff < -300:
        insights.append(f"You're averaging {abs(round(cal_diff))} calories under your goal. Make sure you're eating enough to fuel your activities.")
    else:
        insights.append("Great job! Your calorie intake is on track with your goals.")
    
    # Protein insights
    if averages["protein"] < goals["protein_grams"] * 0.8:
        insights.append("Your protein intake is lower than recommended. Try adding more lean meats, eggs, or legumes.")
    elif averages["protein"] >= goals["protein_grams"]:
        insights.append("Excellent protein intake! This supports muscle maintenance and recovery.")
    
    # Consistency insight
    days_logged = sum(1 for d in daily_data.values() if d["meal_count"] > 0)
    if days_logged >= 6:
        insights.append("You've been consistent with tracking! Keep it up for best results.")
    elif days_logged < 4:
        insights.append("Try to log meals more consistently for accurate insights and better progress tracking.")
    
    return insights

@api_router.post("/nutrition/saved-meals/{user_id}")
async def create_saved_meal(user_id: str, name: str, description: str, foods: List[dict], meal_category: str):
    """Save a meal/recipe for quick logging"""
    # Calculate totals
    total_calories = sum(f.get("calories", 0) for f in foods)
    total_protein = sum(f.get("protein", 0) for f in foods)
    total_carbs = sum(f.get("carbs", 0) for f in foods)
    total_fat = sum(f.get("fat", 0) for f in foods)
    
    saved_meal = SavedMeal(
        saved_meal_id=f"saved_{int(datetime.now().timestamp() * 1000)}",
        user_id=user_id,
        name=name,
        description=description,
        foods=foods,
        total_calories=total_calories,
        total_protein=total_protein,
        total_carbs=total_carbs,
        total_fat=total_fat,
        meal_category=meal_category
    )
    
    await db.saved_meals.insert_one(saved_meal.dict())
    return {"message": "Meal saved", "saved_meal": saved_meal.dict()}

@api_router.get("/nutrition/saved-meals/{user_id}")
async def get_saved_meals(user_id: str):
    """Get user's saved meals"""
    meals_cursor = db.saved_meals.find({"user_id": user_id}).sort("created_at", -1)
    meals = await meals_cursor.to_list(length=50)
    
    for meal in meals:
        meal.pop('_id', None)
    
    return {"saved_meals": meals}

# ============================================================================
# WORKOUTS ENDPOINTS
# ============================================================================

@api_router.post("/workouts")
async def add_workout(workout: WorkoutCreate):
    """Add a workout"""
    await db.workouts.insert_one(workout.dict())
    return {"message": "Workout added successfully", "workout": workout.dict()}

@api_router.get("/workouts/user/{user_id}")
async def get_workouts(user_id: str, days: int = 7):
    """Get user's workouts"""
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    cutoff_iso = cutoff_date.isoformat()
    
    workouts_cursor = db.workouts.find({
        "user_id": user_id,
        "timestamp": {"$gte": cutoff_iso}
    }).sort("timestamp", -1)
    
    workouts = await workouts_cursor.to_list(length=1000)
    
    for workout in workouts:
        workout.pop('_id', None)
    
    return {"workouts": workouts}

@api_router.delete("/workouts/item/{workout_id}")
async def delete_workout(workout_id: str):
    """Delete a workout"""
    result = await db.workouts.delete_one({"workout_id": workout_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    return {"message": "Workout deleted successfully"}

# ============================================================================
# WATER INTAKE ENDPOINTS
# ============================================================================

@api_router.post("/water")
async def add_water(water: WaterIntakeCreate):
    """Add water intake"""
    await db.water_intake.insert_one(water.dict())
    return {"message": "Water intake added successfully", "water": water.dict()}

@api_router.delete("/water/{water_id}")
async def delete_water(water_id: str):
    """Delete a water intake entry"""
    result = await db.water_intake.delete_one({"water_id": water_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Water entry not found")
    return {"message": "Water entry deleted successfully", "water_id": water_id}

@api_router.get("/water/{user_id}")
async def get_water_intake(user_id: str, days: int = 7):
    """Get user's water intake"""
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    cutoff_iso = cutoff_date.isoformat()
    
    water_cursor = db.water_intake.find({
        "user_id": user_id,
        "timestamp": {"$gte": cutoff_iso}
    }).sort("timestamp", -1)
    
    water_intake = await water_cursor.to_list(length=1000)
    
    for water in water_intake:
        water.pop('_id', None)
    
    return {"water_intake": water_intake}

# ============================================================================
# HEART RATE ENDPOINTS
# ============================================================================

@api_router.post("/heart-rate")
async def add_heart_rate(heart_rate: HeartRateCreate):
    """Add heart rate measurement"""
    if heart_rate.bpm < 30 or heart_rate.bpm > 250:
        raise HTTPException(status_code=400, detail="BPM must be between 30 and 250")
    
    await db.heart_rate.insert_one(heart_rate.dict())
    return {"message": "Heart rate added successfully", "heart_rate": heart_rate.dict()}

@api_router.get("/heart-rate/{user_id}")
async def get_heart_rate(user_id: str, days: int = 7):
    """Get user's heart rate measurements"""
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    cutoff_iso = cutoff_date.isoformat()
    
    hr_cursor = db.heart_rate.find({
        "user_id": user_id,
        "timestamp": {"$gte": cutoff_iso}
    }).sort("timestamp", -1)
    
    heart_rates = await hr_cursor.to_list(length=1000)
    
    for hr in heart_rates:
        hr.pop('_id', None)
    
    return {"heart_rates": heart_rates}

@api_router.get("/heart-rate/zones/{user_id}")
async def get_heart_rate_zones(user_id: str):
    """Get heart rate zones for user"""
    profile = await db.users.find_one({"user_id": user_id})
    
    # Use default age of 30 if profile doesn't exist or age not set
    age = 30  # Default age
    if profile and 'age' in profile and profile['age']:
        age = profile['age']
    
    zones = calculate_heart_rate_zones(age)
    return zones

@api_router.delete("/heart-rate/{heart_rate_id}")
async def delete_heart_rate(heart_rate_id: str):
    """Delete a heart rate entry"""
    try:
        result = await db.heart_rate.delete_one({"heart_rate_id": heart_rate_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Heart rate entry not found")
        return {"message": "Heart rate entry deleted successfully", "heart_rate_id": heart_rate_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting heart rate: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# WORKOUT PLANS ENDPOINTS
# ============================================================================

@api_router.post("/workout-plans/init")
async def initialize_workout_plans():
    """Initialize default workout plans"""
    
    # Check if plans already exist
    existing_count = await db.workout_plans.count_documents({})
    if existing_count > 0:
        return {"message": "Workout plans already initialized", "count": existing_count}
    
    default_plans = [
        {
            "plan_id": "plan_beginner_weight_loss",
            "name": "Beginner Weight Loss",
            "description": "4-week program combining cardio and light strength training",
            "level": "beginner",
            "goal": "weight_loss",
            "type": "mixed",
            "duration_weeks": 4,
            "days": [
                {
                    "day": 1,
                    "title": "Full Body & Cardio",
                    "estimated_duration": 30,
                    "exercises": [
                        {"name": "Warm-up Walk", "sets": 0, "reps": "", "duration": 5, "rest": 0, "notes": "Easy pace"},
                        {"name": "Bodyweight Squats", "sets": 3, "reps": "10", "duration": 0, "rest": 30, "notes": ""},
                        {"name": "Push-ups (modified)", "sets": 3, "reps": "8", "duration": 0, "rest": 30, "notes": ""},
                        {"name": "Walking", "sets": 0, "reps": "", "duration": 15, "rest": 0, "notes": "Moderate pace"},
                    ]
                },
                {
                    "day": 2,
                    "title": "Rest or Light Activity",
                    "estimated_duration": 20,
                    "exercises": [
                        {"name": "Gentle Stretching", "sets": 0, "reps": "", "duration": 20, "rest": 0, "notes": "Focus on major muscle groups"}
                    ]
                },
                {
                    "day": 3,
                    "title": "Cardio Focus",
                    "estimated_duration": 35,
                    "exercises": [
                        {"name": "Brisk Walking", "sets": 0, "reps": "", "duration": 30, "rest": 0, "notes": ""},
                        {"name": "Cool-down Stretch", "sets": 0, "reps": "", "duration": 5, "rest": 0, "notes": ""}
                    ]
                }
            ],
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "plan_id": "plan_intermediate_muscle_gain",
            "name": "Intermediate Muscle Gain",
            "description": "6-week strength-focused program for muscle building",
            "level": "intermediate",
            "goal": "muscle_gain",
            "type": "strength",
            "duration_weeks": 6,
            "days": [
                {
                    "day": 1,
                    "title": "Upper Body Push",
                    "estimated_duration": 45,
                    "exercises": [
                        {"name": "Bench Press", "sets": 4, "reps": "8-10", "duration": 0, "rest": 90, "notes": ""},
                        {"name": "Overhead Press", "sets": 3, "reps": "10", "duration": 0, "rest": 60, "notes": ""},
                        {"name": "Dips", "sets": 3, "reps": "12", "duration": 0, "rest": 60, "notes": ""},
                        {"name": "Tricep Extensions", "sets": 3, "reps": "12", "duration": 0, "rest": 45, "notes": ""}
                    ]
                },
                {
                    "day": 2,
                    "title": "Lower Body",
                    "estimated_duration": 50,
                    "exercises": [
                        {"name": "Squats", "sets": 4, "reps": "8-10", "duration": 0, "rest": 120, "notes": ""},
                        {"name": "Romanian Deadlifts", "sets": 3, "reps": "10", "duration": 0, "rest": 90, "notes": ""},
                        {"name": "Leg Press", "sets": 3, "reps": "12", "duration": 0, "rest": 60, "notes": ""},
                        {"name": "Calf Raises", "sets": 4, "reps": "15", "duration": 0, "rest": 45, "notes": ""}
                    ]
                },
                {
                    "day": 3,
                    "title": "Rest Day",
                    "estimated_duration": 0,
                    "exercises": [
                        {"name": "Active Recovery", "sets": 0, "reps": "", "duration": 20, "rest": 0, "notes": "Light walk or stretching"}
                    ]
                }
            ],
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "plan_id": "plan_advanced_endurance",
            "name": "Advanced Endurance",
            "description": "8-week high-intensity cardio and HIIT program",
            "level": "advanced",
            "goal": "endurance",
            "type": "cardio",
            "duration_weeks": 8,
            "days": [
                {
                    "day": 1,
                    "title": "HIIT Training",
                    "estimated_duration": 40,
                    "exercises": [
                        {"name": "Warm-up Jog", "sets": 0, "reps": "", "duration": 5, "rest": 0, "notes": ""},
                        {"name": "Sprint Intervals", "sets": 8, "reps": "30s work, 30s rest", "duration": 0, "rest": 30, "notes": "Max effort"},
                        {"name": "Burpees", "sets": 3, "reps": "15", "duration": 0, "rest": 60, "notes": ""},
                        {"name": "Cool-down", "sets": 0, "reps": "", "duration": 5, "rest": 0, "notes": ""}
                    ]
                },
                {
                    "day": 2,
                    "title": "Long Run",
                    "estimated_duration": 60,
                    "exercises": [
                        {"name": "Distance Run", "sets": 0, "reps": "", "duration": 60, "rest": 0, "notes": "Steady pace"}
                    ]
                },
                {
                    "day": 3,
                    "title": "Active Recovery",
                    "estimated_duration": 30,
                    "exercises": [
                        {"name": "Easy Cycling or Swimming", "sets": 0, "reps": "", "duration": 30, "rest": 0, "notes": "Low intensity"}
                    ]
                }
            ],
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "plan_id": "plan_beginner_flexibility",
            "name": "Beginner Flexibility",
            "description": "4-week yoga and stretching program",
            "level": "beginner",
            "goal": "general",
            "type": "flexibility",
            "duration_weeks": 4,
            "days": [
                {
                    "day": 1,
                    "title": "Morning Yoga Flow",
                    "estimated_duration": 30,
                    "exercises": [
                        {"name": "Sun Salutations", "sets": 3, "reps": "5 rounds", "duration": 0, "rest": 30, "notes": ""},
                        {"name": "Warrior Sequence", "sets": 2, "reps": "Hold 30s each", "duration": 0, "rest": 30, "notes": ""},
                        {"name": "Seated Forward Fold", "sets": 0, "reps": "", "duration": 2, "rest": 0, "notes": "Deep breathing"}
                    ]
                },
                {
                    "day": 2,
                    "title": "Rest Day",
                    "estimated_duration": 0,
                    "exercises": [
                        {"name": "Meditation", "sets": 0, "reps": "", "duration": 10, "rest": 0, "notes": "Focus on breathing"}
                    ]
                },
                {
                    "day": 3,
                    "title": "Full Body Stretch",
                    "estimated_duration": 25,
                    "exercises": [
                        {"name": "Neck Stretches", "sets": 0, "reps": "", "duration": 3, "rest": 0, "notes": ""},
                        {"name": "Shoulder Rolls", "sets": 3, "reps": "10", "duration": 0, "rest": 15, "notes": ""},
                        {"name": "Hip Stretches", "sets": 0, "reps": "", "duration": 5, "rest": 0, "notes": ""},
                        {"name": "Hamstring Stretch", "sets": 0, "reps": "", "duration": 3, "rest": 0, "notes": ""}
                    ]
                }
            ],
            "created_at": datetime.utcnow().isoformat()
        }
    ]
    
    await db.workout_plans.insert_many(default_plans)
    
    return {"message": "Workout plans initialized successfully", "count": len(default_plans)}

@api_router.get("/workout-plans")
async def get_workout_plans(
    level: Optional[str] = None,
    goal: Optional[str] = None,
    type: Optional[str] = None
):
    """Get all workout plans with optional filters"""
    query = {}
    if level:
        query["level"] = level
    if goal:
        query["goal"] = goal
    if type:
        query["type"] = type
    
    plans_cursor = db.workout_plans.find(query)
    plans = await plans_cursor.to_list(length=100)
    
    for plan in plans:
        plan.pop('_id', None)
    
    return {"plans": plans}

class AIWorkoutPlanRequest(BaseModel):
    user_id: Optional[str] = None
    goals: List[str]
    goal_descriptions: str
    workout_types: List[str]

@api_router.post("/ai/generate-workout-plan")
async def generate_ai_workout_plan(request: AIWorkoutPlanRequest):
    """Generate a personalized AI workout plan based on fitness goals"""
    try:
        # Use a default user_id if not provided
        effective_user_id = request.user_id or f"temp_user_{int(datetime.utcnow().timestamp())}"
        
        # Map goals to workout plan parameters
        goal_plan_mapping = {
            'weight_loss': {'focus': 'fat burning', 'cardio_ratio': 0.6, 'strength_ratio': 0.4},
            'muscle_gain': {'focus': 'hypertrophy', 'cardio_ratio': 0.2, 'strength_ratio': 0.8},
            'endurance': {'focus': 'cardiovascular', 'cardio_ratio': 0.7, 'strength_ratio': 0.3},
            'flexibility': {'focus': 'mobility', 'cardio_ratio': 0.3, 'strength_ratio': 0.3, 'flexibility_ratio': 0.4},
            'tone': {'focus': 'definition', 'cardio_ratio': 0.4, 'strength_ratio': 0.6},
            'general': {'focus': 'overall fitness', 'cardio_ratio': 0.5, 'strength_ratio': 0.5},
        }
        
        # Determine primary goal
        primary_goal = request.goals[0] if request.goals else 'general'
        goal_config = goal_plan_mapping.get(primary_goal, goal_plan_mapping['general'])
        
        # Determine workout type
        workout_type = request.workout_types[0] if request.workout_types else 'mixed'
        
        # Generate plan name
        goal_names = {
            'weight_loss': 'Fat Burner',
            'muscle_gain': 'Muscle Builder',
            'endurance': 'Endurance Builder',
            'flexibility': 'Flexibility Focus',
            'tone': 'Total Body Tone',
            'general': 'Complete Fitness'
        }
        plan_name = f"AI {goal_names.get(primary_goal, 'Custom')} Program"
        
        # Generate workout days based on goals
        workout_days = []
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        if primary_goal == 'weight_loss':
            workout_days = [
                {'day': 1, 'name': 'HIIT Cardio', 'exercises': ['Jumping Jacks', 'Burpees', 'Mountain Climbers', 'High Knees', 'Box Jumps'], 'duration_minutes': 30},
                {'day': 2, 'name': 'Strength + Cardio', 'exercises': ['Squats', 'Lunges', 'Push-ups', 'Rowing', 'Plank'], 'duration_minutes': 45},
                {'day': 3, 'name': 'Active Recovery', 'exercises': ['Light Jogging', 'Stretching', 'Yoga'], 'duration_minutes': 30},
                {'day': 4, 'name': 'HIIT Cardio', 'exercises': ['Sprint Intervals', 'Jumping Lunges', 'Burpees', 'Jump Rope'], 'duration_minutes': 30},
                {'day': 5, 'name': 'Full Body Circuit', 'exercises': ['Deadlifts', 'Pull-ups', 'Dips', 'Core Work'], 'duration_minutes': 45},
            ]
        elif primary_goal == 'muscle_gain':
            workout_days = [
                {'day': 1, 'name': 'Push Day', 'exercises': ['Bench Press', 'Shoulder Press', 'Tricep Dips', 'Chest Flyes', 'Lateral Raises'], 'duration_minutes': 60},
                {'day': 2, 'name': 'Pull Day', 'exercises': ['Deadlifts', 'Rows', 'Pull-ups', 'Bicep Curls', 'Face Pulls'], 'duration_minutes': 60},
                {'day': 3, 'name': 'Rest', 'exercises': ['Light Stretching'], 'duration_minutes': 20},
                {'day': 4, 'name': 'Legs', 'exercises': ['Squats', 'Leg Press', 'Lunges', 'Leg Curls', 'Calf Raises'], 'duration_minutes': 60},
                {'day': 5, 'name': 'Push Day', 'exercises': ['Incline Press', 'Arnold Press', 'Skull Crushers', 'Cable Flyes'], 'duration_minutes': 60},
                {'day': 6, 'name': 'Pull Day', 'exercises': ['Barbell Rows', 'Lat Pulldowns', 'Hammer Curls', 'Shrugs'], 'duration_minutes': 60},
            ]
        elif primary_goal == 'endurance':
            workout_days = [
                {'day': 1, 'name': 'Long Run', 'exercises': ['45-60 min steady-state run'], 'duration_minutes': 60},
                {'day': 2, 'name': 'Cross Training', 'exercises': ['Cycling', 'Swimming', 'Rowing'], 'duration_minutes': 45},
                {'day': 3, 'name': 'Tempo Run', 'exercises': ['Warm-up', 'Tempo pace', 'Cool-down'], 'duration_minutes': 40},
                {'day': 4, 'name': 'Recovery', 'exercises': ['Light jog', 'Stretching', 'Foam rolling'], 'duration_minutes': 30},
                {'day': 5, 'name': 'Interval Training', 'exercises': ['400m repeats', 'Hill sprints'], 'duration_minutes': 45},
                {'day': 6, 'name': 'Long Run', 'exercises': ['Progressive long run'], 'duration_minutes': 75},
            ]
        elif primary_goal == 'flexibility':
            workout_days = [
                {'day': 1, 'name': 'Yoga Flow', 'exercises': ['Sun Salutations', 'Warrior poses', 'Balance poses'], 'duration_minutes': 45},
                {'day': 2, 'name': 'Deep Stretch', 'exercises': ['Hip openers', 'Hamstring stretches', 'Shoulder stretches'], 'duration_minutes': 30},
                {'day': 3, 'name': 'Pilates', 'exercises': ['Core work', 'Controlled movements', 'Breath work'], 'duration_minutes': 45},
                {'day': 4, 'name': 'Active Recovery', 'exercises': ['Light walking', 'Gentle stretching'], 'duration_minutes': 30},
                {'day': 5, 'name': 'Power Yoga', 'exercises': ['Vinyasa flow', 'Strength poses', 'Inversions'], 'duration_minutes': 60},
            ]
        else:  # tone or general
            workout_days = [
                {'day': 1, 'name': 'Upper Body', 'exercises': ['Push-ups', 'Rows', 'Shoulder Press', 'Bicep Curls', 'Tricep Extensions'], 'duration_minutes': 45},
                {'day': 2, 'name': 'Cardio', 'exercises': ['Running', 'Jump Rope', 'Cycling'], 'duration_minutes': 35},
                {'day': 3, 'name': 'Lower Body', 'exercises': ['Squats', 'Lunges', 'Glute Bridges', 'Leg Raises'], 'duration_minutes': 45},
                {'day': 4, 'name': 'HIIT', 'exercises': ['Burpees', 'Mountain Climbers', 'Jump Squats', 'Plank Jacks'], 'duration_minutes': 30},
                {'day': 5, 'name': 'Full Body', 'exercises': ['Deadlifts', 'Pull-ups', 'Dips', 'Core Circuit'], 'duration_minutes': 50},
            ]
        
        # Create the plan
        plan_id = f"ai_plan_{effective_user_id}_{int(datetime.utcnow().timestamp())}"
        
        plan = {
            'plan_id': plan_id,
            'user_id': effective_user_id,
            'name': plan_name,
            'description': f"A personalized {goal_config['focus']} program tailored to your goals: {request.goal_descriptions}. This AI-generated plan is designed to maximize results based on your fitness objectives.",
            'type': workout_type,
            'level': 'intermediate',
            'duration_weeks': 4,
            'goal': primary_goal,
            'days': workout_days,
            'created_at': datetime.utcnow().isoformat(),
            'is_ai_generated': True,
            'fitness_goals': request.goals,
        }
        
        # Save to database
        await db.workout_plans.insert_one(plan)
        
        # Also save to user's custom plans
        await db.user_workout_plans.update_one(
            {'user_id': effective_user_id, 'plan_id': plan_id},
            {'$set': {
                'user_id': effective_user_id,
                'plan_id': plan_id,
                'start_date': datetime.utcnow().strftime('%Y-%m-%d'),
                'current_day': 1,
                'completed_days': [],
                'status': 'active',
            }},
            upsert=True
        )
        
        # Remove MongoDB _id before returning
        plan.pop('_id', None)
        
        return {
            'success': True,
            'plan': plan,
            'message': 'AI workout plan generated successfully'
        }
        
    except Exception as e:
        logger.error(f"Error generating AI workout plan: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/workout-plans/{plan_id}")
async def get_workout_plan(plan_id: str):
    """Get a single workout plan"""
    plan = await db.workout_plans.find_one({"plan_id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Workout plan not found")
    
    plan.pop('_id', None)
    return plan

@api_router.delete("/workout-plans/{plan_id}")
async def delete_workout_plan(plan_id: str):
    """Delete a workout plan"""
    try:
        result = await db.workout_plans.delete_one({"plan_id": plan_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Workout plan not found")
        
        # Also delete any user_plans referencing this plan
        await db.user_workout_plans.delete_many({"plan_id": plan_id})
        
        return {"success": True, "message": "Plan deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting workout plan: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# USER PLANS ENDPOINTS
# ============================================================================

@api_router.post("/user-plans")
async def start_workout_plan(user_plan: UserPlanCreate):
    """Start a workout plan for a user"""
    # Verify plan exists
    plan = await db.workout_plans.find_one({"plan_id": user_plan.plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Workout plan not found")
    
    await db.user_plans.insert_one(user_plan.dict())
    
    return {"message": "Workout plan started successfully", "user_plan": user_plan.dict()}

@api_router.get("/user-plans/{user_id}")
async def get_user_plans(user_id: str, status: Optional[str] = None):
    """Get user's workout plans"""
    query = {"user_id": user_id}
    if status:
        query["status"] = status
    
    user_plans_cursor = db.user_plans.find(query)
    user_plans = await user_plans_cursor.to_list(length=100)
    
    # Populate plan details
    for up in user_plans:
        up.pop('_id', None)
        plan = await db.workout_plans.find_one({"plan_id": up["plan_id"]})
        if plan:
            plan.pop('_id', None)
            up["plan_details"] = plan
    
    return {"user_plans": user_plans}

@api_router.put("/user-plans/{user_plan_id}")
async def update_user_plan(
    user_plan_id: str,
    current_day: Optional[int] = None,
    completed_days: Optional[str] = None,
    status: Optional[str] = None
):
    """Update user plan progress"""
    update_data = {}
    
    if current_day is not None:
        update_data["current_day"] = current_day
    
    if completed_days is not None:
        import json
        try:
            update_data["completed_days"] = json.loads(completed_days)
        except:
            raise HTTPException(status_code=400, detail="Invalid completed_days format")
    
    if status:
        update_data["status"] = status
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.user_plans.update_one(
        {"user_plan_id": user_plan_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User plan not found")
    
    return {"message": "User plan updated successfully"}

# ============================================================================
# SCHEDULED WORKOUTS ENDPOINTS
# ============================================================================

@api_router.post("/custom-workout-plans")
async def create_custom_workout_plan(plan: dict = Body(...)):
    """Create a custom workout plan for scheduling"""
    user_id = plan.get('user_id')
    plan_id = plan.get('plan_id')
    name = plan.get('name')
    exercises = plan.get('exercises', [])
    
    custom_plan = {
        "plan_id": plan_id,
        "user_id": user_id,
        "name": name,
        "exercises": exercises,
        "type": "custom",
        "created_at": datetime.utcnow().isoformat()
    }
    
    await db.custom_workout_plans.insert_one(custom_plan)
    return {"message": "Custom workout plan created", "plan": custom_plan}

@api_router.get("/custom-workout-plans/{user_id}")
async def get_custom_workout_plans(user_id: str):
    """Get user's custom workout plans"""
    plans = await db.custom_workout_plans.find({"user_id": user_id}).to_list(length=100)
    for plan in plans:
        plan.pop('_id', None)
    return {"plans": plans}

@api_router.post("/scheduled-workouts")
async def schedule_workout(scheduled: ScheduledWorkoutCreate):
    """Schedule a workout"""
    await db.scheduled_workouts.insert_one(scheduled.dict())
    return {"message": "Workout scheduled successfully", "scheduled_workout": scheduled.dict()}

@api_router.get("/scheduled-workouts/{user_id}")
async def get_scheduled_workouts(
    user_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get scheduled workouts"""
    query = {"user_id": user_id}
    
    if start_date and end_date:
        query["scheduled_date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["scheduled_date"] = {"$gte": start_date}
    elif end_date:
        query["scheduled_date"] = {"$lte": end_date}
    
    scheduled_cursor = db.scheduled_workouts.find(query).sort("scheduled_date", 1)
    scheduled_workouts = await scheduled_cursor.to_list(length=1000)
    
    for sw in scheduled_workouts:
        sw.pop('_id', None)
    
    return {"scheduled_workouts": scheduled_workouts}

@api_router.put("/scheduled-workouts/{scheduled_id}")
async def update_scheduled_workout(
    scheduled_id: str,
    completed: Optional[bool] = None,
    notes: Optional[str] = None
):
    """Update scheduled workout"""
    update_data = {}
    if completed is not None:
        update_data["completed"] = completed
    if notes is not None:
        update_data["notes"] = notes
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.scheduled_workouts.update_one(
        {"scheduled_id": scheduled_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Scheduled workout not found")
    
    return {"message": "Scheduled workout updated successfully"}

@api_router.delete("/scheduled-workouts/{scheduled_id}")
async def delete_scheduled_workout(scheduled_id: str):
    """Delete scheduled workout - handles both scheduled_id and workout_id"""
    # Try to delete by scheduled_id first
    result = await db.scheduled_workouts.delete_one({"scheduled_id": scheduled_id})
    
    # If not found, try workout_id (for manual workout log entries)
    if result.deleted_count == 0:
        result = await db.scheduled_workouts.delete_one({"workout_id": scheduled_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scheduled workout not found")
    
    return {"message": "Scheduled workout deleted successfully"}

class RescheduleWorkout(BaseModel):
    new_date: str

@api_router.put("/scheduled-workouts/{scheduled_id}/reschedule")
async def reschedule_workout(scheduled_id: str, data: RescheduleWorkout):
    """Reschedule a workout to a new date"""
    result = await db.scheduled_workouts.update_one(
        {"scheduled_id": scheduled_id},
        {"$set": {"scheduled_date": data.new_date, "updated_at": datetime.utcnow().isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Scheduled workout not found")
    
    return {"message": "Workout rescheduled successfully", "new_date": data.new_date}

@api_router.get("/scheduled-workouts/reminders/{user_id}")
async def get_upcoming_reminders(user_id: str):
    """Get upcoming workout reminders (next 24 hours)"""
    now = datetime.utcnow()
    tomorrow = now + timedelta(days=1)
    
    scheduled_cursor = db.scheduled_workouts.find({
        "user_id": user_id,
        "reminder_enabled": True,
        "completed": False,
        "scheduled_date": {"$gte": now.strftime("%Y-%m-%d"), "$lte": tomorrow.strftime("%Y-%m-%d")}
    }).sort("scheduled_date", 1)
    
    reminders = await scheduled_cursor.to_list(length=100)
    
    for reminder in reminders:
        reminder.pop('_id', None)
    
    return {"reminders": reminders}

# ============================================================================
# DASHBOARD ENDPOINT
# ============================================================================

@api_router.get("/dashboard/{user_id}")
async def get_dashboard(user_id: str, local_date: Optional[str] = None):
    """Get comprehensive dashboard data"""
    try:
        # Get user profile
        profile = await db.users.find_one({"user_id": user_id})
        if profile:
            profile.pop('_id', None)
        
        # Get today's data - use local date from client for timezone handling
        # If local_date is provided, use it; otherwise fall back to UTC date
        if local_date:
            query_date = local_date
        else:
            query_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        today_utc = datetime.utcnow()
        today_start = today_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        today_iso = today_start.isoformat()
        
        # Today's meals - check date field (local date) first, then timestamp for backwards compatibility
        meals_cursor = db.meals.find({
            "user_id": user_id,
            "$or": [
                {"date": query_date},
                {"date": {"$exists": False}, "timestamp": {"$gte": today_iso}}
            ]
        })
        today_meals = await meals_cursor.to_list(length=1000)
        
        calories_consumed = sum(m.get('calories', 0) for m in today_meals)
        protein = sum(m.get('protein', 0) for m in today_meals)
        carbs = sum(m.get('carbs', 0) for m in today_meals)
        fat = sum(m.get('fat', 0) for m in today_meals)
        sugar = sum(m.get('sugar', 0) for m in today_meals)
        fiber = sum(m.get('fiber', 0) for m in today_meals)
        
        # Today's workouts
        workouts_cursor = db.workouts.find({
            "user_id": user_id,
            "timestamp": {"$gte": today_iso}
        })
        today_workouts = await workouts_cursor.to_list(length=1000)
        
        calories_burned = sum(w['calories_burned'] for w in today_workouts)
        
        # Today's water
        water_cursor = db.water_intake.find({
            "user_id": user_id,
            "timestamp": {"$gte": today_iso}
        })
        today_water = await water_cursor.to_list(length=1000)
        
        water_intake = sum(w['amount'] for w in today_water)
        
        # Today's heart rate
        hr_cursor = db.heart_rate.find({
            "user_id": user_id,
            "timestamp": {"$gte": today_iso}
        })
        today_hr = await hr_cursor.to_list(length=1000)
        
        avg_hr = sum(h['bpm'] for h in today_hr) / len(today_hr) if today_hr else 0
        
        # Weekly data
        week_ago = datetime.utcnow() - timedelta(days=7)
        week_iso = week_ago.isoformat()
        
        weekly_meals_cursor = db.meals.find({
            "user_id": user_id,
            "timestamp": {"$gte": week_iso}
        }).sort("timestamp", -1)
        weekly_meals = await weekly_meals_cursor.to_list(length=1000)
        
        weekly_workouts_cursor = db.workouts.find({
            "user_id": user_id,
            "timestamp": {"$gte": week_iso}
        }).sort("timestamp", -1)
        weekly_workouts = await weekly_workouts_cursor.to_list(length=1000)
        
        weekly_hr_cursor = db.heart_rate.find({
            "user_id": user_id,
            "timestamp": {"$gte": week_iso}
        }).sort("timestamp", -1)
        weekly_heart_rates = await weekly_hr_cursor.to_list(length=1000)
        
        # Remove MongoDB _id fields
        for item in weekly_meals:
            item.pop('_id', None)
        for item in weekly_workouts:
            item.pop('_id', None)
        for item in weekly_heart_rates:
            item.pop('_id', None)
        
        # Calculate net calories
        net_calories = calories_consumed - calories_burned
        calorie_goal = profile.get('custom_calorie_goal') or profile.get('daily_calorie_goal', 2000) if profile else 2000
        
        return {
            "profile": profile,
            "today": {
                "calories_consumed": round(calories_consumed, 1),
                "calories_burned": round(calories_burned, 1),
                "net_calories": round(net_calories, 1),
                "calories_goal": calorie_goal,
                "protein": round(protein, 1),
                "carbs": round(carbs, 1),
                "fat": round(fat, 1),
                "sugar": round(sugar, 1),
                "fiber": round(fiber, 1),
                "water_intake": round(water_intake, 1),
                "meals_count": len(today_meals),
                "workouts_count": len(today_workouts),
                "avg_heart_rate": round(avg_hr, 1),
                "heart_rate_count": len(today_hr)
            },
            "weekly_meals": weekly_meals,
            "weekly_workouts": weekly_workouts,
            "weekly_heart_rates": weekly_heart_rates
        }
    
    except Exception as e:
        logger.error(f"Error getting dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# RUNNING DISTANCE TRACKER ENDPOINTS
# ============================================================================

class RunCreate(BaseModel):
    run_id: str
    user_id: str
    distance: float = 0.0  # in kilometers
    duration: int = 0  # in seconds
    average_pace: float = 0.0  # min/km
    calories_burned: float = 0.0
    route_data: Optional[list] = []  # GPS coordinates
    notes: Optional[str] = ""
    timestamp: str

@api_router.post("/runs")
async def add_run(run: RunCreate):
    """Add a running session"""
    await db.runs.insert_one(run.dict())
    return {"message": "Run added successfully", "run": run.dict()}

@api_router.get("/runs/{user_id}")
async def get_runs(user_id: str, days: int = 30):
    """Get user's running sessions"""
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    cutoff_iso = cutoff_date.isoformat()
    
    runs_cursor = db.runs.find({
        "user_id": user_id,
        "timestamp": {"$gte": cutoff_iso}
    }).sort("timestamp", -1)
    
    runs = await runs_cursor.to_list(length=1000)
    
    for run in runs:
        run.pop('_id', None)
    
    return {"runs": runs}

@api_router.delete("/runs/{run_id}")
async def delete_run(run_id: str):
    """Delete a run"""
    result = await db.runs.delete_one({"run_id": run_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Run not found")
    
    return {"message": "Run deleted successfully"}

@api_router.get("/runs/stats/{user_id}")
async def get_running_stats(user_id: str):
    """Get weekly and monthly running statistics"""
    try:
        # Get all runs for calculations
        week_ago = datetime.utcnow() - timedelta(days=7)
        month_ago = datetime.utcnow() - timedelta(days=30)
        
        week_iso = week_ago.isoformat()
        month_iso = month_ago.isoformat()
        
        # Weekly runs
        weekly_runs_cursor = db.runs.find({
            "user_id": user_id,
            "timestamp": {"$gte": week_iso}
        })
        weekly_runs = await weekly_runs_cursor.to_list(length=1000)
        
        # Monthly runs
        monthly_runs_cursor = db.runs.find({
            "user_id": user_id,
            "timestamp": {"$gte": month_iso}
        })
        monthly_runs = await monthly_runs_cursor.to_list(length=1000)
        
        # Calculate weekly stats
        weekly_distance = sum(r['distance'] for r in weekly_runs)
        weekly_duration = sum(r['duration'] for r in weekly_runs)
        weekly_calories = sum(r['calories_burned'] for r in weekly_runs)
        weekly_count = len(weekly_runs)
        weekly_avg_pace = sum(r['average_pace'] for r in weekly_runs) / weekly_count if weekly_count > 0 else 0
        
        # Calculate monthly stats
        monthly_distance = sum(r['distance'] for r in monthly_runs)
        monthly_duration = sum(r['duration'] for r in monthly_runs)
        monthly_calories = sum(r['calories_burned'] for r in monthly_runs)
        monthly_count = len(monthly_runs)
        monthly_avg_pace = sum(r['average_pace'] for r in monthly_runs) / monthly_count if monthly_count > 0 else 0
        
        return {
            "weekly": {
                "total_distance": round(weekly_distance, 2),
                "total_duration": weekly_duration,
                "total_calories": round(weekly_calories, 1),
                "run_count": weekly_count,
                "average_pace": round(weekly_avg_pace, 2),
                "average_distance": round(weekly_distance / weekly_count, 2) if weekly_count > 0 else 0
            },
            "monthly": {
                "total_distance": round(monthly_distance, 2),
                "total_duration": monthly_duration,
                "total_calories": round(monthly_calories, 1),
                "run_count": monthly_count,
                "average_pace": round(monthly_avg_pace, 2),
                "average_distance": round(monthly_distance / monthly_count, 2) if monthly_count > 0 else 0
            }
        }
    
    except Exception as e:
        logger.error(f"Error getting running stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# MEMBERSHIP & SUBSCRIPTION ENDPOINTS
# ============================================================================

import stripe
import time

# Initialize Stripe with test key
stripe.api_key = os.getenv('STRIPE_SECRET_KEY', '')
STRIPE_PRICE_ID = os.getenv('STRIPE_PRICE_ID', '')

# Helper function to check if Stripe is properly configured
def is_stripe_configured() -> bool:
    """Check if Stripe API key is valid and configured"""
    key = stripe.api_key
    if not key:
        return False
    if 'REPLACE' in key or 'placeholder' in key.lower():
        return False
    if not (key.startswith('sk_test_') or key.startswith('sk_live_')):
        return False
    if len(key) < 30:  # Valid Stripe keys are much longer
        return False
    return True

# Membership Models
class MembershipCustomerCreate(BaseModel):
    user_id: str
    email: str
    name: str

class SubscriptionCreate(BaseModel):
    user_id: str
    price_id: Optional[str] = None

class MembershipStatus(BaseModel):
    user_id: str
    is_premium: bool
    is_trial: bool
    trial_days_remaining: int
    subscription_status: str
    subscription_ends_at: Optional[str] = None
    features: List[str]

# Premium Features List
PREMIUM_FEATURES = [
    "personalized_workouts",
    "ai_workout_generation",
    "nutrition_integration",
    "meal_planning",
    "gamification",
    "badges_challenges",
    "advanced_analytics",
    "wearable_integration",
    "diverse_workouts",
    "accessibility_features",
    "multi_language",
    "peptide_calculator",
    "ai_body_scan",        # Body scan is Premium
    "food_scanning"        # Food scanning is Premium
]

FREE_FEATURES = [
    "basic_tracking",
    "water_tracking",
    "heart_rate_logging",
    "step_tracking"
]

# Stripe Payment Link for checkout
STRIPE_PAYMENT_LINK = "https://buy.stripe.com/3cI00jagF69o65Y0Qn9Ve01"

@api_router.post("/membership/create-customer")
async def create_membership_customer(request: MembershipCustomerCreate):
    """Create or retrieve a Stripe customer for the user"""
    try:
        # Check if customer already exists
        existing = await db.membership_customers.find_one({"user_id": request.user_id})
        if existing:
            return {
                "customer_id": existing["stripe_customer_id"],
                "user_id": request.user_id,
                "email": existing["email"]
            }
        
        # Check if Stripe key is configured
        if stripe.api_key == 'sk_test_placeholder':
            # Mock mode - create local record only
            mock_customer_id = f"cus_mock_{request.user_id}"
            await db.membership_customers.insert_one({
                "user_id": request.user_id,
                "email": request.email,
                "name": request.name,
                "stripe_customer_id": mock_customer_id,
                "mock_mode": True,
                "created_at": datetime.utcnow().isoformat()
            })
            return {
                "customer_id": mock_customer_id,
                "user_id": request.user_id,
                "email": request.email,
                "mock_mode": True
            }
        
        # Create Stripe customer
        customer = stripe.Customer.create(
            email=request.email,
            name=request.name,
            metadata={"user_id": request.user_id, "app": "fittraxx"}
        )
        
        # Store in MongoDB
        await db.membership_customers.insert_one({
            "user_id": request.user_id,
            "email": request.email,
            "name": request.name,
            "stripe_customer_id": customer.id,
            "mock_mode": False,
            "created_at": datetime.utcnow().isoformat()
        })
        
        return {
            "customer_id": customer.id,
            "user_id": request.user_id,
            "email": request.email
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating customer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/membership/start-trial")
async def start_free_trial(request: SubscriptionCreate):
    """Start a 3-day free trial for the user"""
    try:
        # Get or create customer
        customer = await db.membership_customers.find_one({"user_id": request.user_id})
        
        if not customer:
            # Auto-create customer for trial
            logger.info(f"Auto-creating customer for trial: {request.user_id}")
            
            if not is_stripe_configured():
                # Mock mode - create mock customer
                mock_customer_id = f"cus_mock_{request.user_id}_{int(time.time())}"
                customer = {
                    "user_id": request.user_id,
                    "stripe_customer_id": mock_customer_id,
                    "mock_mode": True,
                    "created_at": datetime.utcnow().isoformat()
                }
                await db.membership_customers.insert_one(customer)
            else:
                # Real Stripe - create real customer
                stripe_customer = stripe.Customer.create(
                    metadata={"user_id": request.user_id}
                )
                customer = {
                    "user_id": request.user_id,
                    "stripe_customer_id": stripe_customer.id,
                    "mock_mode": False,
                    "created_at": datetime.utcnow().isoformat()
                }
                await db.membership_customers.insert_one(customer)
        
        # Check if already has subscription
        existing_sub = await db.subscriptions.find_one({
            "user_id": request.user_id,
            "status": {"$in": ["trialing", "active"]}
        })
        if existing_sub:
            raise HTTPException(status_code=400, detail="User already has an active subscription or trial")
        
        trial_end = datetime.utcnow() + timedelta(days=3)
        
        # Use mock mode if Stripe is not configured
        if customer.get("mock_mode", False) or not is_stripe_configured():
            subscription_id = f"sub_mock_{request.user_id}_{int(time.time())}"
            
            await db.subscriptions.insert_one({
                "subscription_id": subscription_id,
                "user_id": request.user_id,
                "stripe_customer_id": customer["stripe_customer_id"],
                "status": "trialing",
                "trial_start": datetime.utcnow().isoformat(),
                "trial_end": trial_end.isoformat(),
                "mock_mode": True,
                "created_at": datetime.utcnow().isoformat()
            })
            
            return {
                "subscription_id": subscription_id,
                "status": "trialing",
                "trial_ends_at": trial_end.isoformat(),
                "mock_mode": True,
                "message": "3-day free trial started! Configure Stripe keys for real payments."
            }
        
        # Real Stripe subscription with trial
        price_id = request.price_id or STRIPE_PRICE_ID
        
        # Auto-detect price if not set
        if not price_id:
            try:
                # Get active products
                products = stripe.Product.list(limit=1, active=True)
                if products.data:
                    product_id = products.data[0].id
                    prices = stripe.Price.list(product=product_id, active=True, limit=10)
                    # Find annual price or use first available
                    for price in prices.data:
                        if price.recurring and price.recurring.interval == 'year':
                            price_id = price.id
                            break
                    if not price_id and prices.data:
                        price_id = prices.data[0].id
                    logger.info(f"Auto-detected price ID for trial: {price_id}")
            except Exception as e:
                logger.error(f"Error auto-detecting price: {e}")
        
        if not price_id:
            raise HTTPException(status_code=400, detail="No price configured. Please set STRIPE_PRICE_ID or create a product in Stripe.")
        
        subscription = stripe.Subscription.create(
            customer=customer["stripe_customer_id"],
            items=[{"price": price_id}],
            trial_period_days=3,
        )
        
        await db.subscriptions.insert_one({
            "subscription_id": subscription.id,
            "user_id": request.user_id,
            "stripe_customer_id": customer["stripe_customer_id"],
            "status": subscription.status,
            "trial_start": datetime.fromtimestamp(subscription.trial_start).isoformat() if subscription.trial_start else None,
            "trial_end": datetime.fromtimestamp(subscription.trial_end).isoformat() if subscription.trial_end else None,
            "mock_mode": False,
            "created_at": datetime.utcnow().isoformat()
        })
        
        return {
            "subscription_id": subscription.id,
            "status": subscription.status,
            "trial_ends_at": datetime.fromtimestamp(subscription.trial_end).isoformat() if subscription.trial_end else None,
            "message": "3-day free trial started successfully!"
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error starting trial: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting trial: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/membership/status/{user_id}")
async def get_membership_status(user_id: str):
    """Get the membership status for a user"""
    try:
        # Get latest subscription
        subscription = await db.subscriptions.find_one(
            {"user_id": user_id},
            sort=[("created_at", -1)]
        )
        
        if not subscription:
            return {
                "user_id": user_id,
                "is_premium": False,
                "is_trial": False,
                "trial_days_remaining": 0,
                "subscription_status": "none",
                "subscription_ends_at": None,
                "features": FREE_FEATURES
            }
        
        # Calculate trial days remaining
        trial_days_remaining = 0
        is_trial = subscription["status"] == "trialing"
        is_premium = subscription["status"] in ["trialing", "active"]
        
        if is_trial and subscription.get("trial_end"):
            trial_end = datetime.fromisoformat(subscription["trial_end"].replace("Z", ""))
            remaining = (trial_end - datetime.utcnow()).days
            trial_days_remaining = max(0, remaining)
            
            # Check if trial has expired
            if trial_days_remaining == 0 and is_trial:
                await db.subscriptions.update_one(
                    {"subscription_id": subscription["subscription_id"]},
                    {"$set": {"status": "trial_expired"}}
                )
                is_premium = False
                is_trial = False
        
        features = PREMIUM_FEATURES + FREE_FEATURES if is_premium else FREE_FEATURES
        
        return {
            "user_id": user_id,
            "is_premium": is_premium,
            "is_trial": is_trial,
            "trial_days_remaining": trial_days_remaining,
            "subscription_status": subscription["status"],
            "subscription_ends_at": subscription.get("trial_end") or subscription.get("current_period_end"),
            "features": features
        }
    except Exception as e:
        logger.error(f"Error getting membership status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/membership/subscribe")
async def subscribe_annual(request: SubscriptionCreate):
    """Subscribe to the $25/year annual plan"""
    try:
        customer = await db.membership_customers.find_one({"user_id": request.user_id})
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Mock mode
        if customer.get("mock_mode", False) or stripe.api_key == 'sk_test_placeholder':
            subscription_id = f"sub_annual_{request.user_id}_{int(time.time())}"
            period_end = datetime.utcnow() + timedelta(days=365)
            
            # Update or create subscription
            await db.subscriptions.update_one(
                {"user_id": request.user_id},
                {"$set": {
                    "subscription_id": subscription_id,
                    "status": "active",
                    "current_period_start": datetime.utcnow().isoformat(),
                    "current_period_end": period_end.isoformat(),
                    "plan": "annual",
                    "amount": 2500,
                    "mock_mode": True,
                    "updated_at": datetime.utcnow().isoformat()
                }},
                upsert=True
            )
            
            return {
                "subscription_id": subscription_id,
                "status": "active",
                "plan": "annual",
                "amount": "$25.00/year",
                "period_ends_at": period_end.isoformat(),
                "mock_mode": True,
                "message": "Annual subscription activated! (Mock mode)"
            }
        
        # Real Stripe subscription
        price_id = request.price_id or STRIPE_PRICE_ID
        subscription = stripe.Subscription.create(
            customer=customer["stripe_customer_id"],
            items=[{"price": price_id}],
            payment_behavior="default_incomplete",
            payment_settings={"save_default_payment_method": "on_subscription"},
            expand=["latest_invoice.payment_intent"]
        )
        
        await db.subscriptions.update_one(
            {"user_id": request.user_id},
            {"$set": {
                "subscription_id": subscription.id,
                "status": subscription.status,
                "current_period_start": datetime.fromtimestamp(subscription.current_period_start).isoformat(),
                "current_period_end": datetime.fromtimestamp(subscription.current_period_end).isoformat(),
                "plan": "annual",
                "mock_mode": False,
                "updated_at": datetime.utcnow().isoformat()
            }},
            upsert=True
        )
        
        return {
            "subscription_id": subscription.id,
            "status": subscription.status,
            "client_secret": subscription.latest_invoice.payment_intent.client_secret if subscription.latest_invoice and subscription.latest_invoice.payment_intent else None
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error subscribing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/membership/cancel/{user_id}")
async def cancel_subscription(user_id: str):
    """Cancel an active subscription"""
    try:
        subscription = await db.subscriptions.find_one({
            "user_id": user_id,
            "status": {"$in": ["trialing", "active"]}
        })
        
        if not subscription:
            raise HTTPException(status_code=404, detail="No active subscription found")
        
        # Mock mode
        if subscription.get("mock_mode", False):
            await db.subscriptions.update_one(
                {"subscription_id": subscription["subscription_id"]},
                {"$set": {
                    "status": "canceled",
                    "canceled_at": datetime.utcnow().isoformat()
                }}
            )
            return {"status": "canceled", "message": "Subscription canceled (Mock mode)"}
        
        # Cancel in Stripe
        canceled = stripe.Subscription.delete(subscription["subscription_id"])
        
        await db.subscriptions.update_one(
            {"subscription_id": subscription["subscription_id"]},
            {"$set": {
                "status": "canceled",
                "canceled_at": datetime.utcnow().isoformat()
            }}
        )
        
        return {"status": "canceled", "subscription_id": canceled.id}
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error canceling: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error canceling subscription: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/membership/pricing")
async def get_pricing():
    """Get membership pricing information"""
    return {
        "plan": "annual",
        "name": "FitTrax+ Premium",
        "price": 50.00,
        "currency": "USD",
        "interval": "year",
        "trial_days": 3,
        "payment_link": STRIPE_PAYMENT_LINK,
        "features": [
            "AI Food Scanner & Analysis",
            "AI Body Composition Scan",
            "AI-Personalized Workouts",
            "AI Nutrition Coach",
            "AI Recipe Generator",
            "AI Groceries Planner",
            "Custom Meal Planning & Nutrition",
            "Gamification: Badges & Challenges",
            "Advanced Progress Analytics",
            "Wearable Device Integration",
            "Diverse Workout Library (Yoga, HIIT, Dance, Martial Arts)",
            "Peptide Calculator, Tracking and FitTrax Peptide AI",
            "Multi-Language Support (EN, ES, DE)",
            "Accessibility Features"
        ],
        "free_features": [
            "Basic Activity Tracking",
            "Water Intake Logging",
            "Heart Rate Monitoring",
            "Step Tracking"
        ]
    }

class CheckoutSessionRequest(BaseModel):
    user_id: str
    email: Optional[str] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None

@api_router.post("/membership/create-checkout-session")
async def create_checkout_session(request: CheckoutSessionRequest):
    """Create a Stripe Checkout Session for subscription"""
    try:
        # Check if Stripe is properly configured
        if not is_stripe_configured():
            # Mock mode - start trial directly without Stripe
            logger.info("Stripe not configured - using mock mode for trial")
            
            trial_end = datetime.utcnow() + timedelta(days=3)
            subscription_id = f"sub_mock_{request.user_id}_{int(time.time())}"
            
            # Create mock customer if needed
            existing_customer = await db.membership_customers.find_one({"user_id": request.user_id})
            if not existing_customer:
                await db.membership_customers.insert_one({
                    "user_id": request.user_id,
                    "email": request.email,
                    "stripe_customer_id": f"cus_mock_{request.user_id}",
                    "mock_mode": True,
                    "created_at": datetime.utcnow().isoformat()
                })
            
            # Check existing subscription
            existing_sub = await db.subscriptions.find_one({
                "user_id": request.user_id,
                "status": {"$in": ["trialing", "active"]}
            })
            
            if existing_sub:
                return {
                    "mock_mode": True,
                    "message": "You already have an active subscription or trial!",
                    "subscription_id": existing_sub.get("subscription_id"),
                    "status": existing_sub.get("status")
                }
            
            # Create mock subscription
            await db.subscriptions.insert_one({
                "subscription_id": subscription_id,
                "user_id": request.user_id,
                "stripe_customer_id": f"cus_mock_{request.user_id}",
                "status": "trialing",
                "trial_start": datetime.utcnow().isoformat(),
                "trial_end": trial_end.isoformat(),
                "mock_mode": True,
                "created_at": datetime.utcnow().isoformat()
            })
            
            return {
                "mock_mode": True,
                "subscription_id": subscription_id,
                "status": "trialing",
                "trial_ends_at": trial_end.isoformat(),
                "message": "🎉 3-day free trial started! Configure Stripe keys for real payments."
            }
        
        # Real Stripe checkout session
        price_id = os.getenv('STRIPE_PRICE_ID')
        
        # If no price ID configured, create one dynamically
        if not price_id:
            # First, try to find existing product
            products = stripe.Product.list(limit=1, active=True)
            
            if products.data:
                product = products.data[0]
            else:
                # Create product
                product = stripe.Product.create(
                    name="FitTrax+ Premium",
                    description="Annual subscription with AI workouts, body scan, peptide calculator, and more",
                )
            
            # Check for existing price
            prices = stripe.Price.list(product=product.id, active=True, limit=10)
            annual_price = None
            for p in prices.data:
                if p.recurring and p.recurring.interval == 'year' and p.unit_amount == 2500:
                    annual_price = p
                    break
            
            if not annual_price:
                # Create price: $25/year with 3-day trial
                annual_price = stripe.Price.create(
                    product=product.id,
                    unit_amount=2500,  # $25.00 in cents
                    currency="usd",
                    recurring={
                        "interval": "year",
                    },
                )
            
            price_id = annual_price.id
            logger.info(f"Using price ID: {price_id}")
        
        # Set default URLs
        base_url = "fittrax://membership"
        success_url = request.success_url or f"{base_url}?success=true&session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = request.cancel_url or f"{base_url}?canceled=true"
        
        # Create checkout session with 3-day free trial
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{
                "price": price_id,
                "quantity": 1,
            }],
            subscription_data={
                "trial_period_days": 3,
                "metadata": {
                    "user_id": request.user_id,
                }
            },
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=request.email,
            metadata={
                "user_id": request.user_id,
            },
            allow_promotion_codes=True,
        )
        
        # Store checkout session info
        await db.checkout_sessions.insert_one({
            "session_id": checkout_session.id,
            "user_id": request.user_id,
            "status": "pending",
            "created_at": datetime.utcnow().isoformat(),
        })
        
        return {
            "checkout_url": checkout_session.url,
            "session_id": checkout_session.id,
            "payment_link": STRIPE_PAYMENT_LINK,  # Also provide direct payment link
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating checkout session: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating checkout session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/membership/payment-link")
async def get_payment_link():
    """Get the direct Stripe Payment Link for subscriptions"""
    return {
        "payment_link": STRIPE_PAYMENT_LINK,
        "plan": "FitTrax+ Premium",
        "price": "$50/year",
        "trial_days": 3
    }

@api_router.get("/membership/checkout-status/{session_id}")
async def get_checkout_status(session_id: str):
    """Check the status of a checkout session"""
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        
        if session.payment_status == "paid" or session.status == "complete":
            # Update user's premium status
            user_id = session.metadata.get("user_id")
            if user_id:
                subscription = stripe.Subscription.retrieve(session.subscription)
                
                await db.subscriptions.update_one(
                    {"user_id": user_id},
                    {
                        "$set": {
                            "user_id": user_id,
                            "subscription_id": session.subscription,
                            "customer_id": session.customer,
                            "status": subscription.status,
                            "is_premium": True,
                            "is_trial": subscription.status == "trialing",
                            "current_period_end": datetime.fromtimestamp(subscription.current_period_end).isoformat(),
                            "trial_end": datetime.fromtimestamp(subscription.trial_end).isoformat() if subscription.trial_end else None,
                            "updated_at": datetime.utcnow().isoformat(),
                        }
                    },
                    upsert=True
                )
        
        return {
            "status": session.status,
            "payment_status": session.payment_status,
            "subscription_id": session.subscription,
            "customer_id": session.customer,
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error checking checkout status: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/membership/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events"""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    
    try:
        if webhook_secret:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        else:
            # Parse without signature verification (not recommended for production)
            event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
        
        event_type = event["type"]
        data = event["data"]["object"]
        
        logger.info(f"Received Stripe webhook: {event_type}")
        
        if event_type == "checkout.session.completed":
            user_id = data.get("metadata", {}).get("user_id")
            if user_id and data.get("subscription"):
                subscription = stripe.Subscription.retrieve(data["subscription"])
                await db.subscriptions.update_one(
                    {"user_id": user_id},
                    {
                        "$set": {
                            "user_id": user_id,
                            "subscription_id": data["subscription"],
                            "customer_id": data["customer"],
                            "status": subscription.status,
                            "is_premium": True,
                            "is_trial": subscription.status == "trialing",
                            "current_period_end": datetime.fromtimestamp(subscription.current_period_end).isoformat(),
                            "updated_at": datetime.utcnow().isoformat(),
                        }
                    },
                    upsert=True
                )
        
        elif event_type == "customer.subscription.updated":
            subscription_id = data["id"]
            subscription_doc = await db.subscriptions.find_one({"subscription_id": subscription_id})
            if subscription_doc:
                await db.subscriptions.update_one(
                    {"subscription_id": subscription_id},
                    {
                        "$set": {
                            "status": data["status"],
                            "is_premium": data["status"] in ["active", "trialing"],
                            "is_trial": data["status"] == "trialing",
                            "current_period_end": datetime.fromtimestamp(data["current_period_end"]).isoformat(),
                            "updated_at": datetime.utcnow().isoformat(),
                        }
                    }
                )
        
        elif event_type == "customer.subscription.deleted":
            subscription_id = data["id"]
            await db.subscriptions.update_one(
                {"subscription_id": subscription_id},
                {
                    "$set": {
                        "status": "canceled",
                        "is_premium": False,
                        "is_trial": False,
                        "canceled_at": datetime.utcnow().isoformat(),
                        "updated_at": datetime.utcnow().isoformat(),
                    }
                }
            )
        
        elif event_type == "invoice.payment_failed":
            subscription_id = data.get("subscription")
            if subscription_id:
                await db.subscriptions.update_one(
                    {"subscription_id": subscription_id},
                    {
                        "$set": {
                            "payment_failed": True,
                            "payment_failed_at": datetime.utcnow().isoformat(),
                        }
                    }
                )
        
        return {"status": "success"}
        
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Webhook signature verification failed: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# AI PERSONALIZED WORKOUTS
# ============================================================================

import json

# Workout Categories
WORKOUT_CATEGORIES = {
    "strength": {
        "name": "Strength Training",
        "description": "Build muscle and increase strength",
        "icon": "💪",
        "color": "#EF4444"
    },
    "weight_training": {
        "name": "Weight Training",
        "description": "Progressive overload with weights",
        "icon": "🏋️",
        "color": "#7C3AED"
    },
    "cardio": {
        "name": "Cardio",
        "description": "Improve heart health and burn calories",
        "icon": "🏃",
        "color": "#3B82F6"
    },
    "hiit": {
        "name": "HIIT",
        "description": "High-Intensity Interval Training",
        "icon": "⚡",
        "color": "#F59E0B"
    },
    "yoga": {
        "name": "Yoga",
        "description": "Flexibility, balance, and mindfulness",
        "icon": "🧘",
        "color": "#10B981"
    },
    "pilates": {
        "name": "Pilates",
        "description": "Core strength and body control",
        "icon": "🤸",
        "color": "#8B5CF6"
    },
    "dance": {
        "name": "Dance Fitness",
        "description": "Fun, rhythmic cardio workouts",
        "icon": "💃",
        "color": "#EC4899"
    },
    "martial_arts": {
        "name": "Martial Arts",
        "description": "Combat-inspired fitness training",
        "icon": "🥋",
        "color": "#14B8A6"
    },
    "stretching": {
        "name": "Stretching & Recovery",
        "description": "Improve flexibility and aid recovery",
        "icon": "🙆",
        "color": "#6366F1"
    }
}

class AIWorkoutRequest(BaseModel):
    user_id: str
    workout_type: str  # strength, cardio, hiit, yoga, pilates, dance, martial_arts, stretching
    duration_minutes: int = 30
    difficulty: str = "intermediate"  # beginner, intermediate, advanced
    focus_area: Optional[str] = None  # upper_body, lower_body, core, full_body
    equipment: List[str] = []  # dumbbells, barbell, kettlebell, resistance_bands, none
    goals: Optional[List[str]] = None  # weight_loss, muscle_gain, endurance, flexibility

class AIWorkoutResponse(BaseModel):
    workout_id: str
    title: str
    description: str
    workout_type: str
    difficulty: str
    duration_minutes: int
    calories_estimate: int
    exercises: List[dict]
    warmup: List[dict]
    cooldown: List[dict]
    tips: List[str]
    generated_at: str

@api_router.get("/workouts/categories")
async def get_workout_categories():
    """Get all available workout categories"""
    return {"categories": WORKOUT_CATEGORIES}

@api_router.post("/workouts/generate-ai")
async def generate_ai_workout(request: AIWorkoutRequest):
    """Generate a personalized workout using AI"""
    try:
        # Check premium status
        subscription = await db.subscriptions.find_one({
            "user_id": request.user_id,
            "status": {"$in": ["trialing", "active"]}
        })
        
        if not subscription:
            raise HTTPException(
                status_code=403, 
                detail="Premium membership required for AI workout generation"
            )
        
        # Get user profile for personalization
        profile = await db.user_profiles.find_one({"user_id": request.user_id})
        
        # Build the prompt
        equipment_str = ", ".join(request.equipment) if request.equipment else "no equipment (bodyweight only)"
        focus_str = request.focus_area.replace("_", " ") if request.focus_area else "full body"
        goals_str = ", ".join(request.goals) if request.goals else "general fitness"
        
        profile_context = ""
        if profile:
            profile_context = f"""
User Profile:
- Age: {profile.get('age', 'unknown')}
- Gender: {profile.get('gender', 'unknown')}
- Current Weight: {profile.get('weight', 'unknown')} lbs
- Goal Weight: {profile.get('goal_weight', 'unknown')} lbs
- Fitness Goal: {profile.get('goal', 'general fitness')}
"""
        
        prompt = f"""Create a {request.duration_minutes}-minute {request.workout_type} workout plan.

{profile_context}

Requirements:
- Difficulty Level: {request.difficulty}
- Focus Area: {focus_str}
- Available Equipment: {equipment_str}
- User Goals: {goals_str}

Generate a complete workout with:
1. Warm-up exercises (3-5 minutes)
2. Main workout exercises
3. Cool-down/stretching (3-5 minutes)

For each exercise, include:
- Exercise name
- Duration (seconds) or reps
- Sets (if applicable)
- Rest period (seconds)
- Brief instructions

Also provide:
- Estimated calories burned
- 3 helpful tips for the workout

Return ONLY valid JSON in this exact format:
{{
    "title": "Workout Title",
    "description": "Brief workout description",
    "calories_estimate": 250,
    "warmup": [
        {{"name": "Exercise Name", "duration": 60, "instructions": "How to do it"}}
    ],
    "exercises": [
        {{"name": "Exercise Name", "reps": "12", "sets": 3, "rest": 30, "instructions": "How to do it"}}
    ],
    "cooldown": [
        {{"name": "Stretch Name", "duration": 30, "instructions": "How to do it"}}
    ],
    "tips": ["Tip 1", "Tip 2", "Tip 3"]
}}"""

        # Call AI
        emergent_key = os.getenv("EMERGENT_LLM_KEY")
        import uuid
        session_id = f"workout_gen_{request.user_id}_{uuid.uuid4().hex[:8]}"
        
        chat = LlmChat(
            api_key=emergent_key,
            session_id=session_id,
            system_message="You are an expert fitness trainer. Generate detailed, safe, and effective workout plans. Always return valid JSON only, no markdown."
        ).with_model('openai', 'gpt-4o')
        
        user_msg = UserMessage(text=prompt)
        response = await chat.send_message(user_msg)
        
        # Parse the response
        try:
            # Clean up response if needed
            response_text = response.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            response_text = response_text.strip()
            
            workout_data = json.loads(response_text)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse AI response: {response}")
            raise HTTPException(status_code=500, detail="Failed to generate workout plan")
        
        # Create workout record
        workout_id = f"ai_workout_{request.user_id}_{int(datetime.utcnow().timestamp())}"
        
        workout = {
            "workout_id": workout_id,
            "user_id": request.user_id,
            "title": workout_data.get("title", f"{request.workout_type.title()} Workout"),
            "description": workout_data.get("description", ""),
            "workout_type": request.workout_type,
            "difficulty": request.difficulty,
            "duration_minutes": request.duration_minutes,
            "focus_area": request.focus_area,
            "equipment": request.equipment,
            "calories_estimate": workout_data.get("calories_estimate", request.duration_minutes * 8),
            "warmup": workout_data.get("warmup", []),
            "exercises": workout_data.get("exercises", []),
            "cooldown": workout_data.get("cooldown", []),
            "tips": workout_data.get("tips", []),
            "generated_at": datetime.utcnow().isoformat(),
            "is_ai_generated": True
        }
        
        # Save to database
        await db.ai_workouts.insert_one(workout.copy())
        
        # Remove any ObjectId that MongoDB might have added
        workout.pop("_id", None)
        
        return workout
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating AI workout: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/workouts/ai-history/{user_id}")
async def get_ai_workout_history(user_id: str, limit: int = 20):
    """Get user's AI-generated workout history"""
    try:
        workouts = await db.ai_workouts.find(
            {"user_id": user_id}
        ).sort("generated_at", -1).limit(limit).to_list(limit)
        
        for w in workouts:
            w.pop("_id", None)
        
        return {"workouts": workouts}
    except Exception as e:
        logger.error(f"Error getting AI workout history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/workouts/ai/{workout_id}")
async def get_ai_workout(workout_id: str):
    """Get a specific AI-generated workout"""
    try:
        workout = await db.ai_workouts.find_one({"workout_id": workout_id})
        if not workout:
            raise HTTPException(status_code=404, detail="Workout not found")
        
        workout.pop("_id", None)
        return workout
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AI workout: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/workouts/ai/{workout_id}/complete")
async def complete_ai_workout(workout_id: str, user_id: str, actual_duration: int = None):
    """Mark an AI workout as completed and log it"""
    try:
        workout = await db.ai_workouts.find_one({"workout_id": workout_id})
        if not workout:
            raise HTTPException(status_code=404, detail="Workout not found")
        
        # Create workout log entry
        workout_log = {
            "workout_id": f"log_{workout_id}_{int(datetime.utcnow().timestamp())}",
            "user_id": user_id,
            "workout_type": workout["workout_type"],
            "duration": actual_duration or workout["duration_minutes"],
            "calories_burned": workout["calories_estimate"],
            "notes": f"Completed AI workout: {workout['title']}",
            "timestamp": datetime.utcnow().isoformat(),
            "ai_workout_id": workout_id
        }
        
        await db.workouts.insert_one(workout_log)
        
        # Update AI workout completion count
        await db.ai_workouts.update_one(
            {"workout_id": workout_id},
            {"$inc": {"completion_count": 1}, "$set": {"last_completed": datetime.utcnow().isoformat()}}
        )
        
        # Check for badges
        await check_and_award_badges(user_id)
        
        return {
            "message": "Workout completed!",
            "calories_burned": workout_log["calories_burned"],
            "duration": workout_log["duration"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing AI workout: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# EXERCISE IMAGE GENERATION
# ============================================================================

class ExerciseImageRequest(BaseModel):
    exercise_name: str
    exercise_type: str = "strength"  # strength, yoga, cardio, stretching
    instructions: Optional[str] = None

@api_router.post("/exercises/generate-image")
async def generate_exercise_image(request: ExerciseImageRequest):
    """Generate an AI image demonstrating proper exercise form"""
    try:
        # Check cache first
        cached = await db.exercise_images.find_one({
            "exercise_name": request.exercise_name.lower()
        })
        if cached and cached.get("image_base64"):
            return {
                "exercise_name": request.exercise_name,
                "image_base64": cached["image_base64"],
                "cached": True
            }
        
        # Generate image using GPT-image-1
        emergent_key = os.getenv("EMERGENT_LLM_KEY")
        image_gen = OpenAIImageGeneration(api_key=emergent_key)
        
        # Build detailed prompt for exercise demonstration
        exercise_type_style = {
            "strength": "athletic person performing strength training exercise",
            "yoga": "person in yoga pose, peaceful studio setting",
            "cardio": "athletic person doing cardio exercise, energetic pose",
            "stretching": "person doing stretching exercise, flexible pose",
            "hiit": "athletic person in high-intensity exercise position",
            "martial_arts": "martial artist demonstrating technique",
            "dance": "dancer in dynamic dance fitness pose",
            "pilates": "person performing pilates exercise on mat"
        }
        
        style = exercise_type_style.get(request.exercise_type, "athletic person exercising")
        
        prompt = f"""Create a clear, professional fitness instruction image showing:
Exercise: {request.exercise_name}
Style: {style}
{f'Movement: {request.instructions}' if request.instructions else ''}

Requirements:
- Clean white or gym background
- Professional fitness photography style
- Clear demonstration of proper form
- Athletic person with proper posture
- No text or labels on the image
- Well-lit, high quality
- Safe, achievable position"""

        logger.info(f"Generating exercise image for: {request.exercise_name}")
        
        images = await image_gen.generate_images(
            prompt=prompt,
            model="gpt-image-1",
            number_of_images=1
        )
        
        if not images or len(images) == 0:
            raise HTTPException(status_code=500, detail="Failed to generate image")
        
        # Convert to base64
        image_base64 = base64.b64encode(images[0]).decode('utf-8')
        
        # Cache the result
        await db.exercise_images.update_one(
            {"exercise_name": request.exercise_name.lower()},
            {
                "$set": {
                    "exercise_name": request.exercise_name.lower(),
                    "display_name": request.exercise_name,
                    "exercise_type": request.exercise_type,
                    "image_base64": image_base64,
                    "generated_at": datetime.utcnow().isoformat()
                }
            },
            upsert=True
        )
        
        return {
            "exercise_name": request.exercise_name,
            "image_base64": image_base64,
            "cached": False
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating exercise image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/exercises/image/{exercise_name}")
async def get_exercise_image(exercise_name: str):
    """Get a cached exercise image or return placeholder info"""
    try:
        cached = await db.exercise_images.find_one({
            "exercise_name": exercise_name.lower()
        })
        
        if cached and cached.get("image_base64"):
            return {
                "exercise_name": exercise_name,
                "image_base64": cached["image_base64"],
                "exists": True
            }
        
        return {
            "exercise_name": exercise_name,
            "image_base64": None,
            "exists": False
        }
    except Exception as e:
        logger.error(f"Error getting exercise image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class ExercisePhaseImageRequest(BaseModel):
    exercise_name: str
    equipment: Optional[List[str]] = None
    muscle_groups: Optional[List[str]] = None

# Exercise-specific prompt configurations
EXERCISE_SPECIFIC_PROMPTS = {
    "bench press": {
        "start": "starting position with arms fully extended, holding barbell above chest, head flat on the bench, back slightly arched, feet flat on floor",
        "mid": "bar lowered to mid-chest level, elbows at 45 degrees, head flat on the bench",
        "end": "SAME AS START - arms fully extended, holding barbell above chest, head flat on the bench",
        "use_start_for_end": True
    },
    "incline bench press": {
        "start": "starting position on incline bench, arms fully extended holding barbell above upper chest, head back against the inclined bench",
        "mid": "bar lowered down to upper chest near collarbone, elbows at 45 degrees",
        "end": "SAME AS START - arms fully extended holding barbell above upper chest on incline bench",
        "use_start_for_end": True
    },
    "squat": {
        "start": "standing position with barbell resting across upper back behind the neck, feet shoulder-width apart, chest up",
        "mid": "lowered position with thighs parallel to ground, barbell still resting across upper back behind the neck, knees tracking over toes",
        "end": "SAME AS START - standing position with barbell across upper back behind the neck",
        "use_start_for_end": True
    },
    "tricep pushdown": {
        "start": "starting position with rope or bar held up near chin level, elbows bent, upper arms close to body",
        "mid": "arms at 90 degrees, halfway through the pushdown movement",
        "end": "completion position with arms fully extended downward, triceps fully contracted, elbows locked",
        "use_start_for_end": False  # Exception - different start and end
    },
    "deadlift": {
        "start": "starting position bent over with barbell on the ground or at shin level, back flat, hips hinged back, knees slightly bent, gripping the bar with arms extended",
        "mid": "standing upright holding barbell at hip level with arms extended down, shoulders back, chest up, lockout position",
        "end": "SAME AS START - bent over position with barbell at shin level, back flat, hips hinged",
        "use_start_for_end": True
    },
    "skull crushers": {
        "start": "lying flat on bench with head flat, holding EZ-curl bar or dumbbells with arms bent, weight lowered down near forehead/behind head, elbows pointing up",
        "mid": "arms fully extended straight up toward the ceiling, holding EZ-curl bar or dumbbells directly above chest, elbows locked",
        "end": "SAME AS START - arms bent with weight lowered near forehead/behind head",
        "use_start_for_end": True
    },
    "dumbbell curl": {
        "start": "standing with dumbbells at sides, arms fully extended, palms facing forward",
        "mid": "dumbbells at 90 degrees, elbows bent, biceps engaged",
        "end": "SAME AS START - standing with dumbbells at sides, arms fully extended",
        "use_start_for_end": True
    },
    "lat pulldown": {
        "start": "seated with arms extended overhead gripping the bar, slight lean back",
        "mid": "bar pulled down to upper chest level, elbows pointing down",
        "end": "SAME AS START - arms extended overhead gripping the bar",
        "use_start_for_end": True
    },
    "overhead press": {
        "start": "standing with barbell at shoulder level, elbows bent",
        "mid": "barbell pressed halfway up, above head level",
        "end": "SAME AS START - barbell at shoulder level",
        "use_start_for_end": True
    }
}

def get_exercise_prompts(exercise_name: str, equipment_str: str, muscles_str: str):
    """Get exercise-specific prompts or default prompts"""
    exercise_key = exercise_name.lower()
    specific = EXERCISE_SPECIFIC_PROMPTS.get(exercise_key, None)
    
    if specific:
        return {
            "start": specific["start"],
            "mid": specific["mid"],
            "end": specific["end"],
            "use_start_for_end": specific.get("use_start_for_end", True)
        }
    
    # Default prompts for exercises not specifically defined
    return {
        "start": f"starting position, ready to begin the movement, proper grip and stance with {equipment_str}",
        "mid": "range position, halfway through the movement, muscles engaged, controlled form",
        "end": "SAME AS START - returning to starting position after completing the rep",
        "use_start_for_end": True
    }

@api_router.post("/exercises/generate-phase-images")
async def generate_exercise_phase_images(request: ExercisePhaseImageRequest):
    """Generate 3 AI images showing exercise phases: start, range, and completion"""
    try:
        exercise_key = request.exercise_name.lower().replace(" ", "_")
        
        # Check cache first
        cached = await db.exercise_phase_images.find_one({
            "exercise_key": exercise_key
        })
        if cached and cached.get("phases"):
            return {
                "exercise_name": request.exercise_name,
                "phases": cached["phases"],
                "cached": True
            }
        
        # Generate images using GPT-image-1
        emergent_key = os.getenv("EMERGENT_LLM_KEY")
        image_gen = OpenAIImageGeneration(api_key=emergent_key)
        
        equipment_str = ", ".join(request.equipment) if request.equipment else "gym equipment"
        muscles_str = ", ".join(request.muscle_groups) if request.muscle_groups else "target muscles"
        
        # Get exercise-specific prompts
        exercise_prompts = get_exercise_prompts(request.exercise_name, equipment_str, muscles_str)
        
        # Define the 3 phases with updated labels
        phases = [
            {
                "name": "start",
                "label": "Starting Position",
                "description": exercise_prompts["start"]
            },
            {
                "name": "mid",
                "label": "Range",  # Changed from Mid-Range to Range
                "description": exercise_prompts["mid"]
            },
            {
                "name": "end",
                "label": "Completion",
                "description": exercise_prompts["end"]
            }
        ]
        
        generated_phases = []
        start_image_base64 = None  # Store start image to reuse for completion
        
        for phase in phases:
            # If this is the end phase and we should use start image
            if phase["name"] == "end" and exercise_prompts["use_start_for_end"] and start_image_base64:
                generated_phases.append({
                    "phase": phase["name"],
                    "label": phase["label"],
                    "image_base64": start_image_base64
                })
                continue
            
            prompt = f"""Create a professional fitness instruction photograph showing:

Exercise: {request.exercise_name}
Phase: {phase['label']}
Position: {phase['description']}
Equipment: {equipment_str}
Target Muscles: {muscles_str}

CRITICAL Requirements:
- Clean, well-lit gym environment with professional lighting
- Athletic person demonstrating EXACTLY this position: {phase['description']}
- Crystal clear demonstration of proper form and posture
- Realistic photographic style, not cartoon or illustration
- Side angle view to show full body mechanics
- Person wearing athletic workout clothing
- NO text, labels, or watermarks on the image
- High quality, sharp focus on the person
- Natural skin tones and realistic proportions
- Proper exercise form as described above"""

            logger.info(f"Generating {phase['name']} phase image for: {request.exercise_name}")
            
            try:
                images = await image_gen.generate_images(
                    prompt=prompt,
                    model="gpt-image-1",
                    number_of_images=1
                )
                
                if images and len(images) > 0:
                    image_base64 = base64.b64encode(images[0]).decode('utf-8')
                    
                    # Store start image for potential reuse
                    if phase["name"] == "start":
                        start_image_base64 = image_base64
                    
                    generated_phases.append({
                        "phase": phase["name"],
                        "label": phase["label"],
                        "image_base64": image_base64
                    })
                else:
                    generated_phases.append({
                        "phase": phase["name"],
                        "label": phase["label"],
                        "image_base64": None,
                        "error": "Failed to generate"
                    })
            except Exception as gen_error:
                logger.error(f"Error generating {phase['name']} image: {str(gen_error)}")
                generated_phases.append({
                    "phase": phase["name"],
                    "label": phase["label"],
                    "image_base64": None,
                    "error": str(gen_error)
                })
        
        # Cache the results
        await db.exercise_phase_images.update_one(
            {"exercise_key": exercise_key},
            {
                "$set": {
                    "exercise_key": exercise_key,
                    "exercise_name": request.exercise_name,
                    "equipment": request.equipment,
                    "muscle_groups": request.muscle_groups,
                    "phases": generated_phases,
                    "generated_at": datetime.utcnow().isoformat()
                }
            },
            upsert=True
        )
        
        return {
            "exercise_name": request.exercise_name,
            "phases": generated_phases,
            "cached": False
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating exercise phase images: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/exercises/phase-images/{exercise_name}")
async def get_exercise_phase_images(exercise_name: str):
    """Get cached exercise phase images"""
    try:
        exercise_key = exercise_name.lower().replace(" ", "_")
        cached = await db.exercise_phase_images.find_one({
            "exercise_key": exercise_key
        })
        
        if cached and cached.get("phases"):
            return {
                "exercise_name": exercise_name,
                "phases": cached["phases"],
                "exists": True
            }
        
        return {
            "exercise_name": exercise_name,
            "phases": [],
            "exists": False
        }
    except Exception as e:
        logger.error(f"Error getting exercise phase images: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/exercises/generate-workout-images/{workout_id}")
async def generate_workout_images(workout_id: str, user_id: str):
    """Generate images for all exercises in a workout (Premium feature)"""
    try:
        # Check premium status
        subscription = await db.subscriptions.find_one({
            "user_id": user_id,
            "status": {"$in": ["trialing", "active"]}
        })
        
        if not subscription:
            raise HTTPException(
                status_code=403, 
                detail="Premium membership required for exercise image generation"
            )
        
        # Get workout
        workout = await db.ai_workouts.find_one({"workout_id": workout_id})
        if not workout:
            raise HTTPException(status_code=404, detail="Workout not found")
        
        # Collect all exercises
        all_exercises = []
        if workout.get("warmup"):
            all_exercises.extend(workout["warmup"])
        if workout.get("exercises"):
            all_exercises.extend(workout["exercises"])
        if workout.get("cooldown"):
            all_exercises.extend(workout["cooldown"])
        
        generated_images = []
        for exercise in all_exercises[:5]:  # Limit to 5 images per request
            exercise_name = exercise.get("name", "")
            if not exercise_name:
                continue
                
            # Check cache first
            cached = await db.exercise_images.find_one({
                "exercise_name": exercise_name.lower()
            })
            
            if cached and cached.get("image_base64"):
                generated_images.append({
                    "exercise_name": exercise_name,
                    "cached": True
                })
                continue
            
            # Generate new image
            try:
                emergent_key = os.getenv("EMERGENT_LLM_KEY")
                image_gen = OpenAIImageGeneration(api_key=emergent_key)
                
                prompt = f"""Professional fitness instruction image:
Exercise: {exercise_name}
{f'Instructions: {exercise.get("instructions", "")}' if exercise.get("instructions") else ''}
Style: Clean gym background, proper form demonstration, athletic person, well-lit, no text"""
                
                images = await image_gen.generate_images(
                    prompt=prompt,
                    model="gpt-image-1",
                    number_of_images=1
                )
                
                if images and len(images) > 0:
                    image_base64 = base64.b64encode(images[0]).decode('utf-8')
                    
                    await db.exercise_images.update_one(
                        {"exercise_name": exercise_name.lower()},
                        {
                            "$set": {
                                "exercise_name": exercise_name.lower(),
                                "display_name": exercise_name,
                                "exercise_type": workout.get("workout_type", "strength"),
                                "image_base64": image_base64,
                                "generated_at": datetime.utcnow().isoformat()
                            }
                        },
                        upsert=True
                    )
                    
                    generated_images.append({
                        "exercise_name": exercise_name,
                        "cached": False
                    })
            except Exception as img_error:
                logger.error(f"Error generating image for {exercise_name}: {str(img_error)}")
                continue
        
        return {
            "workout_id": workout_id,
            "images_generated": len(generated_images),
            "exercises": generated_images
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating workout images: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Pre-built workout templates for each category
WORKOUT_TEMPLATES = {
    "yoga": [
        {
            "template_id": "yoga_morning_flow",
            "title": "Morning Flow Yoga",
            "description": "Energizing morning sequence to start your day",
            "duration_minutes": 20,
            "difficulty": "beginner",
            "exercises": [
                {"name": "Cat-Cow Stretch", "duration": 60, "instructions": "Flow between arching and rounding your spine"},
                {"name": "Downward Dog", "duration": 45, "instructions": "Form an inverted V shape"},
                {"name": "Sun Salutation A", "reps": "5 rounds", "instructions": "Complete flow sequence"},
                {"name": "Warrior I", "duration": 30, "instructions": "Hold each side"},
                {"name": "Warrior II", "duration": 30, "instructions": "Hold each side"},
                {"name": "Triangle Pose", "duration": 30, "instructions": "Hold each side"},
                {"name": "Tree Pose", "duration": 30, "instructions": "Balance on each leg"},
                {"name": "Seated Forward Fold", "duration": 60, "instructions": "Relax and breathe deeply"},
                {"name": "Savasana", "duration": 120, "instructions": "Final relaxation"}
            ]
        }
    ],
    "hiit": [
        {
            "template_id": "hiit_fat_burner",
            "title": "Fat Burning HIIT",
            "description": "High-intensity intervals to maximize calorie burn",
            "duration_minutes": 25,
            "difficulty": "intermediate",
            "exercises": [
                {"name": "Jumping Jacks", "duration": 30, "rest": 10, "sets": 3},
                {"name": "Burpees", "reps": "10", "rest": 20, "sets": 3},
                {"name": "Mountain Climbers", "duration": 30, "rest": 10, "sets": 3},
                {"name": "Squat Jumps", "reps": "15", "rest": 20, "sets": 3},
                {"name": "High Knees", "duration": 30, "rest": 10, "sets": 3},
                {"name": "Push-Up to Plank", "reps": "10", "rest": 20, "sets": 3}
            ]
        }
    ],
    "dance": [
        {
            "template_id": "dance_cardio_party",
            "title": "Dance Cardio Party",
            "description": "Fun, energetic dance workout",
            "duration_minutes": 30,
            "difficulty": "beginner",
            "exercises": [
                {"name": "Warm-Up Groove", "duration": 180, "instructions": "Light movement to music"},
                {"name": "Step Touch Combo", "duration": 120, "instructions": "Side steps with arm movements"},
                {"name": "Grapevine", "duration": 90, "instructions": "Step behind and travel sideways"},
                {"name": "Cha-Cha Slides", "duration": 120, "instructions": "Quick feet forward and back"},
                {"name": "Hip Hop Bounce", "duration": 120, "instructions": "Rhythmic bouncing with attitude"},
                {"name": "Salsa Steps", "duration": 120, "instructions": "Basic salsa forward and back"},
                {"name": "Free Dance", "duration": 180, "instructions": "Express yourself!"},
                {"name": "Cool Down Sway", "duration": 120, "instructions": "Gentle swaying to slow music"}
            ]
        }
    ],
    "martial_arts": [
        {
            "template_id": "kickboxing_basics",
            "title": "Kickboxing Basics",
            "description": "Combat-inspired cardio and strength",
            "duration_minutes": 30,
            "difficulty": "intermediate",
            "exercises": [
                {"name": "Fighter Stance & Footwork", "duration": 120, "instructions": "Practice basic stance and movement"},
                {"name": "Jab-Cross Combo", "reps": "20 each side", "sets": 3, "rest": 15},
                {"name": "Front Kicks", "reps": "15 each leg", "sets": 3, "rest": 15},
                {"name": "Hook Punches", "reps": "15 each side", "sets": 3, "rest": 15},
                {"name": "Roundhouse Kicks", "reps": "10 each leg", "sets": 3, "rest": 20},
                {"name": "Uppercuts", "reps": "15 each side", "sets": 3, "rest": 15},
                {"name": "Speed Bag Simulation", "duration": 60, "sets": 3, "rest": 15},
                {"name": "Shadow Boxing", "duration": 180, "instructions": "Combine all moves freely"}
            ]
        }
    ]
}

@api_router.get("/workouts/templates")
async def get_workout_templates(category: str = None):
    """Get pre-built workout templates"""
    if category:
        templates = WORKOUT_TEMPLATES.get(category, [])
        return {"templates": templates, "category": category}
    
    all_templates = []
    for cat, templates in WORKOUT_TEMPLATES.items():
        for t in templates:
            t["category"] = cat
            all_templates.append(t)
    
    return {"templates": all_templates}

@api_router.get("/workouts/recommended/{user_id}")
async def get_recommended_workouts(user_id: str):
    """Get personalized workout recommendations based on user history"""
    try:
        # Get user profile
        profile = await db.user_profiles.find_one({"user_id": user_id})
        
        # Get recent workouts
        recent_workouts = await db.workouts.find(
            {"user_id": user_id}
        ).sort("timestamp", -1).limit(10).to_list(10)
        
        # Analyze workout patterns
        workout_types = {}
        for w in recent_workouts:
            wt = w.get("workout_type", "other")
            workout_types[wt] = workout_types.get(wt, 0) + 1
        
        # Recommend variety - suggest categories user hasn't tried recently
        all_categories = list(WORKOUT_CATEGORIES.keys())
        tried_categories = list(workout_types.keys())
        
        recommendations = []
        
        # Add untried categories first
        for cat in all_categories:
            if cat not in tried_categories:
                cat_info = WORKOUT_CATEGORIES[cat]
                recommendations.append({
                    "category": cat,
                    "name": cat_info["name"],
                    "reason": "Try something new!",
                    "icon": cat_info["icon"]
                })
        
        # Add templates from favorite categories
        most_popular = sorted(workout_types.items(), key=lambda x: x[1], reverse=True)[:2]
        for cat, count in most_popular:
            if cat in WORKOUT_TEMPLATES:
                for template in WORKOUT_TEMPLATES[cat]:
                    recommendations.append({
                        "category": cat,
                        "template_id": template["template_id"],
                        "title": template["title"],
                        "reason": f"You enjoy {cat} workouts!",
                        "duration": template["duration_minutes"]
                    })
        
        return {
            "recommendations": recommendations[:6],
            "workout_history_count": len(recent_workouts)
        }
    except Exception as e:
        logger.error(f"Error getting recommendations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# WEIGHT TRAINING
# ============================================================================

# Exercise Library
WEIGHT_EXERCISES = {
    "chest": [
        {"name": "Bench Press", "equipment": ["barbell", "bench"], "muscle_groups": ["chest", "triceps", "shoulders"]},
        {"name": "Incline Bench Press", "equipment": ["barbell", "bench"], "muscle_groups": ["upper chest", "shoulders"]},
        {"name": "Dumbbell Flyes", "equipment": ["dumbbells", "bench"], "muscle_groups": ["chest"]},
        {"name": "Cable Crossover", "equipment": ["cable machine"], "muscle_groups": ["chest"]},
        {"name": "Dumbbell Press", "equipment": ["dumbbells", "bench"], "muscle_groups": ["chest", "triceps"]},
        {"name": "Push-Ups", "equipment": ["bodyweight"], "muscle_groups": ["chest", "triceps", "core"]},
    ],
    "back": [
        {"name": "Deadlift", "equipment": ["barbell"], "muscle_groups": ["back", "hamstrings", "glutes"]},
        {"name": "Bent Over Row", "equipment": ["barbell"], "muscle_groups": ["back", "biceps"]},
        {"name": "Lat Pulldown", "equipment": ["cable machine"], "muscle_groups": ["lats", "biceps"]},
        {"name": "Seated Cable Row", "equipment": ["cable machine"], "muscle_groups": ["back", "biceps"]},
        {"name": "Pull-Ups", "equipment": ["pull-up bar"], "muscle_groups": ["lats", "biceps"]},
        {"name": "Dumbbell Row", "equipment": ["dumbbells"], "muscle_groups": ["back", "biceps"]},
        {"name": "T-Bar Row", "equipment": ["barbell", "landmine"], "muscle_groups": ["back"]},
    ],
    "shoulders": [
        {"name": "Overhead Press", "equipment": ["barbell"], "muscle_groups": ["shoulders", "triceps"]},
        {"name": "Dumbbell Shoulder Press", "equipment": ["dumbbells"], "muscle_groups": ["shoulders"]},
        {"name": "Lateral Raises", "equipment": ["dumbbells"], "muscle_groups": ["side delts"]},
        {"name": "Front Raises", "equipment": ["dumbbells"], "muscle_groups": ["front delts"]},
        {"name": "Face Pulls", "equipment": ["cable machine"], "muscle_groups": ["rear delts", "traps"]},
        {"name": "Arnold Press", "equipment": ["dumbbells"], "muscle_groups": ["shoulders"]},
    ],
    "legs": [
        {"name": "Squat", "equipment": ["barbell", "squat rack"], "muscle_groups": ["quads", "glutes", "hamstrings"]},
        {"name": "Leg Press", "equipment": ["leg press machine"], "muscle_groups": ["quads", "glutes"]},
        {"name": "Romanian Deadlift", "equipment": ["barbell"], "muscle_groups": ["hamstrings", "glutes"]},
        {"name": "Leg Curl", "equipment": ["leg curl machine"], "muscle_groups": ["hamstrings"]},
        {"name": "Leg Extension", "equipment": ["leg extension machine"], "muscle_groups": ["quads"]},
        {"name": "Lunges", "equipment": ["dumbbells"], "muscle_groups": ["quads", "glutes"]},
        {"name": "Calf Raises", "equipment": ["machine", "dumbbells"], "muscle_groups": ["calves"]},
        {"name": "Hip Thrust", "equipment": ["barbell", "bench"], "muscle_groups": ["glutes"]},
    ],
    "arms": [
        {"name": "Barbell Curl", "equipment": ["barbell"], "muscle_groups": ["biceps"]},
        {"name": "Dumbbell Curl", "equipment": ["dumbbells"], "muscle_groups": ["biceps"]},
        {"name": "Hammer Curl", "equipment": ["dumbbells"], "muscle_groups": ["biceps", "forearms"]},
        {"name": "Tricep Pushdown", "equipment": ["cable machine"], "muscle_groups": ["triceps"]},
        {"name": "Skull Crushers", "equipment": ["barbell", "bench"], "muscle_groups": ["triceps"]},
        {"name": "Tricep Dips", "equipment": ["dip bars"], "muscle_groups": ["triceps", "chest"]},
        {"name": "Preacher Curl", "equipment": ["ez bar", "preacher bench"], "muscle_groups": ["biceps"]},
    ],
    "core": [
        {"name": "Plank", "equipment": ["bodyweight"], "muscle_groups": ["core"]},
        {"name": "Cable Crunch", "equipment": ["cable machine"], "muscle_groups": ["abs"]},
        {"name": "Hanging Leg Raise", "equipment": ["pull-up bar"], "muscle_groups": ["abs", "hip flexors"]},
        {"name": "Russian Twist", "equipment": ["bodyweight", "weight plate"], "muscle_groups": ["obliques"]},
        {"name": "Ab Wheel Rollout", "equipment": ["ab wheel"], "muscle_groups": ["abs", "core"]},
    ]
}

# Pre-built weight training programs
WEIGHT_TRAINING_PROGRAMS = {
    "push_pull_legs": {
        "name": "Push/Pull/Legs",
        "description": "Classic 3-day split focusing on movement patterns",
        "frequency": "3-6 days/week",
        "level": "intermediate",
        "days": [
            {
                "name": "Push Day",
                "focus": ["chest", "shoulders", "triceps"],
                "exercises": [
                    {"name": "Bench Press", "sets": 4, "reps": "8-10", "rest": 90},
                    {"name": "Overhead Press", "sets": 3, "reps": "8-10", "rest": 90},
                    {"name": "Incline Dumbbell Press", "sets": 3, "reps": "10-12", "rest": 60},
                    {"name": "Lateral Raises", "sets": 3, "reps": "12-15", "rest": 45},
                    {"name": "Tricep Pushdown", "sets": 3, "reps": "12-15", "rest": 45},
                    {"name": "Overhead Tricep Extension", "sets": 3, "reps": "12-15", "rest": 45},
                ]
            },
            {
                "name": "Pull Day", 
                "focus": ["back", "biceps", "rear delts"],
                "exercises": [
                    {"name": "Deadlift", "sets": 4, "reps": "5-6", "rest": 120},
                    {"name": "Bent Over Row", "sets": 4, "reps": "8-10", "rest": 90},
                    {"name": "Lat Pulldown", "sets": 3, "reps": "10-12", "rest": 60},
                    {"name": "Face Pulls", "sets": 3, "reps": "15-20", "rest": 45},
                    {"name": "Barbell Curl", "sets": 3, "reps": "10-12", "rest": 45},
                    {"name": "Hammer Curl", "sets": 3, "reps": "12-15", "rest": 45},
                ]
            },
            {
                "name": "Legs Day",
                "focus": ["quads", "hamstrings", "glutes", "calves"],
                "exercises": [
                    {"name": "Squat", "sets": 4, "reps": "6-8", "rest": 120},
                    {"name": "Romanian Deadlift", "sets": 3, "reps": "10-12", "rest": 90},
                    {"name": "Leg Press", "sets": 3, "reps": "12-15", "rest": 60},
                    {"name": "Leg Curl", "sets": 3, "reps": "12-15", "rest": 45},
                    {"name": "Leg Extension", "sets": 3, "reps": "12-15", "rest": 45},
                    {"name": "Calf Raises", "sets": 4, "reps": "15-20", "rest": 45},
                ]
            }
        ]
    },
    "upper_lower": {
        "name": "Upper/Lower Split",
        "description": "4-day split alternating upper and lower body",
        "frequency": "4 days/week",
        "level": "intermediate",
        "days": [
            {
                "name": "Upper A (Strength)",
                "focus": ["chest", "back", "shoulders", "arms"],
                "exercises": [
                    {"name": "Bench Press", "sets": 4, "reps": "5-6", "rest": 120},
                    {"name": "Bent Over Row", "sets": 4, "reps": "5-6", "rest": 120},
                    {"name": "Overhead Press", "sets": 3, "reps": "6-8", "rest": 90},
                    {"name": "Pull-Ups", "sets": 3, "reps": "6-10", "rest": 90},
                    {"name": "Barbell Curl", "sets": 2, "reps": "10-12", "rest": 60},
                    {"name": "Tricep Dips", "sets": 2, "reps": "10-12", "rest": 60},
                ]
            },
            {
                "name": "Lower A (Strength)",
                "focus": ["quads", "hamstrings", "glutes"],
                "exercises": [
                    {"name": "Squat", "sets": 4, "reps": "5-6", "rest": 120},
                    {"name": "Romanian Deadlift", "sets": 4, "reps": "6-8", "rest": 120},
                    {"name": "Leg Press", "sets": 3, "reps": "8-10", "rest": 90},
                    {"name": "Leg Curl", "sets": 3, "reps": "10-12", "rest": 60},
                    {"name": "Calf Raises", "sets": 4, "reps": "12-15", "rest": 45},
                ]
            },
            {
                "name": "Upper B (Hypertrophy)",
                "focus": ["chest", "back", "shoulders", "arms"],
                "exercises": [
                    {"name": "Dumbbell Press", "sets": 4, "reps": "10-12", "rest": 60},
                    {"name": "Seated Cable Row", "sets": 4, "reps": "10-12", "rest": 60},
                    {"name": "Dumbbell Shoulder Press", "sets": 3, "reps": "10-12", "rest": 60},
                    {"name": "Lat Pulldown", "sets": 3, "reps": "10-12", "rest": 60},
                    {"name": "Lateral Raises", "sets": 3, "reps": "15-20", "rest": 45},
                    {"name": "Dumbbell Curl", "sets": 3, "reps": "12-15", "rest": 45},
                    {"name": "Tricep Pushdown", "sets": 3, "reps": "12-15", "rest": 45},
                ]
            },
            {
                "name": "Lower B (Hypertrophy)",
                "focus": ["quads", "hamstrings", "glutes"],
                "exercises": [
                    {"name": "Leg Press", "sets": 4, "reps": "12-15", "rest": 60},
                    {"name": "Lunges", "sets": 3, "reps": "12 each", "rest": 60},
                    {"name": "Leg Extension", "sets": 3, "reps": "15-20", "rest": 45},
                    {"name": "Leg Curl", "sets": 3, "reps": "15-20", "rest": 45},
                    {"name": "Hip Thrust", "sets": 3, "reps": "12-15", "rest": 60},
                    {"name": "Calf Raises", "sets": 4, "reps": "15-20", "rest": 45},
                ]
            }
        ]
    },
    "full_body": {
        "name": "Full Body",
        "description": "3-day full body workout for beginners",
        "frequency": "3 days/week",
        "level": "beginner",
        "days": [
            {
                "name": "Workout A",
                "focus": ["full body"],
                "exercises": [
                    {"name": "Squat", "sets": 3, "reps": "8-10", "rest": 90},
                    {"name": "Bench Press", "sets": 3, "reps": "8-10", "rest": 90},
                    {"name": "Bent Over Row", "sets": 3, "reps": "8-10", "rest": 90},
                    {"name": "Overhead Press", "sets": 3, "reps": "10-12", "rest": 60},
                    {"name": "Plank", "sets": 3, "reps": "30-60s", "rest": 45},
                ]
            },
            {
                "name": "Workout B",
                "focus": ["full body"],
                "exercises": [
                    {"name": "Deadlift", "sets": 3, "reps": "6-8", "rest": 120},
                    {"name": "Dumbbell Press", "sets": 3, "reps": "10-12", "rest": 60},
                    {"name": "Lat Pulldown", "sets": 3, "reps": "10-12", "rest": 60},
                    {"name": "Lunges", "sets": 3, "reps": "10 each", "rest": 60},
                    {"name": "Dumbbell Curl", "sets": 2, "reps": "12-15", "rest": 45},
                    {"name": "Tricep Pushdown", "sets": 2, "reps": "12-15", "rest": 45},
                ]
            },
            {
                "name": "Workout C",
                "focus": ["full body"],
                "exercises": [
                    {"name": "Leg Press", "sets": 3, "reps": "10-12", "rest": 90},
                    {"name": "Incline Dumbbell Press", "sets": 3, "reps": "10-12", "rest": 60},
                    {"name": "Seated Cable Row", "sets": 3, "reps": "10-12", "rest": 60},
                    {"name": "Romanian Deadlift", "sets": 3, "reps": "10-12", "rest": 90},
                    {"name": "Lateral Raises", "sets": 3, "reps": "15-20", "rest": 45},
                    {"name": "Cable Crunch", "sets": 3, "reps": "15-20", "rest": 45},
                ]
            }
        ]
    }
}

# Functional Training Programs (F45-style HIIT workouts)
FUNCTIONAL_TRAINING_PROGRAMS = {
    "cardio_blast": {
        "name": "Cardio Blast",
        "description": "High-intensity bodyweight cardio circuit - no equipment needed",
        "frequency": "3-5 days/week",
        "level": "all_levels",
        "type": "bodyweight",
        "duration": "45 min",
        "image": "https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=400",
        "stations": [
            {"name": "Burpees", "duration": "40s", "rest": "20s", "description": "Full body explosive movement", "image": "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400"},
            {"name": "High Knees", "duration": "40s", "rest": "20s", "description": "Run in place driving knees up", "image": "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400"},
            {"name": "Mountain Climbers", "duration": "40s", "rest": "20s", "description": "Plank position alternating knee drives", "image": "https://images.unsplash.com/photo-1599058917765-a780eda07a3e?w=400"},
            {"name": "Jump Squats", "duration": "40s", "rest": "20s", "description": "Squat down and explode up", "image": "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400"},
            {"name": "Jumping Jacks", "duration": "40s", "rest": "20s", "description": "Classic cardio movement", "image": "https://images.unsplash.com/photo-1601422407692-ec4eeec1d9b3?w=400"},
            {"name": "Tuck Jumps", "duration": "40s", "rest": "20s", "description": "Jump and bring knees to chest", "image": "https://images.unsplash.com/photo-1434682881908-b43d0467b798?w=400"},
            {"name": "Speed Skaters", "duration": "40s", "rest": "20s", "description": "Lateral bounds side to side", "image": "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400"},
            {"name": "Box Jumps", "duration": "40s", "rest": "20s", "description": "Jump onto elevated surface", "image": "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?w=400"},
        ],
        "rounds": 3
    },
    "kettlebell_fury": {
        "name": "Kettlebell Fury",
        "description": "Full body kettlebell circuit for strength and cardio",
        "frequency": "3-4 days/week",
        "level": "intermediate",
        "type": "kettlebell",
        "duration": "45 min",
        "image": "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=400",
        "stations": [
            {"name": "Kettlebell Swings", "duration": "45s", "rest": "15s", "description": "Hip hinge explosive swing", "image": "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=400"},
            {"name": "Goblet Squats", "duration": "45s", "rest": "15s", "description": "Hold kettlebell at chest, squat deep", "image": "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400"},
            {"name": "KB Clean & Press", "duration": "45s", "rest": "15s", "description": "Clean to shoulder then press overhead", "image": "https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?w=400"},
            {"name": "KB Deadlifts", "duration": "45s", "rest": "15s", "description": "Hip hinge keeping back flat", "image": "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=400"},
            {"name": "KB Rows", "duration": "45s", "rest": "15s", "description": "Bent over row each arm", "image": "https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=400"},
            {"name": "KB Turkish Get Up", "duration": "45s", "rest": "15s", "description": "Floor to standing holding KB overhead", "image": "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=400"},
            {"name": "KB Lunges", "duration": "45s", "rest": "15s", "description": "Walking lunges with KB at chest", "image": "https://images.unsplash.com/photo-1434682881908-b43d0467b798?w=400"},
            {"name": "KB High Pulls", "duration": "45s", "rest": "15s", "description": "Explosive pull to chin height", "image": "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=400"},
        ],
        "rounds": 3
    },
    "barbell_power": {
        "name": "Barbell Power",
        "description": "Olympic-style barbell circuit for explosive strength",
        "frequency": "3-4 days/week", 
        "level": "advanced",
        "type": "barbell",
        "duration": "50 min",
        "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400",
        "stations": [
            {"name": "Barbell Thrusters", "duration": "40s", "rest": "20s", "description": "Front squat into overhead press", "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400"},
            {"name": "Power Cleans", "duration": "40s", "rest": "20s", "description": "Explosive clean from floor to shoulders", "image": "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400"},
            {"name": "Barbell Rows", "duration": "40s", "rest": "20s", "description": "Bent over row for back", "image": "https://images.unsplash.com/photo-1597347316205-36f6c451902a?w=400"},
            {"name": "Push Press", "duration": "40s", "rest": "20s", "description": "Dip and drive overhead", "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400"},
            {"name": "Deadlifts", "duration": "40s", "rest": "20s", "description": "Full deadlift from floor", "image": "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=400"},
            {"name": "Front Squats", "duration": "40s", "rest": "20s", "description": "Barbell in front rack position", "image": "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400"},
            {"name": "Hang Cleans", "duration": "40s", "rest": "20s", "description": "Clean from hang position", "image": "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400"},
            {"name": "Barbell Lunges", "duration": "40s", "rest": "20s", "description": "Alternating lunges with barbell", "image": "https://images.unsplash.com/photo-1434682881908-b43d0467b798?w=400"},
        ],
        "rounds": 4
    },
    "hybrid_hiit": {
        "name": "Hybrid HIIT",
        "description": "Mix of bodyweight, kettlebell and cardio stations",
        "frequency": "4-5 days/week",
        "level": "intermediate",
        "type": "mixed",
        "duration": "45 min",
        "image": "https://images.unsplash.com/photo-1549576490-b0b4831ef60a?w=400",
        "stations": [
            {"name": "Battle Ropes", "duration": "30s", "rest": "15s", "description": "Alternating waves with ropes", "image": "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=400"},
            {"name": "Box Jumps", "duration": "30s", "rest": "15s", "description": "Explosive jump onto box", "image": "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?w=400"},
            {"name": "KB Swings", "duration": "30s", "rest": "15s", "description": "Russian style swings", "image": "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=400"},
            {"name": "Burpees", "duration": "30s", "rest": "15s", "description": "Full burpee with jump", "image": "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400"},
            {"name": "Rowing Machine", "duration": "30s", "rest": "15s", "description": "Max effort row", "image": "https://images.unsplash.com/photo-1519505907962-0a6cb0167c73?w=400"},
            {"name": "Medicine Ball Slams", "duration": "30s", "rest": "15s", "description": "Overhead slam with med ball", "image": "https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=400"},
            {"name": "Push-Ups", "duration": "30s", "rest": "15s", "description": "Standard or modified", "image": "https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=400"},
            {"name": "Assault Bike", "duration": "30s", "rest": "15s", "description": "All out sprint", "image": "https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=400"},
        ],
        "rounds": 4
    },
    "core_crusher": {
        "name": "Core Crusher",
        "description": "Intense core-focused circuit to build abs and stability",
        "frequency": "3-4 days/week",
        "level": "all_levels",
        "type": "bodyweight",
        "duration": "30 min",
        "image": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400",
        "stations": [
            {"name": "Plank Hold", "duration": "45s", "rest": "15s", "description": "Forearm plank, keep core tight", "image": "https://images.unsplash.com/photo-1566241142559-40e1dab266c6?w=400"},
            {"name": "Mountain Climbers", "duration": "45s", "rest": "15s", "description": "Fast knee drives in plank", "image": "https://images.unsplash.com/photo-1599058917765-a780eda07a3e?w=400"},
            {"name": "Russian Twists", "duration": "45s", "rest": "15s", "description": "Seated rotation side to side", "image": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
            {"name": "Bicycle Crunches", "duration": "45s", "rest": "15s", "description": "Alternating elbow to knee", "image": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
            {"name": "Leg Raises", "duration": "45s", "rest": "15s", "description": "Lying leg raises for lower abs", "image": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
            {"name": "Dead Bug", "duration": "45s", "rest": "15s", "description": "Opposite arm/leg extension", "image": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400"},
            {"name": "Side Plank (R)", "duration": "30s", "rest": "10s", "description": "Right side plank hold", "image": "https://images.unsplash.com/photo-1566241142559-40e1dab266c6?w=400"},
            {"name": "Side Plank (L)", "duration": "30s", "rest": "10s", "description": "Left side plank hold", "image": "https://images.unsplash.com/photo-1566241142559-40e1dab266c6?w=400"},
        ],
        "rounds": 3
    },
    "athletica": {
        "name": "Athletica",
        "description": "Athletic performance training with agility and power",
        "frequency": "3-4 days/week",
        "level": "intermediate",
        "type": "mixed",
        "duration": "45 min",
        "image": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400",
        "stations": [
            {"name": "Ladder Drills", "duration": "40s", "rest": "20s", "description": "Quick feet through agility ladder", "image": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400"},
            {"name": "Broad Jumps", "duration": "40s", "rest": "20s", "description": "Explosive horizontal jumps", "image": "https://images.unsplash.com/photo-1434682881908-b43d0467b798?w=400"},
            {"name": "Sprint Intervals", "duration": "40s", "rest": "20s", "description": "Max effort sprints", "image": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400"},
            {"name": "Cone Shuffles", "duration": "40s", "rest": "20s", "description": "Lateral shuffles between cones", "image": "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400"},
            {"name": "Box Step Ups", "duration": "40s", "rest": "20s", "description": "Alternating step ups on box", "image": "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?w=400"},
            {"name": "Plyo Push-Ups", "duration": "40s", "rest": "20s", "description": "Explosive clapping push-ups", "image": "https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=400"},
            {"name": "Bear Crawl", "duration": "40s", "rest": "20s", "description": "Crawl forward on hands and feet", "image": "https://images.unsplash.com/photo-1599058917765-a780eda07a3e?w=400"},
            {"name": "Vertical Jumps", "duration": "40s", "rest": "20s", "description": "Max height vertical jumps", "image": "https://images.unsplash.com/photo-1434682881908-b43d0467b798?w=400"},
        ],
        "rounds": 3
    }
}

# Weight Training Models
class WeightSet(BaseModel):
    set_number: int
    weight: float  # in lbs
    reps: int
    rpe: Optional[int] = None  # Rate of Perceived Exertion (1-10)

class WeightExerciseLog(BaseModel):
    exercise_name: str
    sets: List[WeightSet]
    notes: Optional[str] = None

class WeightWorkoutLog(BaseModel):
    workout_id: str
    user_id: str
    workout_name: str
    exercises: List[WeightExerciseLog]
    duration_minutes: int
    notes: Optional[str] = None
    timestamp: Optional[str] = None

class PersonalRecord(BaseModel):
    exercise_name: str
    weight: float
    reps: int
    date: str

@api_router.get("/weight-training/exercises")
async def get_weight_exercises(muscle_group: str = None):
    """Get weight training exercises, optionally filtered by muscle group"""
    if muscle_group and muscle_group in WEIGHT_EXERCISES:
        return {"muscle_group": muscle_group, "exercises": WEIGHT_EXERCISES[muscle_group]}
    return {"exercises": WEIGHT_EXERCISES}

@api_router.get("/weight-training/programs")
async def get_weight_programs():
    """Get all weight training programs"""
    return {"programs": WEIGHT_TRAINING_PROGRAMS}

@api_router.get("/weight-training/functional-programs")
async def get_functional_programs():
    """Get all functional/HIIT training programs"""
    return {"programs": FUNCTIONAL_TRAINING_PROGRAMS}

@api_router.get("/weight-training/programs/{program_id}")
async def get_weight_program(program_id: str):
    """Get a specific weight training program"""
    if program_id not in WEIGHT_TRAINING_PROGRAMS:
        raise HTTPException(status_code=404, detail="Program not found")
    return {"program": WEIGHT_TRAINING_PROGRAMS[program_id]}

@api_router.post("/weight-training/log")
async def log_weight_workout(workout: WeightWorkoutLog):
    """Log a completed weight training workout"""
    try:
        workout_dict = workout.dict()
        workout_dict["timestamp"] = workout.timestamp or datetime.utcnow().isoformat()
        workout_dict["log_id"] = f"wt_{workout.user_id}_{int(datetime.utcnow().timestamp())}"
        
        await db.weight_training_logs.insert_one(workout_dict)
        
        # Check for new PRs
        new_prs = []
        for exercise in workout.exercises:
            for s in exercise.sets:
                # Calculate estimated 1RM using Epley formula
                estimated_1rm = s.weight * (1 + s.reps / 30)
                
                # Check if this is a PR
                existing_pr = await db.personal_records.find_one({
                    "user_id": workout.user_id,
                    "exercise_name": exercise.exercise_name
                })
                
                if not existing_pr or estimated_1rm > existing_pr.get("estimated_1rm", 0):
                    pr_data = {
                        "user_id": workout.user_id,
                        "exercise_name": exercise.exercise_name,
                        "weight": s.weight,
                        "reps": s.reps,
                        "estimated_1rm": estimated_1rm,
                        "date": workout_dict["timestamp"]
                    }
                    
                    await db.personal_records.update_one(
                        {"user_id": workout.user_id, "exercise_name": exercise.exercise_name},
                        {"$set": pr_data},
                        upsert=True
                    )
                    new_prs.append({
                        "exercise": exercise.exercise_name,
                        "weight": s.weight,
                        "reps": s.reps,
                        "estimated_1rm": round(estimated_1rm, 1)
                    })
        
        # Calculate total volume
        total_volume = sum(
            sum(s.weight * s.reps for s in ex.sets)
            for ex in workout.exercises
        )
        
        return {
            "message": "Workout logged successfully",
            "log_id": workout_dict["log_id"],
            "total_volume": round(total_volume, 1),
            "new_prs": new_prs
        }
    except Exception as e:
        logger.error(f"Error logging weight workout: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/weight-training/history/{user_id}")
async def get_weight_history(user_id: str, days: int = 30):
    """Get user's weight training history"""
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        workouts = await db.weight_training_logs.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff.isoformat()}
        }).sort("timestamp", -1).to_list(100)
        
        for w in workouts:
            w.pop("_id", None)
        
        return {"workouts": workouts}
    except Exception as e:
        logger.error(f"Error getting weight history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/weight-training/log/{log_id}")
async def delete_weight_training_log(log_id: str, user_id: str):
    """Delete a weight training log and associated scheduled workouts"""
    try:
        # Delete from weight training logs
        result = await db.weight_training_logs.delete_one({"log_id": log_id, "user_id": user_id})
        
        # Also delete any associated scheduled workouts
        await db.scheduled_workouts.delete_many({"workout_id": log_id, "user_id": user_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Workout log not found")
        
        return {"message": "Workout deleted successfully", "deleted_count": result.deleted_count}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting weight training log: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/weight-training/reset/{user_id}")
async def reset_all_weight_training(user_id: str):
    """Reset all weight training data for a user (logs, PRs, scheduled workouts)"""
    try:
        # Delete all weight training logs
        logs_result = await db.weight_training_logs.delete_many({"user_id": user_id})
        
        # Delete all personal records
        prs_result = await db.personal_records.delete_many({"user_id": user_id})
        
        # Delete all scheduled workouts
        scheduled_result = await db.scheduled_workouts.delete_many({"user_id": user_id})
        
        return {
            "message": "All workout data reset successfully",
            "deleted_logs": logs_result.deleted_count,
            "deleted_prs": prs_result.deleted_count,
            "deleted_scheduled": scheduled_result.deleted_count
        }
    except Exception as e:
        logger.error(f"Error resetting weight training data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/weight-training/prs/{user_id}")
async def get_personal_records(user_id: str):
    """Get user's personal records"""
    try:
        prs = await db.personal_records.find({"user_id": user_id}).to_list(100)
        
        for pr in prs:
            pr.pop("_id", None)
        
        return {"personal_records": prs}
    except Exception as e:
        logger.error(f"Error getting PRs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/weight-training/exercise-progress/{user_id}/{exercise_name}")
async def get_exercise_progress(user_id: str, exercise_name: str, days: int = 90):
    """Get progress for a specific exercise over time"""
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        # Get all workout logs containing this exercise
        workouts = await db.weight_training_logs.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff.isoformat()},
            "exercises.exercise_name": exercise_name
        }).sort("timestamp", 1).to_list(100)
        
        progress_data = []
        for w in workouts:
            for ex in w.get("exercises", []):
                if ex.get("exercise_name") == exercise_name:
                    # Get best set (highest estimated 1RM)
                    best_set = max(
                        ex.get("sets", []),
                        key=lambda s: s.get("weight", 0) * (1 + s.get("reps", 0) / 30),
                        default=None
                    )
                    if best_set:
                        progress_data.append({
                            "date": w.get("timestamp"),
                            "weight": best_set.get("weight"),
                            "reps": best_set.get("reps"),
                            "estimated_1rm": round(best_set.get("weight", 0) * (1 + best_set.get("reps", 0) / 30), 1),
                            "total_volume": sum(s.get("weight", 0) * s.get("reps", 0) for s in ex.get("sets", []))
                        })
        
        return {
            "exercise_name": exercise_name,
            "progress": progress_data
        }
    except Exception as e:
        logger.error(f"Error getting exercise progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/weight-training/stats/{user_id}")
async def get_weight_training_stats(user_id: str):
    """Get overall weight training statistics"""
    try:
        # Get all workouts
        workouts = await db.weight_training_logs.find({"user_id": user_id}).to_list(1000)
        
        if not workouts:
            return {
                "total_workouts": 0,
                "total_volume": 0,
                "total_sets": 0,
                "favorite_exercises": [],
                "streak": 0
            }
        
        # Calculate stats
        total_volume = 0
        total_sets = 0
        exercise_counts = {}
        
        for w in workouts:
            for ex in w.get("exercises", []):
                ex_name = ex.get("exercise_name")
                exercise_counts[ex_name] = exercise_counts.get(ex_name, 0) + 1
                for s in ex.get("sets", []):
                    total_sets += 1
                    total_volume += s.get("weight", 0) * s.get("reps", 0)
        
        # Top exercises
        top_exercises = sorted(exercise_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        
        # Get PR count
        prs = await db.personal_records.count_documents({"user_id": user_id})
        
        return {
            "total_workouts": len(workouts),
            "total_volume": round(total_volume, 1),
            "total_sets": total_sets,
            "total_prs": prs,
            "favorite_exercises": [{"name": name, "count": count} for name, count in top_exercises]
        }
    except Exception as e:
        logger.error(f"Error getting weight training stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# ADVANCED PROGRESS & ANALYTICS
# ============================================================================

class BodyMeasurement(BaseModel):
    user_id: str
    weight: Optional[float] = None  # lbs
    body_fat: Optional[float] = None  # percentage
    chest: Optional[float] = None  # inches
    waist: Optional[float] = None  # inches
    hips: Optional[float] = None  # inches
    biceps: Optional[float] = None  # inches
    thighs: Optional[float] = None  # inches
    notes: Optional[str] = None

@api_router.post("/progress/body-measurements")
async def log_body_measurement(measurement: BodyMeasurement):
    """Log body measurements"""
    try:
        measurement_dict = measurement.dict()
        measurement_dict["measurement_id"] = f"bm_{measurement.user_id}_{int(datetime.utcnow().timestamp())}"
        measurement_dict["timestamp"] = datetime.utcnow().isoformat()
        
        await db.body_measurements.insert_one(measurement_dict)
        
        return {"message": "Measurement logged", "measurement_id": measurement_dict["measurement_id"]}
    except Exception as e:
        logger.error(f"Error logging measurement: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/progress/body-measurements/{user_id}")
async def get_body_measurements(user_id: str, days: int = 90):
    """Get body measurement history"""
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        measurements = await db.body_measurements.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff.isoformat()}
        }).sort("timestamp", 1).to_list(100)
        
        for m in measurements:
            m.pop("_id", None)
        
        return {"measurements": measurements}
    except Exception as e:
        logger.error(f"Error getting measurements: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/progress/comprehensive/{user_id}")
async def get_comprehensive_progress(user_id: str, days: int = 30):
    """Get comprehensive progress data for charts and analytics"""
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        cutoff_iso = cutoff.isoformat()
        
        # Get all workout data
        workouts = await db.workouts.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff_iso}
        }).sort("timestamp", 1).to_list(1000)
        
        # Get weight training data
        weight_workouts = await db.weight_training_logs.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff_iso}
        }).sort("timestamp", 1).to_list(100)
        
        # Get runs
        runs = await db.runs.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff_iso}
        }).sort("timestamp", 1).to_list(100)
        
        # Get meals
        meals = await db.meals.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff_iso}
        }).sort("timestamp", 1).to_list(500)
        
        # Get water intake
        water = await db.water_intake.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff_iso}
        }).sort("timestamp", 1).to_list(500)
        
        # Get body measurements
        body_measurements = await db.body_measurements.find({
            "user_id": user_id
        }).sort("timestamp", -1).limit(30).to_list(30)
        
        # Aggregate daily stats
        daily_stats = {}
        
        # Process workouts
        for w in workouts:
            date = w.get("timestamp", "")[:10]
            if date not in daily_stats:
                daily_stats[date] = {
                    "date": date,
                    "calories_burned": 0,
                    "workout_minutes": 0,
                    "workouts_count": 0,
                    "calories_consumed": 0,
                    "protein": 0,
                    "carbs": 0,
                    "fat": 0,
                    "water_oz": 0,
                    "weight_volume": 0,
                    "run_distance": 0
                }
            daily_stats[date]["calories_burned"] += w.get("calories_burned", 0)
            daily_stats[date]["workout_minutes"] += w.get("duration", 0)
            daily_stats[date]["workouts_count"] += 1
        
        # Process weight training
        for wt in weight_workouts:
            date = wt.get("timestamp", "")[:10]
            if date not in daily_stats:
                daily_stats[date] = {
                    "date": date,
                    "calories_burned": 0,
                    "workout_minutes": 0,
                    "workouts_count": 0,
                    "calories_consumed": 0,
                    "protein": 0,
                    "carbs": 0,
                    "fat": 0,
                    "water_oz": 0,
                    "weight_volume": 0,
                    "run_distance": 0
                }
            
            # Calculate volume
            volume = 0
            for ex in wt.get("exercises", []):
                for s in ex.get("sets", []):
                    volume += s.get("weight", 0) * s.get("reps", 0)
            
            daily_stats[date]["weight_volume"] += volume
            daily_stats[date]["workout_minutes"] += wt.get("duration_minutes", 0)
            daily_stats[date]["workouts_count"] += 1
        
        # Process runs
        for r in runs:
            date = r.get("timestamp", "")[:10]
            if date not in daily_stats:
                daily_stats[date] = {
                    "date": date,
                    "calories_burned": 0,
                    "workout_minutes": 0,
                    "workouts_count": 0,
                    "calories_consumed": 0,
                    "protein": 0,
                    "carbs": 0,
                    "fat": 0,
                    "water_oz": 0,
                    "weight_volume": 0,
                    "run_distance": 0
                }
            daily_stats[date]["calories_burned"] += r.get("calories_burned", 0)
            daily_stats[date]["run_distance"] += r.get("distance", 0)
            daily_stats[date]["workout_minutes"] += r.get("duration", 0) // 60
        
        # Process meals
        for m in meals:
            date = m.get("timestamp", "")[:10]
            if date not in daily_stats:
                daily_stats[date] = {
                    "date": date,
                    "calories_burned": 0,
                    "workout_minutes": 0,
                    "workouts_count": 0,
                    "calories_consumed": 0,
                    "protein": 0,
                    "carbs": 0,
                    "fat": 0,
                    "water_oz": 0,
                    "weight_volume": 0,
                    "run_distance": 0
                }
            nutrition = m.get("nutrition", {})
            daily_stats[date]["calories_consumed"] += nutrition.get("calories", 0)
            daily_stats[date]["protein"] += nutrition.get("protein", 0)
            daily_stats[date]["carbs"] += nutrition.get("carbs", 0)
            daily_stats[date]["fat"] += nutrition.get("fat", 0)
        
        # Process water
        for w in water:
            date = w.get("timestamp", "")[:10]
            if date not in daily_stats:
                daily_stats[date] = {
                    "date": date,
                    "calories_burned": 0,
                    "workout_minutes": 0,
                    "workouts_count": 0,
                    "calories_consumed": 0,
                    "protein": 0,
                    "carbs": 0,
                    "fat": 0,
                    "water_oz": 0,
                    "weight_volume": 0,
                    "run_distance": 0
                }
            daily_stats[date]["water_oz"] += w.get("amount", 0)
        
        # Convert to sorted list
        daily_data = sorted(daily_stats.values(), key=lambda x: x["date"])
        
        # Calculate totals and averages
        total_calories_burned = sum(d["calories_burned"] for d in daily_data)
        total_workout_minutes = sum(d["workout_minutes"] for d in daily_data)
        total_workouts = sum(d["workouts_count"] for d in daily_data)
        total_distance = sum(d["run_distance"] for d in daily_data)
        total_volume = sum(d["weight_volume"] for d in daily_data)
        
        days_with_data = len([d for d in daily_data if d["workouts_count"] > 0])
        
        # Calculate streak
        streak = 0
        today = datetime.utcnow().date()
        for i in range(days):
            check_date = (today - timedelta(days=i)).isoformat()
            if check_date in daily_stats and daily_stats[check_date]["workouts_count"] > 0:
                streak += 1
            else:
                break
        
        # Get PRs
        prs = await db.personal_records.find({"user_id": user_id}).to_list(50)
        for pr in prs:
            pr.pop("_id", None)
        
        # Body measurements for chart
        for bm in body_measurements:
            bm.pop("_id", None)
        
        return {
            "period_days": days,
            "daily_data": daily_data,
            "summary": {
                "total_calories_burned": round(total_calories_burned),
                "total_workout_minutes": round(total_workout_minutes),
                "total_workouts": total_workouts,
                "total_run_distance": round(total_distance, 2),
                "total_weight_volume": round(total_volume),
                "avg_daily_calories_burned": round(total_calories_burned / max(days_with_data, 1)),
                "avg_workout_duration": round(total_workout_minutes / max(total_workouts, 1)),
                "current_streak": streak,
                "active_days": days_with_data
            },
            "personal_records": prs,
            "body_measurements": list(reversed(body_measurements))
        }
    except Exception as e:
        logger.error(f"Error getting comprehensive progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/progress/workout-breakdown/{user_id}")
async def get_workout_breakdown(user_id: str, days: int = 30):
    """Get breakdown of workout types"""
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        # Get all workouts
        workouts = await db.workouts.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff.isoformat()}
        }).to_list(500)
        
        weight_workouts = await db.weight_training_logs.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff.isoformat()}
        }).to_list(100)
        
        runs = await db.runs.find({
            "user_id": user_id,
            "timestamp": {"$gte": cutoff.isoformat()}
        }).to_list(100)
        
        ai_workouts = await db.ai_workouts.find({
            "user_id": user_id,
            "last_completed": {"$exists": True}
        }).to_list(100)
        
        # Count by type
        breakdown = {
            "weight_training": len(weight_workouts),
            "running": len(runs),
            "ai_workouts": len([w for w in ai_workouts if w.get("completion_count", 0) > 0]),
            "other": len(workouts)
        }
        
        # Muscle group breakdown from weight training
        muscle_groups = {}
        for wt in weight_workouts:
            for ex in wt.get("exercises", []):
                # Try to determine muscle group from exercise name
                ex_name = ex.get("exercise_name", "").lower()
                if any(w in ex_name for w in ["bench", "chest", "fly", "push"]):
                    muscle_groups["chest"] = muscle_groups.get("chest", 0) + 1
                elif any(w in ex_name for w in ["row", "pull", "lat", "deadlift", "back"]):
                    muscle_groups["back"] = muscle_groups.get("back", 0) + 1
                elif any(w in ex_name for w in ["squat", "leg", "lunge", "calf", "hip"]):
                    muscle_groups["legs"] = muscle_groups.get("legs", 0) + 1
                elif any(w in ex_name for w in ["shoulder", "press", "lateral", "raise"]):
                    muscle_groups["shoulders"] = muscle_groups.get("shoulders", 0) + 1
                elif any(w in ex_name for w in ["curl", "tricep", "bicep", "arm"]):
                    muscle_groups["arms"] = muscle_groups.get("arms", 0) + 1
                elif any(w in ex_name for w in ["plank", "crunch", "ab", "core"]):
                    muscle_groups["core"] = muscle_groups.get("core", 0) + 1
        
        return {
            "workout_types": breakdown,
            "muscle_groups": muscle_groups,
            "total_workouts": sum(breakdown.values())
        }
    except Exception as e:
        logger.error(f"Error getting workout breakdown: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/progress/goals/{user_id}")
async def get_goals_progress(user_id: str):
    """Get progress towards fitness goals"""
    try:
        # Get user profile for goals
        profile = await db.user_profiles.find_one({"user_id": user_id})
        
        if not profile:
            return {"message": "No profile found", "goals": []}
        
        goals = []
        
        # Weight goal
        if profile.get("goal_weight") and profile.get("weight"):
            current = profile.get("weight")
            target = profile.get("goal_weight")
            start = profile.get("starting_weight", current)
            
            if target < start:  # Weight loss
                progress = max(0, min(100, ((start - current) / (start - target)) * 100))
                goals.append({
                    "name": "Weight Loss Goal",
                    "current": current,
                    "target": target,
                    "start": start,
                    "progress": round(progress),
                    "remaining": round(current - target, 1),
                    "unit": "lbs"
                })
            else:  # Weight gain
                progress = max(0, min(100, ((current - start) / (target - start)) * 100))
                goals.append({
                    "name": "Weight Gain Goal",
                    "current": current,
                    "target": target,
                    "start": start,
                    "progress": round(progress),
                    "remaining": round(target - current, 1),
                    "unit": "lbs"
                })
        
        # Weekly workout goal (default: 4 workouts)
        weekly_goal = profile.get("weekly_workout_goal", 4)
        this_week_start = datetime.utcnow() - timedelta(days=datetime.utcnow().weekday())
        
        weekly_workouts = await db.workouts.count_documents({
            "user_id": user_id,
            "timestamp": {"$gte": this_week_start.isoformat()}
        })
        weekly_wt = await db.weight_training_logs.count_documents({
            "user_id": user_id,
            "timestamp": {"$gte": this_week_start.isoformat()}
        })
        weekly_runs = await db.runs.count_documents({
            "user_id": user_id,
            "timestamp": {"$gte": this_week_start.isoformat()}
        })
        
        total_weekly = weekly_workouts + weekly_wt + weekly_runs
        
        goals.append({
            "name": "Weekly Workouts",
            "current": total_weekly,
            "target": weekly_goal,
            "progress": min(100, round((total_weekly / weekly_goal) * 100)),
            "remaining": max(0, weekly_goal - total_weekly),
            "unit": "workouts"
        })
        
        # Daily calorie goal
        calorie_goal = profile.get("calorie_goal")
        if calorie_goal:
            today = datetime.utcnow().date().isoformat()
            today_meals = await db.meals.find({
                "user_id": user_id,
                "timestamp": {"$regex": f"^{today}"}
            }).to_list(50)
            
            today_calories = sum(m.get("nutrition", {}).get("calories", 0) for m in today_meals)
            
            goals.append({
                "name": "Daily Calories",
                "current": round(today_calories),
                "target": calorie_goal,
                "progress": min(100, round((today_calories / calorie_goal) * 100)),
                "remaining": max(0, calorie_goal - today_calories),
                "unit": "cal"
            })
        
        # Water goal (default: 64 oz)
        water_goal = profile.get("daily_water_goal", 64)
        today = datetime.utcnow().date().isoformat()
        today_water = await db.water_intake.find({
            "user_id": user_id,
            "timestamp": {"$regex": f"^{today}"}
        }).to_list(50)
        
        total_water = sum(w.get("amount", 0) for w in today_water)
        
        goals.append({
            "name": "Daily Water",
            "current": round(total_water),
            "target": water_goal,
            "progress": min(100, round((total_water / water_goal) * 100)),
            "remaining": max(0, water_goal - total_water),
            "unit": "oz"
        })
        
        return {"goals": goals}
    except Exception as e:
        logger.error(f"Error getting goals progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# GAMIFICATION ENDPOINTS
# ============================================================================

# Badge definitions
BADGES = [
    # Getting Started
    {"id": "first_workout", "name": "First Step", "description": "Complete your first workout", "icon": "🏃", "points": 10, "category": "starter"},
    {"id": "first_meal", "name": "Nutrition Novice", "description": "Log your first meal", "icon": "🍎", "points": 10, "category": "starter"},
    {"id": "first_run", "name": "Running Start", "description": "Complete your first run", "icon": "👟", "points": 10, "category": "starter"},
    {"id": "profile_complete", "name": "All Set Up", "description": "Complete your profile", "icon": "✅", "points": 15, "category": "starter"},
    
    # Streaks
    {"id": "week_streak", "name": "Week Warrior", "description": "7-day workout streak", "icon": "🔥", "points": 50, "category": "streak"},
    {"id": "two_week_streak", "name": "Unstoppable", "description": "14-day workout streak", "icon": "⚡", "points": 100, "category": "streak"},
    {"id": "month_streak", "name": "Monthly Champion", "description": "30-day workout streak", "icon": "🏆", "points": 200, "category": "streak"},
    {"id": "hydration_streak", "name": "Hydration Hero", "description": "Log water for 7 consecutive days", "icon": "💧", "points": 30, "category": "streak"},
    
    # Running Achievements
    {"id": "run_5k", "name": "5K Runner", "description": "Complete a 5K (3.1 mi) run", "icon": "🏅", "points": 50, "category": "running"},
    {"id": "run_10k", "name": "10K Champion", "description": "Complete a 10K (6.2 mi) run", "icon": "🥇", "points": 100, "category": "running"},
    {"id": "run_half_marathon", "name": "Half Marathon Hero", "description": "Complete a half marathon (13.1 mi)", "icon": "🎖️", "points": 250, "category": "running"},
    {"id": "run_marathon", "name": "Marathon Master", "description": "Complete a marathon (26.2 mi)", "icon": "👑", "points": 500, "category": "running"},
    {"id": "run_50_miles", "name": "50 Mile Club", "description": "Run 50 miles total", "icon": "🚀", "points": 75, "category": "running"},
    {"id": "run_100_miles", "name": "Century Runner", "description": "Run 100 miles total", "icon": "💯", "points": 150, "category": "running"},
    
    # Workout Achievements
    {"id": "calorie_crusher", "name": "Calorie Crusher", "description": "Burn 10,000 calories total", "icon": "💪", "points": 100, "category": "fitness"},
    {"id": "calorie_inferno", "name": "Calorie Inferno", "description": "Burn 50,000 calories total", "icon": "🔥", "points": 300, "category": "fitness"},
    {"id": "workout_10", "name": "Getting Serious", "description": "Complete 10 workouts", "icon": "💪", "points": 25, "category": "fitness"},
    {"id": "workout_50", "name": "Dedicated", "description": "Complete 50 workouts", "icon": "🎯", "points": 75, "category": "fitness"},
    {"id": "workout_100", "name": "Centurion", "description": "Complete 100 workouts", "icon": "⭐", "points": 150, "category": "fitness"},
    
    # Nutrition Achievements
    {"id": "meal_master", "name": "Meal Master", "description": "Log 50 meals", "icon": "🍽️", "points": 75, "category": "nutrition"},
    {"id": "meal_expert", "name": "Nutrition Expert", "description": "Log 200 meals", "icon": "🥗", "points": 150, "category": "nutrition"},
    {"id": "protein_pro", "name": "Protein Pro", "description": "Hit protein goal 7 days in a row", "icon": "🥩", "points": 50, "category": "nutrition"},
    
    # Weight Training
    {"id": "first_lift", "name": "Iron Rookie", "description": "Log your first weight training session", "icon": "🏋️", "points": 10, "category": "weights"},
    {"id": "lift_10_sessions", "name": "Gym Regular", "description": "Complete 10 weight training sessions", "icon": "💪", "points": 40, "category": "weights"},
    {"id": "pr_breaker", "name": "PR Breaker", "description": "Set 5 personal records", "icon": "📈", "points": 50, "category": "weights"},
    {"id": "volume_king", "name": "Volume King", "description": "Lift 100,000 lbs total volume", "icon": "👑", "points": 100, "category": "weights"},
    
    # Time-based
    {"id": "early_bird", "name": "Early Bird", "description": "Complete 10 workouts before 7am", "icon": "🌅", "points": 40, "category": "special"},
    {"id": "night_owl", "name": "Night Owl", "description": "Complete 10 workouts after 8pm", "icon": "🦉", "points": 40, "category": "special"},
    {"id": "weekend_warrior", "name": "Weekend Warrior", "description": "Complete 20 weekend workouts", "icon": "📅", "points": 60, "category": "special"},
]

# Daily Challenges (rotate daily)
DAILY_CHALLENGES = [
    {"id": "daily_steps_5000", "name": "Step It Up", "description": "Walk 5,000 steps today", "target": 5000, "type": "steps", "points": 15},
    {"id": "daily_steps_10000", "name": "Step Master", "description": "Walk 10,000 steps today", "target": 10000, "type": "steps", "points": 25},
    {"id": "daily_water_8", "name": "Hydrate", "description": "Drink 8 glasses of water", "target": 64, "type": "water", "points": 10},
    {"id": "daily_workout", "name": "Move It", "description": "Complete any workout today", "target": 1, "type": "workout", "points": 20},
    {"id": "daily_run_1mi", "name": "Quick Run", "description": "Run at least 1 mile", "target": 1, "type": "run_distance", "points": 15},
    {"id": "daily_run_2mi", "name": "Solid Run", "description": "Run at least 2 miles", "target": 2, "type": "run_distance", "points": 25},
    {"id": "daily_calories_300", "name": "Burn Baby Burn", "description": "Burn 300 calories", "target": 300, "type": "calories", "points": 20},
    {"id": "daily_calories_500", "name": "Calorie Torch", "description": "Burn 500 calories", "target": 500, "type": "calories", "points": 35},
    {"id": "daily_log_meals", "name": "Track Your Fuel", "description": "Log all 3 meals today", "target": 3, "type": "meals", "points": 15},
    {"id": "daily_strength", "name": "Lift Heavy", "description": "Complete a strength workout", "target": 1, "type": "strength", "points": 20},
]

# Weekly Challenges
WEEKLY_CHALLENGES = [
    {"id": "weekly_workouts_5", "name": "Five for Five", "description": "Complete 5 workouts this week", "target": 5, "type": "workouts", "points": 50},
    {"id": "weekly_run_10mi", "name": "10 Mile Week", "description": "Run 10 miles this week", "target": 10, "type": "run_distance", "points": 75},
    {"id": "weekly_run_20mi", "name": "20 Mile Week", "description": "Run 20 miles this week", "target": 20, "type": "run_distance", "points": 125},
    {"id": "weekly_calories_3000", "name": "Burn 3K", "description": "Burn 3,000 calories this week", "target": 3000, "type": "calories", "points": 60},
    {"id": "weekly_strength_3", "name": "Strength Week", "description": "Complete 3 strength sessions", "target": 3, "type": "strength", "points": 45},
    {"id": "weekly_perfect_hydration", "name": "Hydration Week", "description": "Hit water goal every day", "target": 7, "type": "water_days", "points": 40},
    {"id": "weekly_meal_tracking", "name": "Nutrition Week", "description": "Log meals every day this week", "target": 7, "type": "meal_days", "points": 50},
]

@api_router.get("/gamification/badges")
async def get_all_badges():
    """Get all available badges"""
    return {"badges": BADGES}

@api_router.get("/gamification/user-badges/{user_id}")
async def get_user_badges(user_id: str):
    """Get badges earned by a user"""
    try:
        user_badges = await db.user_badges.find({"user_id": user_id}).to_list(100)
        earned_badge_ids = [b["badge_id"] for b in user_badges]
        
        badges_with_status = []
        for badge in BADGES:
            badges_with_status.append({
                **badge,
                "earned": badge["id"] in earned_badge_ids,
                "earned_at": next((b["earned_at"] for b in user_badges if b["badge_id"] == badge["id"]), None)
            })
        
        total_points = sum(b["points"] for b in BADGES if b["id"] in earned_badge_ids)
        
        return {
            "user_id": user_id,
            "badges": badges_with_status,
            "total_points": total_points,
            "badges_earned": len(earned_badge_ids),
            "badges_total": len(BADGES)
        }
    except Exception as e:
        logger.error(f"Error getting user badges: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/gamification/check-badges/{user_id}")
async def check_and_award_badges(user_id: str):
    """Check user progress and award any earned badges"""
    try:
        awarded = []
        
        # Get user stats
        workouts = await db.workouts.find({"user_id": user_id}).to_list(1000)
        meals = await db.meals.find({"user_id": user_id}).to_list(1000)
        water = await db.water_intake.find({"user_id": user_id}).to_list(1000)
        runs = await db.runs.find({"user_id": user_id}).to_list(100)
        weight_sessions = await db.weight_logs.find({"user_id": user_id}).to_list(500)
        profile = await db.user_profiles.find_one({"user_id": user_id})
        
        existing_badges = await db.user_badges.find({"user_id": user_id}).to_list(100)
        existing_ids = [b["badge_id"] for b in existing_badges]
        
        async def award_badge(badge_id: str):
            if badge_id not in existing_ids:
                badge = next((b for b in BADGES if b["id"] == badge_id), None)
                if badge:
                    await db.user_badges.insert_one({
                        "user_id": user_id,
                        "badge_id": badge_id,
                        "earned_at": datetime.utcnow().isoformat()
                    })
                    awarded.append(badge)
                    existing_ids.append(badge_id)
        
        # ===== STARTER BADGES =====
        if len(workouts) >= 1:
            await award_badge("first_workout")
        
        if len(meals) >= 1:
            await award_badge("first_meal")
            
        if len(runs) >= 1:
            await award_badge("first_run")
            
        if profile and profile.get("name") and profile.get("weight"):
            await award_badge("profile_complete")
        
        # ===== WORKOUT BADGES =====
        if len(workouts) >= 10:
            await award_badge("workout_10")
        if len(workouts) >= 50:
            await award_badge("workout_50")
        if len(workouts) >= 100:
            await award_badge("workout_100")
        
        # ===== NUTRITION BADGES =====
        if len(meals) >= 50:
            await award_badge("meal_master")
        if len(meals) >= 200:
            await award_badge("meal_expert")
        
        # ===== RUNNING BADGES =====
        total_run_distance = sum(r.get("distance", 0) for r in runs)
        
        for run in runs:
            distance = run.get("distance", 0)
            # Distance is in miles
            if distance >= 3.1:  # 5K
                await award_badge("run_5k")
            if distance >= 6.2:  # 10K
                await award_badge("run_10k")
            if distance >= 13.1:  # Half marathon
                await award_badge("run_half_marathon")
            if distance >= 26.2:  # Marathon
                await award_badge("run_marathon")
        
        if total_run_distance >= 50:
            await award_badge("run_50_miles")
        if total_run_distance >= 100:
            await award_badge("run_100_miles")
        
        # ===== CALORIE BADGES =====
        total_calories = sum(w.get("calories_burned", 0) for w in workouts)
        total_calories += sum(r.get("calories_burned", 0) for r in runs)
        
        if total_calories >= 10000:
            await award_badge("calorie_crusher")
        if total_calories >= 50000:
            await award_badge("calorie_inferno")
        
        # ===== WEIGHT TRAINING BADGES =====
        if len(weight_sessions) >= 1:
            await award_badge("first_lift")
        if len(weight_sessions) >= 10:
            await award_badge("lift_10_sessions")
        
        # Calculate total volume
        total_volume = 0
        for session in weight_sessions:
            for exercise in session.get("exercises", []):
                for set_data in exercise.get("sets", []):
                    total_volume += set_data.get("weight", 0) * set_data.get("reps", 0)
        
        if total_volume >= 100000:
            await award_badge("volume_king")
        
        # Count PRs
        pr_count = await db.personal_records.count_documents({"user_id": user_id})
        if pr_count >= 5:
            await award_badge("pr_breaker")
        
        # ===== TIME-BASED BADGES =====
        early_workouts = [w for w in workouts if w.get("timestamp") and 
                         datetime.fromisoformat(w["timestamp"].replace('Z', '+00:00')).hour < 7]
        if len(early_workouts) >= 10:
            await award_badge("early_bird")
        
        late_workouts = [w for w in workouts if w.get("timestamp") and 
                        datetime.fromisoformat(w["timestamp"].replace('Z', '+00:00')).hour >= 20]
        if len(late_workouts) >= 10:
            await award_badge("night_owl")
        
        weekend_workouts = [w for w in workouts if w.get("timestamp") and 
                           datetime.fromisoformat(w["timestamp"].replace('Z', '+00:00')).weekday() >= 5]
        if len(weekend_workouts) >= 20:
            await award_badge("weekend_warrior")
        
        return {
            "user_id": user_id,
            "new_badges_awarded": awarded,
            "total_badges": len(existing_ids)
        }
    except Exception as e:
        logger.error(f"Error checking badges: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/gamification/leaderboard")
async def get_leaderboard(limit: int = 10):
    """Get top users by points"""
    try:
        # Aggregate user points
        pipeline = [
            {"$group": {"_id": "$user_id", "badges": {"$push": "$badge_id"}}},
            {"$project": {
                "user_id": "$_id",
                "badge_count": {"$size": "$badges"},
                "badges": 1
            }},
            {"$sort": {"badge_count": -1}},
            {"$limit": limit}
        ]
        
        results = await db.user_badges.aggregate(pipeline).to_list(limit)
        
        leaderboard = []
        for i, result in enumerate(results):
            points = sum(
                next((b["points"] for b in BADGES if b["id"] == bid), 0)
                for bid in result.get("badges", [])
            )
            
            # Get user profile for name
            profile = await db.user_profiles.find_one({"user_id": result["user_id"]})
            
            leaderboard.append({
                "rank": i + 1,
                "user_id": result["user_id"],
                "name": profile.get("name", "Anonymous") if profile else "Anonymous",
                "badge_count": result["badge_count"],
                "total_points": points
            })
        
        return {"leaderboard": leaderboard}
    except Exception as e:
        logger.error(f"Error getting leaderboard: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# CHALLENGES ENDPOINTS
# ============================================================================

def get_daily_challenges_for_date(date: datetime):
    """Get the daily challenges for a specific date (rotates based on day of year)"""
    import random
    day_of_year = date.timetuple().tm_yday
    random.seed(day_of_year)
    # Pick 3 random challenges for the day
    challenges = random.sample(DAILY_CHALLENGES, min(3, len(DAILY_CHALLENGES)))
    return challenges

def get_weekly_challenges_for_week(date: datetime):
    """Get the weekly challenges for a specific week"""
    import random
    week_number = date.isocalendar()[1]
    random.seed(week_number * 100)
    # Pick 2 random weekly challenges
    challenges = random.sample(WEEKLY_CHALLENGES, min(2, len(WEEKLY_CHALLENGES)))
    return challenges

@api_router.get("/challenges/daily/{user_id}")
async def get_daily_challenges(user_id: str):
    """Get today's daily challenges with user progress"""
    try:
        today = datetime.utcnow()
        today_str = today.date().isoformat()
        challenges = get_daily_challenges_for_date(today)
        
        # Get user's progress on these challenges
        user_challenges = await db.user_challenges.find({
            "user_id": user_id,
            "date": today_str,
            "type": "daily"
        }).to_list(100)
        
        completed_ids = {c["challenge_id"] for c in user_challenges if c.get("completed")}
        progress_map = {c["challenge_id"]: c.get("progress", 0) for c in user_challenges}
        
        # Calculate actual progress from user data
        for challenge in challenges:
            challenge["progress"] = progress_map.get(challenge["id"], 0)
            challenge["completed"] = challenge["id"] in completed_ids
            challenge["date"] = today_str
        
        return {
            "date": today_str,
            "challenges": challenges,
            "completed_count": len(completed_ids),
            "total_count": len(challenges)
        }
    except Exception as e:
        logger.error(f"Error getting daily challenges: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/challenges/weekly/{user_id}")
async def get_weekly_challenges(user_id: str):
    """Get this week's challenges with user progress"""
    try:
        today = datetime.utcnow()
        week_start = (today - timedelta(days=today.weekday())).date().isoformat()
        challenges = get_weekly_challenges_for_week(today)
        
        # Get user's progress
        user_challenges = await db.user_challenges.find({
            "user_id": user_id,
            "week_start": week_start,
            "type": "weekly"
        }).to_list(100)
        
        completed_ids = {c["challenge_id"] for c in user_challenges if c.get("completed")}
        progress_map = {c["challenge_id"]: c.get("progress", 0) for c in user_challenges}
        
        for challenge in challenges:
            challenge["progress"] = progress_map.get(challenge["id"], 0)
            challenge["completed"] = challenge["id"] in completed_ids
            challenge["week_start"] = week_start
        
        return {
            "week_start": week_start,
            "challenges": challenges,
            "completed_count": len(completed_ids),
            "total_count": len(challenges)
        }
    except Exception as e:
        logger.error(f"Error getting weekly challenges: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class ChallengeProgressUpdate(BaseModel):
    challenge_id: str
    progress: float
    challenge_type: str  # "daily" or "weekly"

@api_router.post("/challenges/update-progress/{user_id}")
async def update_challenge_progress(user_id: str, data: ChallengeProgressUpdate):
    """Update progress on a challenge"""
    try:
        today = datetime.utcnow()
        
        if data.challenge_type == "daily":
            date_key = today.date().isoformat()
            challenge_list = DAILY_CHALLENGES
            filter_key = "date"
        else:
            date_key = (today - timedelta(days=today.weekday())).date().isoformat()
            challenge_list = WEEKLY_CHALLENGES
            filter_key = "week_start"
        
        # Find the challenge
        challenge = next((c for c in challenge_list if c["id"] == data.challenge_id), None)
        if not challenge:
            raise HTTPException(status_code=404, detail="Challenge not found")
        
        completed = data.progress >= challenge["target"]
        
        # Update or insert progress
        await db.user_challenges.update_one(
            {
                "user_id": user_id,
                "challenge_id": data.challenge_id,
                filter_key: date_key
            },
            {
                "$set": {
                    "user_id": user_id,
                    "challenge_id": data.challenge_id,
                    "type": data.challenge_type,
                    filter_key: date_key,
                    "progress": data.progress,
                    "completed": completed,
                    "updated_at": datetime.utcnow().isoformat()
                }
            },
            upsert=True
        )
        
        # Award points if just completed
        points_awarded = 0
        if completed:
            existing = await db.challenge_completions.find_one({
                "user_id": user_id,
                "challenge_id": data.challenge_id,
                filter_key: date_key
            })
            
            if not existing:
                await db.challenge_completions.insert_one({
                    "user_id": user_id,
                    "challenge_id": data.challenge_id,
                    "type": data.challenge_type,
                    filter_key: date_key,
                    "points": challenge["points"],
                    "completed_at": datetime.utcnow().isoformat()
                })
                points_awarded = challenge["points"]
        
        return {
            "success": True,
            "completed": completed,
            "points_awarded": points_awarded,
            "progress": data.progress,
            "target": challenge["target"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating challenge progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/challenges/stats/{user_id}")
async def get_challenge_stats(user_id: str):
    """Get user's challenge completion stats"""
    try:
        # Count completed challenges
        daily_completed = await db.challenge_completions.count_documents({
            "user_id": user_id,
            "type": "daily"
        })
        
        weekly_completed = await db.challenge_completions.count_documents({
            "user_id": user_id,
            "type": "weekly"
        })
        
        # Calculate total points from challenges
        challenge_points = await db.challenge_completions.aggregate([
            {"$match": {"user_id": user_id}},
            {"$group": {"_id": None, "total": {"$sum": "$points"}}}
        ]).to_list(1)
        
        total_challenge_points = challenge_points[0]["total"] if challenge_points else 0
        
        # Get current streak (consecutive days with at least one challenge completed)
        today = datetime.utcnow().date()
        streak = 0
        check_date = today
        
        while True:
            date_str = check_date.isoformat()
            completed = await db.challenge_completions.find_one({
                "user_id": user_id,
                "type": "daily",
                "date": date_str
            })
            if completed:
                streak += 1
                check_date -= timedelta(days=1)
            else:
                break
        
        return {
            "daily_challenges_completed": daily_completed,
            "weekly_challenges_completed": weekly_completed,
            "total_challenge_points": total_challenge_points,
            "current_streak": streak
        }
    except Exception as e:
        logger.error(f"Error getting challenge stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/gamification/summary/{user_id}")
async def get_gamification_summary(user_id: str):
    """Get complete gamification summary for user"""
    try:
        # Get badges
        user_badges = await db.user_badges.find({"user_id": user_id}).to_list(100)
        earned_badge_ids = [b["badge_id"] for b in user_badges]
        badge_points = sum(b["points"] for b in BADGES if b["id"] in earned_badge_ids)
        
        # Get challenge stats
        challenge_points_result = await db.challenge_completions.aggregate([
            {"$match": {"user_id": user_id}},
            {"$group": {"_id": None, "total": {"$sum": "$points"}}}
        ]).to_list(1)
        challenge_points = challenge_points_result[0]["total"] if challenge_points_result else 0
        
        # Calculate level based on total points
        total_points = badge_points + challenge_points
        level = 1
        points_for_next = 100
        
        if total_points >= 2000:
            level = 10
            points_for_next = 0
        elif total_points >= 1500:
            level = 9
            points_for_next = 2000
        elif total_points >= 1100:
            level = 8
            points_for_next = 1500
        elif total_points >= 800:
            level = 7
            points_for_next = 1100
        elif total_points >= 550:
            level = 6
            points_for_next = 800
        elif total_points >= 350:
            level = 5
            points_for_next = 550
        elif total_points >= 200:
            level = 4
            points_for_next = 350
        elif total_points >= 100:
            level = 3
            points_for_next = 200
        elif total_points >= 50:
            level = 2
            points_for_next = 100
        
        level_names = {
            1: "Beginner",
            2: "Novice", 
            3: "Active",
            4: "Dedicated",
            5: "Committed",
            6: "Strong",
            7: "Elite",
            8: "Champion",
            9: "Master",
            10: "Legend"
        }
        
        return {
            "user_id": user_id,
            "total_points": total_points,
            "badge_points": badge_points,
            "challenge_points": challenge_points,
            "badges_earned": len(earned_badge_ids),
            "badges_total": len(BADGES),
            "level": level,
            "level_name": level_names.get(level, "Unknown"),
            "points_for_next_level": points_for_next,
            "progress_to_next": min(100, (total_points / points_for_next * 100)) if points_for_next > 0 else 100
        }
    except Exception as e:
        logger.error(f"Error getting gamification summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# STREAK TRACKING & AUTO PROGRESS
# ============================================================================

@api_router.get("/gamification/streak/{user_id}")
async def get_user_streak(user_id: str):
    """Get user's current activity streak"""
    try:
        today = datetime.utcnow().date()
        streak = 0
        longest_streak = 0
        current_streak = 0
        check_date = today
        
        # Count backward to find current streak
        for i in range(365):  # Check up to a year
            date_str = check_date.isoformat()
            
            # Check for any activity on this date
            workout_exists = await db.workouts.find_one({
                "user_id": user_id,
                "timestamp": {"$regex": f"^{date_str}"}
            })
            run_exists = await db.runs.find_one({
                "user_id": user_id,
                "timestamp": {"$regex": f"^{date_str}"}
            })
            weight_workout_exists = await db.weight_training_logs.find_one({
                "user_id": user_id,
                "date": date_str
            })
            challenge_done = await db.challenge_completions.find_one({
                "user_id": user_id,
                "type": "daily",
                "date": date_str
            })
            
            has_activity = workout_exists or run_exists or weight_workout_exists or challenge_done
            
            if has_activity:
                current_streak += 1
                if i == 0 or check_date == today:
                    streak = current_streak
            else:
                if current_streak > longest_streak:
                    longest_streak = current_streak
                if i == 0:  # No activity today
                    break
                current_streak = 0
                if streak > 0:
                    break
            
            check_date -= timedelta(days=1)
        
        if current_streak > longest_streak:
            longest_streak = current_streak
        
        return {
            "current_streak": streak,
            "longest_streak": longest_streak,
            "streak_active_today": streak > 0
        }
    except Exception as e:
        logger.error(f"Error getting user streak: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def auto_update_challenge_progress(user_id: str):
    """Automatically update challenge progress based on user's daily activities"""
    try:
        today = datetime.utcnow()
        today_str = today.date().isoformat()
        today_start = today.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        
        # Get today's challenges
        daily_challenges = get_daily_challenges_for_date(today)
        
        # Count today's activities
        workouts_today = await db.workouts.count_documents({
            "user_id": user_id,
            "timestamp": {"$gte": today_start}
        })
        
        runs_today = await db.runs.count_documents({
            "user_id": user_id,
            "timestamp": {"$gte": today_start}
        })
        
        meals_today = await db.meals.count_documents({
            "user_id": user_id,
            "timestamp": {"$gte": today_start}
        })
        
        water_today_cursor = db.water_intake.find({
            "user_id": user_id,
            "timestamp": {"$gte": today_start}
        })
        water_logs = await water_today_cursor.to_list(100)
        water_oz_today = sum(w.get("amount", 0) for w in water_logs)
        
        weight_sessions_today = await db.weight_training_logs.count_documents({
            "user_id": user_id,
            "date": today_str
        })
        
        # Update progress for each challenge
        progress_updates = []
        for challenge in daily_challenges:
            progress = 0
            
            if "workout" in challenge["id"].lower() or "exercise" in challenge["id"].lower():
                progress = workouts_today + runs_today + weight_sessions_today
            elif "run" in challenge["id"].lower() or "cardio" in challenge["id"].lower():
                progress = runs_today
            elif "meal" in challenge["id"].lower() or "food" in challenge["id"].lower() or "log" in challenge["id"].lower():
                progress = meals_today
            elif "water" in challenge["id"].lower() or "hydrat" in challenge["id"].lower():
                progress = water_oz_today
            elif "lift" in challenge["id"].lower() or "weight" in challenge["id"].lower() or "strength" in challenge["id"].lower():
                progress = weight_sessions_today
            
            if progress > 0:
                completed = progress >= challenge["target"]
                
                await db.user_challenges.update_one(
                    {
                        "user_id": user_id,
                        "challenge_id": challenge["id"],
                        "date": today_str
                    },
                    {
                        "$set": {
                            "user_id": user_id,
                            "challenge_id": challenge["id"],
                            "type": "daily",
                            "date": today_str,
                            "progress": progress,
                            "completed": completed,
                            "updated_at": datetime.utcnow().isoformat()
                        }
                    },
                    upsert=True
                )
                
                # Award points if newly completed
                if completed:
                    existing_completion = await db.challenge_completions.find_one({
                        "user_id": user_id,
                        "challenge_id": challenge["id"],
                        "date": today_str
                    })
                    
                    if not existing_completion:
                        await db.challenge_completions.insert_one({
                            "user_id": user_id,
                            "challenge_id": challenge["id"],
                            "type": "daily",
                            "date": today_str,
                            "points": challenge["points"],
                            "completed_at": datetime.utcnow().isoformat()
                        })
                
                progress_updates.append({
                    "challenge_id": challenge["id"],
                    "progress": progress,
                    "target": challenge["target"],
                    "completed": completed
                })
        
        return progress_updates
    except Exception as e:
        logger.error(f"Error auto-updating challenge progress: {str(e)}")
        return []

@api_router.post("/gamification/sync-progress/{user_id}")
async def sync_gamification_progress(user_id: str):
    """Sync all gamification progress for a user"""
    try:
        # Auto-update challenge progress
        challenge_updates = await auto_update_challenge_progress(user_id)
        
        # Check for new badges
        badge_result = await check_and_award_badges(user_id)
        
        # Get updated summary
        summary = await get_gamification_summary(user_id)
        
        # Get streak info
        streak = await get_user_streak(user_id)
        
        return {
            "success": True,
            "challenge_updates": challenge_updates,
            "new_badges": badge_result.get("new_badges_awarded", []) if isinstance(badge_result, dict) else [],
            "summary": summary,
            "streak": streak
        }
    except Exception as e:
        logger.error(f"Error syncing gamification progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/gamification/achievements/{user_id}")
async def get_recent_achievements(user_id: str, limit: int = 10):
    """Get user's recent achievements (badges + completed challenges)"""
    try:
        # Get recent badges
        recent_badges = await db.user_badges.find(
            {"user_id": user_id}
        ).sort("earned_at", -1).limit(limit).to_list(limit)
        
        # Get recent challenge completions
        recent_challenges = await db.challenge_completions.find(
            {"user_id": user_id}
        ).sort("completed_at", -1).limit(limit).to_list(limit)
        
        achievements = []
        
        for badge in recent_badges:
            badge_info = next((b for b in BADGES if b["id"] == badge["badge_id"]), None)
            if badge_info:
                achievements.append({
                    "type": "badge",
                    "id": badge["badge_id"],
                    "name": badge_info["name"],
                    "description": badge_info["description"],
                    "icon": badge_info["icon"],
                    "points": badge_info["points"],
                    "earned_at": badge["earned_at"]
                })
        
        for challenge in recent_challenges:
            challenge_info = next(
                (c for c in DAILY_CHALLENGES + WEEKLY_CHALLENGES if c["id"] == challenge["challenge_id"]), 
                None
            )
            if challenge_info:
                achievements.append({
                    "type": "challenge",
                    "id": challenge["challenge_id"],
                    "name": challenge_info["name"],
                    "description": challenge_info.get("description", ""),
                    "icon": "🎯",
                    "points": challenge["points"],
                    "earned_at": challenge["completed_at"]
                })
        
        # Sort by earned_at descending
        achievements.sort(key=lambda x: x.get("earned_at", ""), reverse=True)
        
        return {"achievements": achievements[:limit]}
    except Exception as e:
        logger.error(f"Error getting achievements: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/gamification/reset/{user_id}")
async def reset_user_rewards(user_id: str):
    """Reset all rewards and gamification data for a user"""
    try:
        # Delete user badges
        badges_result = await db.user_badges.delete_many({"user_id": user_id})
        
        # Delete challenge completions
        challenges_result = await db.challenge_completions.delete_many({"user_id": user_id})
        
        # Delete user challenges progress
        user_challenges_result = await db.user_challenges.delete_many({"user_id": user_id})
        
        # Delete daily challenge progress
        daily_result = await db.daily_challenge_progress.delete_many({"user_id": user_id})
        
        # Delete weekly challenge progress
        weekly_result = await db.weekly_challenge_progress.delete_many({"user_id": user_id})
        
        # Delete gamification/points data if exists
        points_result = await db.gamification.delete_many({"user_id": user_id})
        
        logger.info(f"Reset rewards for user {user_id}: {badges_result.deleted_count} badges, {challenges_result.deleted_count} challenge completions, {user_challenges_result.deleted_count} user challenges deleted")
        
        return {
            "message": "All rewards and challenges reset successfully",
            "deleted": {
                "badges": badges_result.deleted_count,
                "challenge_completions": challenges_result.deleted_count,
                "user_challenges": user_challenges_result.deleted_count,
                "daily_progress": daily_result.deleted_count,
                "weekly_progress": weekly_result.deleted_count,
                "points_data": points_result.deleted_count
            }
        }
    except Exception as e:
        logger.error(f"Error resetting rewards: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/challenges/reset/{user_id}")
async def reset_user_challenges(user_id: str):
    """Reset only challenge progress for a user (keeps badges)"""
    try:
        # Delete user challenges progress
        user_challenges_result = await db.user_challenges.delete_many({"user_id": user_id})
        
        # Delete challenge completions
        challenges_result = await db.challenge_completions.delete_many({"user_id": user_id})
        
        # Delete daily challenge progress
        daily_result = await db.daily_challenge_progress.delete_many({"user_id": user_id})
        
        # Delete weekly challenge progress
        weekly_result = await db.weekly_challenge_progress.delete_many({"user_id": user_id})
        
        logger.info(f"Reset challenges for user {user_id}: {user_challenges_result.deleted_count} user challenges, {challenges_result.deleted_count} completions deleted")
        
        return {
            "message": "All challenges reset successfully",
            "deleted": {
                "user_challenges": user_challenges_result.deleted_count,
                "challenge_completions": challenges_result.deleted_count,
                "daily_progress": daily_result.deleted_count,
                "weekly_progress": weekly_result.deleted_count
            }
        }
    except Exception as e:
        logger.error(f"Error resetting challenges: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# HEALTH SYNC ENDPOINTS (Apple Health / Google Health Connect)
# ============================================================================

class HealthHeartRate(BaseModel):
    current: int
    min: int
    max: int
    avg: int

class HealthSleep(BaseModel):
    totalMinutes: int
    deepMinutes: int
    lightMinutes: int
    remMinutes: int
    awakeMinutes: int

class HealthWorkout(BaseModel):
    type: str
    duration: float  # minutes
    calories: float
    distance: Optional[float] = None
    startTime: str
    endTime: str

class HealthSyncData(BaseModel):
    user_id: str
    steps: int
    distance: float  # miles
    activeCalories: int
    totalCalories: Optional[int] = 0
    heartRate: Optional[HealthHeartRate] = None
    sleep: Optional[HealthSleep] = None
    workouts: List[HealthWorkout] = []
    lastSyncTime: str

@api_router.post("/health/sync")
async def sync_health_data(data: HealthSyncData):
    """Sync health data from wearables (Apple Health / Google Health Connect)"""
    try:
        # Store in health_sync collection
        sync_record = {
            "user_id": data.user_id,
            "steps": data.steps,
            "distance": data.distance,
            "active_calories": data.activeCalories,
            "total_calories": data.totalCalories,
            "heart_rate": data.heartRate.dict() if data.heartRate else None,
            "sleep": data.sleep.dict() if data.sleep else None,
            "workouts": [w.dict() for w in data.workouts],
            "sync_time": data.lastSyncTime,
            "sync_date": datetime.fromisoformat(data.lastSyncTime.replace('Z', '+00:00')).date().isoformat(),
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Upsert based on user_id and sync_date
        await db.health_sync.update_one(
            {"user_id": data.user_id, "sync_date": sync_record["sync_date"]},
            {"$set": sync_record},
            upsert=True
        )
        
        # Update user's daily stats in the water/workout tracking
        # This allows health data to be reflected in other parts of the app
        
        return {
            "success": True,
            "message": "Health data synced successfully",
            "sync_time": data.lastSyncTime
        }
    except Exception as e:
        logger.error(f"Error syncing health data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/health/summary/{user_id}")
async def get_health_summary(user_id: str, days: int = 7):
    """Get health data summary for a user"""
    try:
        cutoff_date = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
        
        records = await db.health_sync.find({
            "user_id": user_id,
            "sync_date": {"$gte": cutoff_date}
        }).sort("sync_date", -1).to_list(length=days)
        
        if not records:
            return {
                "has_data": False,
                "days": [],
                "totals": {
                    "steps": 0,
                    "distance": 0,
                    "active_calories": 0,
                    "workouts": 0
                },
                "averages": {
                    "steps": 0,
                    "distance": 0,
                    "active_calories": 0,
                    "sleep_minutes": 0,
                    "heart_rate": 0
                }
            }
        
        # Calculate totals and averages
        total_steps = sum(r.get("steps", 0) for r in records)
        total_distance = sum(r.get("distance", 0) for r in records)
        total_active_calories = sum(r.get("active_calories", 0) for r in records)
        total_workouts = sum(len(r.get("workouts", [])) for r in records)
        
        sleep_records = [r for r in records if r.get("sleep") and r["sleep"].get("totalMinutes", 0) > 0]
        total_sleep = sum(r["sleep"]["totalMinutes"] for r in sleep_records) if sleep_records else 0
        
        heart_rate_records = [r for r in records if r.get("heart_rate") and r["heart_rate"].get("avg", 0) > 0]
        avg_heart_rate = sum(r["heart_rate"]["avg"] for r in heart_rate_records) / len(heart_rate_records) if heart_rate_records else 0
        
        num_days = len(records)
        
        return {
            "has_data": True,
            "days": [{
                "date": r["sync_date"],
                "steps": r.get("steps", 0),
                "distance": r.get("distance", 0),
                "active_calories": r.get("active_calories", 0),
                "sleep_minutes": r["sleep"]["totalMinutes"] if r.get("sleep") else 0,
                "workouts": len(r.get("workouts", []))
            } for r in records],
            "totals": {
                "steps": total_steps,
                "distance": round(total_distance, 2),
                "active_calories": total_active_calories,
                "workouts": total_workouts
            },
            "averages": {
                "steps": round(total_steps / num_days) if num_days > 0 else 0,
                "distance": round(total_distance / num_days, 2) if num_days > 0 else 0,
                "active_calories": round(total_active_calories / num_days) if num_days > 0 else 0,
                "sleep_minutes": round(total_sleep / len(sleep_records)) if sleep_records else 0,
                "heart_rate": round(avg_heart_rate) if avg_heart_rate > 0 else 0
            }
        }
    except Exception as e:
        logger.error(f"Error getting health summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/health/connection-status/{user_id}")
async def get_health_connection_status(user_id: str):
    """Get the last health sync status for a user"""
    try:
        latest_sync = await db.health_sync.find_one(
            {"user_id": user_id},
            sort=[("sync_time", -1)]
        )
        
        if not latest_sync:
            return {
                "connected": False,
                "last_sync": None,
                "days_since_sync": None
            }
        
        last_sync_time = datetime.fromisoformat(latest_sync["sync_time"].replace('Z', '+00:00'))
        days_since = (datetime.utcnow() - last_sync_time.replace(tzinfo=None)).days
        
        return {
            "connected": days_since < 7,  # Consider connected if synced within 7 days
            "last_sync": latest_sync["sync_time"],
            "days_since_sync": days_since,
            "last_data": {
                "steps": latest_sync.get("steps", 0),
                "distance": latest_sync.get("distance", 0),
                "active_calories": latest_sync.get("active_calories", 0)
            }
        }
    except Exception as e:
        logger.error(f"Error getting health connection status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# PEPTIDE CALCULATOR
# ============================================================================

# Comprehensive Peptide Database
PEPTIDE_DATABASE = {
    # Recovery Peptides
    "bpc-157": {
        "name": "BPC-157",
        "category": "recovery",
        "description": "Body Protection Compound-157, a gastric pentadecapeptide known for healing properties",
        "common_doses": [250, 500, 750],
        "dose_unit": "mcg",
        "frequency": "1-2x daily",
        "typical_duration": "4-8 weeks",
        "half_life": "4 hours",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Injury recovery", "Gut healing", "Tendon repair", "Joint health"],
        "notes": "Can be injected subcutaneously near injury site or systemically"
    },
    "tb-500": {
        "name": "TB-500",
        "category": "recovery",
        "description": "Thymosin Beta-4, promotes healing, reduces inflammation, and improves flexibility",
        "common_doses": [2000, 2500, 5000],
        "dose_unit": "mcg",
        "frequency": "2x weekly (loading), 1x weekly (maintenance)",
        "typical_duration": "4-6 weeks loading, then maintenance",
        "half_life": "Unknown, effects last days",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Muscle repair", "Wound healing", "Flexibility", "Hair growth"],
        "notes": "Often stacked with BPC-157 for synergistic effects"
    },
    "ghk-cu": {
        "name": "GHK-Cu",
        "category": "recovery",
        "description": "Copper peptide with regenerative and anti-aging properties",
        "common_doses": [1000, 2000, 3000],
        "dose_unit": "mcg",
        "frequency": "Daily",
        "typical_duration": "8-12 weeks",
        "half_life": "Unknown",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Skin healing", "Collagen production", "Hair growth", "Anti-aging"],
        "notes": "Also available in topical form for skin application"
    },
    
    # GLP-1 Agonists
    "semaglutide": {
        "name": "Semaglutide",
        "category": "glp1",
        "description": "GLP-1 receptor agonist for weight management and blood sugar control",
        "common_doses": [250, 500, 1000, 1700, 2400],
        "dose_unit": "mcg",
        "frequency": "Once weekly",
        "typical_duration": "Ongoing",
        "half_life": "7 days",
        "storage": "Refrigerate",
        "common_uses": ["Weight loss", "Appetite suppression", "Blood sugar control"],
        "notes": "Start low and titrate up slowly over weeks. Dose in mcg (1000mcg = 1mg)"
    },
    "tirzepatide": {
        "name": "Tirzepatide",
        "category": "glp1",
        "description": "Dual GIP/GLP-1 receptor agonist for enhanced weight loss",
        "common_doses": [2500, 5000, 7500, 10000, 12500, 15000],
        "dose_unit": "mcg",
        "frequency": "Once weekly",
        "typical_duration": "Ongoing",
        "half_life": "5 days",
        "storage": "Refrigerate",
        "common_uses": ["Weight loss", "Blood sugar control", "Appetite control"],
        "notes": "More potent than semaglutide. Titrate slowly."
    },
    
    # Growth Hormone Peptides
    "ipamorelin": {
        "name": "Ipamorelin",
        "category": "gh_secretagogue",
        "description": "Selective growth hormone secretagogue with minimal side effects",
        "common_doses": [100, 200, 300],
        "dose_unit": "mcg",
        "frequency": "2-3x daily",
        "typical_duration": "8-12 weeks",
        "half_life": "2 hours",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Muscle growth", "Fat loss", "Recovery", "Sleep quality", "Anti-aging"],
        "notes": "Often combined with CJC-1295 for synergistic effects"
    },
    "cjc-1295": {
        "name": "CJC-1295 (with DAC)",
        "category": "gh_secretagogue",
        "description": "Growth hormone releasing hormone analog with extended half-life",
        "common_doses": [1000, 2000],
        "dose_unit": "mcg",
        "frequency": "2x weekly",
        "typical_duration": "8-12 weeks",
        "half_life": "6-8 days",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Sustained GH release", "Muscle growth", "Fat loss", "Recovery"],
        "notes": "DAC version has longer half-life. No-DAC version dosed 2-3x daily"
    },
    "cjc-1295-no-dac": {
        "name": "CJC-1295 (no DAC) / Mod GRF 1-29",
        "category": "gh_secretagogue",
        "description": "Short-acting GHRH analog, mimics natural GH pulsatile release",
        "common_doses": [100, 200],
        "dose_unit": "mcg",
        "frequency": "2-3x daily",
        "typical_duration": "8-12 weeks",
        "half_life": "30 minutes",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Natural GH pulse", "Muscle growth", "Fat loss", "Recovery"],
        "notes": "Best combined with Ipamorelin. Inject on empty stomach."
    },
    "tesamorelin": {
        "name": "Tesamorelin",
        "category": "gh_secretagogue",
        "description": "GHRH analog FDA-approved for reducing visceral fat",
        "common_doses": [1000, 2000],
        "dose_unit": "mcg",
        "frequency": "Daily",
        "typical_duration": "12-26 weeks",
        "half_life": "26-38 minutes",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Visceral fat reduction", "Body composition", "Cognitive function"],
        "notes": "FDA-approved for lipodystrophy. Strong evidence for fat reduction."
    },
    
    # IGF
    "igf-lr3": {
        "name": "IGF-1 LR3",
        "category": "igf",
        "description": "Long-acting Insulin-like Growth Factor 1 variant",
        "common_doses": [20, 40, 60, 80, 100],
        "dose_unit": "mcg",
        "frequency": "Daily (cycle on/off)",
        "typical_duration": "4 weeks on, 4 weeks off",
        "half_life": "20-30 hours",
        "storage": "Refrigerate, use within 1 month",
        "common_uses": ["Muscle growth", "Hyperplasia", "Fat loss", "Recovery"],
        "notes": "Very potent. Can cause hypoglycemia. Best post-workout."
    },
    
    # Mitochondrial / Longevity
    "mots-c": {
        "name": "MOTS-c",
        "category": "longevity",
        "description": "Mitochondrial-derived peptide that regulates metabolism",
        "common_doses": [5000, 10000],
        "dose_unit": "mcg",
        "frequency": "3-5x weekly",
        "typical_duration": "8-12 weeks",
        "half_life": "Unknown",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Metabolic health", "Exercise performance", "Insulin sensitivity", "Longevity"],
        "notes": "Mimics effects of exercise on metabolism"
    },
    "ss-31": {
        "name": "SS-31 (Elamipretide)",
        "category": "longevity",
        "description": "Mitochondria-targeted peptide that improves cellular energy",
        "common_doses": [5000, 10000, 20000],
        "dose_unit": "mcg",
        "frequency": "Daily",
        "typical_duration": "4-8 weeks",
        "half_life": "Unknown",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Mitochondrial function", "Energy", "Aging", "Cardiac health"],
        "notes": "Targets cardiolipin in mitochondrial membrane"
    },
    "nad": {
        "name": "NAD+ (Injection)",
        "category": "longevity",
        "description": "Nicotinamide Adenine Dinucleotide, essential coenzyme for cellular energy",
        "common_doses": [50000, 100000, 200000, 500000],
        "dose_unit": "mcg",
        "frequency": "2-3x weekly or as loading protocol",
        "typical_duration": "Ongoing or periodic loading",
        "half_life": "2-4 hours",
        "storage": "Refrigerate",
        "common_uses": ["Energy", "Anti-aging", "Cognitive function", "DNA repair", "Addiction recovery"],
        "notes": "Can cause flushing. Start low. Often given as IV but SubQ works. Doses in mcg (100000mcg = 100mg)"
    },
    
    # Sexual Health
    "pt-141": {
        "name": "PT-141 (Bremelanotide)",
        "category": "sexual_health",
        "description": "Melanocortin receptor agonist for sexual dysfunction",
        "common_doses": [500, 1000, 1750, 2000],
        "dose_unit": "mcg",
        "frequency": "As needed (45 min before activity)",
        "typical_duration": "As needed",
        "half_life": "2.7 hours",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Sexual dysfunction", "Libido enhancement", "Erectile function"],
        "notes": "May cause nausea. Do not use more than 8 times per month."
    },
    "kisspeptin": {
        "name": "Kisspeptin-10",
        "category": "sexual_health",
        "description": "Hormone that stimulates GnRH release, affects reproductive hormones",
        "common_doses": [100, 200, 500],
        "dose_unit": "mcg",
        "frequency": "Daily or as needed",
        "typical_duration": "Variable",
        "half_life": "28 minutes",
        "storage": "Refrigerate after reconstitution",
        "common_uses": ["Testosterone support", "Libido", "Reproductive health", "LH/FSH release"],
        "notes": "Stimulates natural hormone production through hypothalamus"
    },
}

# Pydantic Models for Peptide Calculator
class PeptideReconstitution(BaseModel):
    peptide_amount_mg: float
    water_amount_ml: float
    desired_dose_mcg: float
    syringe_units: int = 100  # Standard insulin syringe

class InjectionLog(BaseModel):
    user_id: str
    peptide_id: str
    peptide_name: str
    dose_mcg: float
    injection_site: str
    injection_time: str
    notes: Optional[str] = ""
    side_effects: Optional[str] = ""

class PeptideProtocol(BaseModel):
    user_id: str
    protocol_name: str
    peptide_id: str
    peptide_name: str
    dose_mcg: float
    frequency: str  # "daily", "twice_daily", "weekly", "twice_weekly", etc.
    start_date: str
    end_date: Optional[str] = None
    injection_times: List[str] = []  # e.g., ["08:00", "20:00"]
    notes: Optional[str] = ""
    active: bool = True

class PeptideProgressEntry(BaseModel):
    user_id: str
    date: str
    weight: Optional[float] = None
    body_fat_percentage: Optional[float] = None
    measurements: Optional[dict] = None  # waist, arms, etc.
    energy_level: Optional[int] = None  # 1-10
    sleep_quality: Optional[int] = None  # 1-10
    mood: Optional[int] = None  # 1-10
    notes: Optional[str] = ""
    photos: Optional[List[str]] = []  # base64 encoded

class PeptideAIQuery(BaseModel):
    user_id: str
    question: str
    context: Optional[str] = ""  # Current peptides being used

# Reconstitution Calculator
@api_router.post("/peptides/calculate-reconstitution")
async def calculate_reconstitution(data: PeptideReconstitution):
    """Calculate reconstitution and dosing for peptides"""
    try:
        # Convert mg to mcg
        total_mcg = data.peptide_amount_mg * 1000
        
        # Concentration per mL
        concentration_per_ml = total_mcg / data.water_amount_ml
        
        # Units per mL on insulin syringe
        units_per_ml = data.syringe_units
        
        # mcg per unit
        mcg_per_unit = concentration_per_ml / units_per_ml
        
        # Units needed for desired dose
        units_for_dose = data.desired_dose_mcg / mcg_per_unit
        
        # Number of doses per vial
        doses_per_vial = total_mcg / data.desired_dose_mcg
        
        return {
            "total_peptide_mcg": total_mcg,
            "concentration_mcg_per_ml": round(concentration_per_ml, 2),
            "mcg_per_unit": round(mcg_per_unit, 4),
            "units_for_dose": round(units_for_dose, 1),
            "ml_for_dose": round(units_for_dose / units_per_ml, 3),
            "doses_per_vial": round(doses_per_vial, 1),
            "syringe_marking": f"{round(units_for_dose)} units on {data.syringe_units}U syringe"
        }
    except Exception as e:
        logger.error(f"Error calculating reconstitution: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get all peptides in database
@api_router.get("/peptides/database")
async def get_peptide_database():
    """Get the complete peptide database"""
    return {
        "peptides": PEPTIDE_DATABASE,
        "categories": {
            "recovery": "Recovery & Healing",
            "glp1": "GLP-1 Agonists (Weight Management)",
            "gh_secretagogue": "Growth Hormone Secretagogues",
            "igf": "IGF Peptides",
            "longevity": "Longevity & Mitochondrial",
            "sexual_health": "Sexual Health"
        }
    }

# Get specific peptide info
@api_router.get("/peptides/info/{peptide_id}")
async def get_peptide_info(peptide_id: str):
    """Get detailed info about a specific peptide"""
    peptide = PEPTIDE_DATABASE.get(peptide_id.lower())
    if not peptide:
        raise HTTPException(status_code=404, detail="Peptide not found")
    return {"peptide_id": peptide_id, **peptide}

# Log an injection
@api_router.post("/peptides/log-injection")
async def log_injection(data: InjectionLog):
    """Log a peptide injection"""
    try:
        log_entry = {
            "user_id": data.user_id,
            "peptide_id": data.peptide_id,
            "peptide_name": data.peptide_name,
            "dose_mcg": data.dose_mcg,
            "injection_site": data.injection_site,
            "injection_time": data.injection_time,
            "notes": data.notes,
            "side_effects": data.side_effects,
            "created_at": datetime.utcnow().isoformat()
        }
        
        result = await db.peptide_injections.insert_one(log_entry)
        
        return {
            "success": True,
            "injection_id": str(result.inserted_id),
            "message": "Injection logged successfully"
        }
    except Exception as e:
        logger.error(f"Error logging injection: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Delete an injection
@api_router.delete("/peptides/injection/{injection_id}")
async def delete_injection(injection_id: str):
    """Delete a peptide injection log"""
    try:
        from bson import ObjectId
        result = await db.peptide_injections.delete_one({"_id": ObjectId(injection_id)})
        if result.deleted_count == 0:
            # Try with injection_id field as fallback
            result = await db.peptide_injections.delete_one({"injection_id": injection_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Injection not found")
            
        return {"message": "Injection deleted successfully", "deleted_count": result.deleted_count}
    except Exception as e:
        logger.error(f"Error deleting injection: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get injection history
@api_router.get("/peptides/injections/{user_id}")
async def get_injection_history(user_id: str, limit: int = 50, peptide_id: Optional[str] = None):
    """Get user's injection history"""
    try:
        query = {"user_id": user_id}
        if peptide_id:
            query["peptide_id"] = peptide_id
            
        injections = await db.peptide_injections.find(query).sort("injection_time", -1).to_list(limit)
        
        # Convert ObjectId to string and add injection_id
        for inj in injections:
            inj["injection_id"] = str(inj["_id"])
            inj["_id"] = str(inj["_id"])
            
        return {"injections": injections, "count": len(injections)}
    except Exception as e:
        logger.error(f"Error getting injection history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Create/Update protocol
@api_router.post("/peptides/protocol")
async def create_protocol(data: PeptideProtocol):
    """Create or update a peptide protocol"""
    try:
        protocol = {
            "user_id": data.user_id,
            "protocol_name": data.protocol_name,
            "peptide_id": data.peptide_id,
            "peptide_name": data.peptide_name,
            "dose_mcg": data.dose_mcg,
            "frequency": data.frequency,
            "start_date": data.start_date,
            "end_date": data.end_date,
            "injection_times": data.injection_times,
            "notes": data.notes,
            "active": data.active,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        result = await db.peptide_protocols.insert_one(protocol)
        
        return {
            "success": True,
            "protocol_id": str(result.inserted_id),
            "message": "Protocol created successfully"
        }
    except Exception as e:
        logger.error(f"Error creating protocol: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get user protocols
@api_router.get("/peptides/protocols/{user_id}")
async def get_user_protocols(user_id: str, active_only: bool = True):
    """Get user's peptide protocols"""
    try:
        query = {"user_id": user_id}
        if active_only:
            query["active"] = True
            
        protocols = await db.peptide_protocols.find(query).to_list(100)
        
        for protocol in protocols:
            protocol["_id"] = str(protocol["_id"])
            
        return {"protocols": protocols}
    except Exception as e:
        logger.error(f"Error getting protocols: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Delete a single protocol
@api_router.delete("/peptides/protocol/{user_id}/{protocol_id}")
async def delete_protocol(user_id: str, protocol_id: str):
    """Delete a single peptide protocol"""
    try:
        from bson import ObjectId
        result = await db.peptide_protocols.delete_one({
            "_id": ObjectId(protocol_id),
            "user_id": user_id
        })
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Protocol not found")
            
        return {"success": True, "message": "Protocol deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting protocol: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Delete protocols by stack name (for when a stack is deleted)
@api_router.delete("/peptides/protocols-by-stack/{user_id}/{stack_name}")
async def delete_protocols_by_stack(user_id: str, stack_name: str):
    """Delete all protocols associated with a stack"""
    try:
        # Protocols created from stacks have names like "Stack Name - Peptide Name"
        result = await db.peptide_protocols.delete_many({
            "user_id": user_id,
            "protocol_name": {"$regex": f"^{stack_name} - ", "$options": "i"}
        })
        
        return {
            "success": True, 
            "deleted_count": result.deleted_count,
            "message": f"Deleted {result.deleted_count} protocols"
        }
    except Exception as e:
        logger.error(f"Error deleting protocols by stack: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Check for missed doses
@api_router.get("/peptides/missed-doses/{user_id}")
async def check_missed_doses(user_id: str):
    """Check for missed doses based on active protocols"""
    try:
        # Get active protocols
        protocols = await db.peptide_protocols.find({
            "user_id": user_id,
            "active": True
        }).to_list(100)
        
        missed_doses = []
        today = datetime.utcnow().date()
        
        for protocol in protocols:
            protocol_start = datetime.fromisoformat(protocol["start_date"]).date()
            
            # Calculate expected doses based on frequency
            frequency = protocol.get("frequency", "daily")
            
            # Get actual injections for this protocol
            injections = await db.peptide_injections.find({
                "user_id": user_id,
                "peptide_id": protocol["peptide_id"],
                "injection_time": {"$gte": protocol["start_date"]}
            }).to_list(1000)
            
            injection_dates = set()
            for inj in injections:
                try:
                    inj_date = datetime.fromisoformat(inj["injection_time"].replace('Z', '+00:00')).date()
                    injection_dates.add(inj_date)
                except:
                    pass
            
            # Check last 7 days for missed doses
            for i in range(7):
                check_date = today - timedelta(days=i)
                if check_date < protocol_start:
                    continue
                    
                should_have_dose = False
                
                if frequency == "daily":
                    should_have_dose = True
                elif frequency == "twice_daily":
                    should_have_dose = True
                elif frequency == "weekly":
                    # Check if this is the scheduled day
                    days_since_start = (check_date - protocol_start).days
                    should_have_dose = days_since_start % 7 == 0
                elif frequency == "twice_weekly":
                    days_since_start = (check_date - protocol_start).days
                    should_have_dose = days_since_start % 3 in [0, 3]
                elif frequency == "three_weekly":
                    days_since_start = (check_date - protocol_start).days
                    should_have_dose = days_since_start % 2 == 0
                
                if should_have_dose and check_date not in injection_dates and check_date < today:
                    missed_doses.append({
                        "protocol_name": protocol["protocol_name"],
                        "peptide_name": protocol["peptide_name"],
                        "missed_date": check_date.isoformat(),
                        "scheduled_dose_mcg": protocol["dose_mcg"],
                        "recommendation": get_missed_dose_recommendation(frequency, (today - check_date).days)
                    })
        
        return {
            "missed_doses": missed_doses,
            "has_missed_doses": len(missed_doses) > 0
        }
    except Exception as e:
        logger.error(f"Error checking missed doses: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def get_missed_dose_recommendation(frequency: str, days_missed: int) -> str:
    """Get recommendation for missed dose"""
    if days_missed == 1:
        if frequency in ["daily", "twice_daily"]:
            return "Take your regular dose as soon as possible, then continue your normal schedule."
        else:
            return "Take your dose today if you remember, otherwise skip and continue with next scheduled dose."
    elif days_missed <= 3:
        return "Do not double up. Resume your regular schedule with your next planned dose."
    else:
        return "Multiple doses missed. Resume normal schedule. Do not try to make up missed doses."

# Log progress entry
@api_router.post("/peptides/progress")
async def log_progress(data: PeptideProgressEntry):
    """Log progress/measurements for peptide tracking"""
    try:
        entry = {
            "user_id": data.user_id,
            "date": data.date,
            "weight": data.weight,
            "body_fat_percentage": data.body_fat_percentage,
            "measurements": data.measurements,
            "energy_level": data.energy_level,
            "sleep_quality": data.sleep_quality,
            "mood": data.mood,
            "notes": data.notes,
            "photos": data.photos,
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Upsert based on user_id and date
        await db.peptide_progress.update_one(
            {"user_id": data.user_id, "date": data.date},
            {"$set": entry},
            upsert=True
        )
        
        return {"success": True, "message": "Progress logged successfully"}
    except Exception as e:
        logger.error(f"Error logging progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get progress history
@api_router.get("/peptides/progress/{user_id}")
async def get_progress_history(user_id: str, days: int = 30):
    """Get user's progress history"""
    try:
        cutoff_date = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
        
        entries = await db.peptide_progress.find({
            "user_id": user_id,
            "date": {"$gte": cutoff_date}
        }).sort("date", 1).to_list(100)
        
        for entry in entries:
            entry["_id"] = str(entry["_id"])
            # Don't send photos in list view to save bandwidth
            if "photos" in entry:
                entry["has_photos"] = len(entry.get("photos", [])) > 0
                del entry["photos"]
                
        return {"progress": entries, "count": len(entries)}
    except Exception as e:
        logger.error(f"Error getting progress history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# AI Research Insights
@api_router.post("/peptides/ai-insights")
async def get_ai_peptide_insights(data: PeptideAIQuery):
    """Get AI-powered insights about peptides"""
    try:
        emergent_key = os.getenv("EMERGENT_API_KEY") or os.getenv("EMERGENT_LLM_KEY")
        if not emergent_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        # Build context about the peptide database
        peptide_info = ""
        if data.context:
            # Get info about peptides user is asking about
            for pid in data.context.split(","):
                pid = pid.strip().lower()
                if pid in PEPTIDE_DATABASE:
                    p = PEPTIDE_DATABASE[pid]
                    peptide_info += f"\n{p['name']}: {p['description']}. Common doses: {p['common_doses']} {p['dose_unit']}. Frequency: {p['frequency']}. Uses: {', '.join(p['common_uses'])}."
        
        system_prompt = """You are a knowledgeable peptide research assistant for a fitness tracking app. 
You provide research-based, educational information about peptides including BPC-157, TB-500, Semaglutide, Tirzepatide, 
Ipamorelin, CJC-1295, IGF-1 LR3, MOTS-c, SS-31, NAD+, PT-141, Kisspeptin, and others.

Important guidelines:
1. Always emphasize that peptides should only be used under medical supervision
2. Provide research-based information with appropriate caveats
3. Never recommend specific dosing without mentioning to consult healthcare providers
4. Discuss potential side effects and contraindications when relevant
5. Be helpful but responsible - this is educational information only
6. If asked about stacking or combinations, discuss what research suggests but emphasize individual variation
7. Keep responses concise but informative

Current context about user's peptides:""" + peptide_info
        
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"peptide_ai_{datetime.now().timestamp()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(
            UserMessage(text=data.question)
        )
        
        # Response is a string directly
        response_text = response if isinstance(response, str) else str(response)
        
        return {
            "question": data.question,
            "response": response_text,
            "disclaimer": "This information is for educational purposes only. Always consult with a healthcare provider before using any peptides."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AI insights: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Peptide Chat History - Save Conversation
class PeptideChatSave(BaseModel):
    user_id: str
    conversation_id: str
    title: str
    messages: list

@api_router.post("/peptides/chat/save")
async def save_peptide_chat(data: PeptideChatSave):
    """Save peptide AI chat conversation (kept for 12 hours)"""
    try:
        expires_at = datetime.utcnow() + timedelta(hours=12)
        
        await db.peptide_chat_history.update_one(
            {"user_id": data.user_id, "conversation_id": data.conversation_id},
            {
                "$set": {
                    "user_id": data.user_id,
                    "conversation_id": data.conversation_id,
                    "title": data.title,
                    "messages": data.messages,
                    "updated_at": datetime.utcnow().isoformat(),
                    "expires_at": expires_at
                },
                "$setOnInsert": {
                    "created_at": datetime.utcnow().isoformat()
                }
            },
            upsert=True
        )
        
        return {"success": True, "conversation_id": data.conversation_id}
    except Exception as e:
        logger.error(f"Error saving peptide chat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Peptide Chat History - Get Conversations
@api_router.get("/peptides/chat/history/{user_id}")
async def get_peptide_chat_history(user_id: str):
    """Get saved peptide AI chat conversations (only non-expired)"""
    try:
        # Remove expired conversations
        await db.peptide_chat_history.delete_many({
            "expires_at": {"$lt": datetime.utcnow()}
        })
        
        # Get remaining conversations
        conversations = await db.peptide_chat_history.find(
            {"user_id": user_id}
        ).sort("updated_at", -1).to_list(20)
        
        result = []
        for conv in conversations:
            result.append({
                "id": conv.get("conversation_id"),
                "title": conv.get("title", "Conversation"),
                "timestamp": conv.get("updated_at"),
                "messages": conv.get("messages", []),
                "message_count": len(conv.get("messages", []))
            })
        
        return {"conversations": result}
    except Exception as e:
        logger.error(f"Error getting peptide chat history: {str(e)}")
        return {"conversations": []}

# Peptide Chat History - Delete Conversation
@api_router.delete("/peptides/chat/{user_id}/{conversation_id}")
async def delete_peptide_chat(user_id: str, conversation_id: str):
    """Delete a specific peptide chat conversation"""
    try:
        await db.peptide_chat_history.delete_one({
            "user_id": user_id,
            "conversation_id": conversation_id
        })
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Peptide Stacks - Save Stack
class PeptideStackSave(BaseModel):
    user_id: str
    name: str
    peptides: list
    goal: str
    created_by: str  # 'ai' or 'manual'

@api_router.post("/peptides/stacks/save")
async def save_peptide_stack(data: PeptideStackSave):
    """Save a user's peptide stack"""
    try:
        stack_id = f"stack_{datetime.now().timestamp()}"
        
        await db.peptide_stacks.insert_one({
            "stack_id": stack_id,
            "user_id": data.user_id,
            "name": data.name,
            "peptides": data.peptides,
            "goal": data.goal,
            "created_by": data.created_by,
            "created_at": datetime.utcnow().isoformat()
        })
        
        return {"success": True, "stack_id": stack_id}
    except Exception as e:
        logger.error(f"Error saving peptide stack: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Peptide Stacks - Get User Stacks
@api_router.get("/peptides/stacks/{user_id}")
async def get_peptide_stacks(user_id: str):
    """Get user's saved peptide stacks"""
    try:
        stacks = await db.peptide_stacks.find(
            {"user_id": user_id}
        ).sort("created_at", -1).to_list(50)
        
        result = []
        for stack in stacks:
            result.append({
                "id": stack.get("stack_id"),
                "name": stack.get("name"),
                "peptides": stack.get("peptides", []),
                "goal": stack.get("goal", ""),
                "created_by": stack.get("created_by", "manual"),
                "created_at": stack.get("created_at")
            })
        
        return {"stacks": result}
    except Exception as e:
        logger.error(f"Error getting peptide stacks: {str(e)}")
        return {"stacks": []}

# Peptide Stacks - Delete Stack
@api_router.delete("/peptides/stacks/{user_id}/{stack_id}")
async def delete_peptide_stack(user_id: str, stack_id: str):
    """Delete a user's peptide stack"""
    try:
        await db.peptide_stacks.delete_one({
            "user_id": user_id,
            "stack_id": stack_id
        })
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Peptide Stacks - AI Generate Stack
class PeptideAIStackRequest(BaseModel):
    user_id: str
    goal: str

@api_router.post("/peptides/stacks/ai-generate")
async def generate_ai_peptide_stack(data: PeptideAIStackRequest):
    """Use AI to generate a peptide stack based on user's goal"""
    try:
        emergent_key = os.getenv("EMERGENT_API_KEY") or os.getenv("EMERGENT_LLM_KEY")
        if not emergent_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        available_peptides = list(PEPTIDE_DATABASE.keys())
        
        system_prompt = f"""You are a peptide research assistant. Based on the user's goal, suggest a peptide stack 
from the following available peptides: {', '.join(available_peptides)}.

IMPORTANT: 
1. Only suggest peptides from the provided list
2. Return ONLY a JSON object in this exact format, nothing else:
{{"name": "Stack Name", "peptides": ["peptide1", "peptide2"], "reasoning": "Brief explanation"}}
3. Limit to 2-4 peptides per stack
4. Always emphasize this is for educational purposes only"""

        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"peptide_stack_{datetime.now().timestamp()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-4o")
        
        response = await chat.send_message(
            UserMessage(text=f"Create a peptide stack for this goal: {data.goal}")
        )
        
        response_text = response if isinstance(response, str) else str(response)
        
        # Try to parse JSON from response
        import json
        try:
            # Find JSON in response
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start >= 0 and end > start:
                json_str = response_text[start:end]
                stack_data = json.loads(json_str)
                return {
                    "success": True,
                    "stack": {
                        "name": stack_data.get("name", "AI Generated Stack"),
                        "peptides": stack_data.get("peptides", []),
                        "reasoning": stack_data.get("reasoning", "")
                    }
                }
        except:
            pass
        
        return {
            "success": False,
            "error": "Could not generate stack",
            "raw_response": response_text
        }
    except Exception as e:
        logger.error(f"Error generating AI stack: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get injection site rotation suggestions
@api_router.get("/peptides/site-rotation/{user_id}")
async def get_site_rotation(user_id: str):
    """Get injection site rotation recommendations based on history"""
    try:
        # Get last 14 days of injections
        cutoff = (datetime.utcnow() - timedelta(days=14)).isoformat()
        
        injections = await db.peptide_injections.find({
            "user_id": user_id,
            "injection_time": {"$gte": cutoff}
        }).to_list(100)
        
        # Count by site
        site_counts = {}
        for inj in injections:
            site = inj.get("injection_site", "unknown")
            site_counts[site] = site_counts.get(site, 0) + 1
        
        # All possible sites
        all_sites = [
            {"id": "abdomen_left", "name": "Abdomen (Left)", "description": "Left side of belly button"},
            {"id": "abdomen_right", "name": "Abdomen (Right)", "description": "Right side of belly button"},
            {"id": "thigh_left", "name": "Thigh (Left)", "description": "Front of left thigh"},
            {"id": "thigh_right", "name": "Thigh (Right)", "description": "Front of right thigh"},
            {"id": "arm_left", "name": "Upper Arm (Left)", "description": "Back of left upper arm"},
            {"id": "arm_right", "name": "Upper Arm (Right)", "description": "Back of right upper arm"},
            {"id": "glute_left", "name": "Glute (Left)", "description": "Upper outer left glute"},
            {"id": "glute_right", "name": "Glute (Right)", "description": "Upper outer right glute"},
        ]
        
        # Add counts and recommendations
        for site in all_sites:
            site["recent_count"] = site_counts.get(site["id"], 0)
        
        # Sort by least used
        all_sites.sort(key=lambda x: x["recent_count"])
        
        recommended = all_sites[0]["id"] if all_sites else "abdomen_left"
        
        return {
            "sites": all_sites,
            "recommended_next": recommended,
            "tip": "Rotate injection sites to prevent lipodystrophy and ensure consistent absorption."
        }
    except Exception as e:
        logger.error(f"Error getting site rotation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get peptide stats/summary
@api_router.get("/peptides/stats/{user_id}")
async def get_peptide_stats(user_id: str):
    """Get summary statistics for user's peptide usage"""
    try:
        # Total injections
        total_injections = await db.peptide_injections.count_documents({"user_id": user_id})
        
        # Injections by peptide
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {
                "_id": "$peptide_id",
                "name": {"$first": "$peptide_name"},
                "count": {"$sum": 1},
                "total_dose_mcg": {"$sum": "$dose_mcg"}
            }},
            {"$sort": {"count": -1}}
        ]
        by_peptide = await db.peptide_injections.aggregate(pipeline).to_list(20)
        
        # Active protocols
        active_protocols = await db.peptide_protocols.count_documents({
            "user_id": user_id,
            "active": True
        })
        
        # This week's injections
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        this_week = await db.peptide_injections.count_documents({
            "user_id": user_id,
            "injection_time": {"$gte": week_ago}
        })
        
        # Streak (consecutive days with injections)
        today = datetime.utcnow().date()
        streak = 0
        check_date = today
        
        while True:
            date_str = check_date.isoformat()
            next_date_str = (check_date + timedelta(days=1)).isoformat()
            
            has_injection = await db.peptide_injections.find_one({
                "user_id": user_id,
                "injection_time": {"$gte": date_str, "$lt": next_date_str}
            })
            
            if has_injection:
                streak += 1
                check_date -= timedelta(days=1)
            else:
                break
        
        return {
            "total_injections": total_injections,
            "active_protocols": active_protocols,
            "this_week_injections": this_week,
            "current_streak": streak,
            "by_peptide": by_peptide
        }
    except Exception as e:
        logger.error(f"Error getting peptide stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# BODY SCAN & WORKOUT GENERATOR
# ============================================================================

class BodyMeasurements(BaseModel):
    chest: Optional[float] = None  # inches
    waist: Optional[float] = None
    hips: Optional[float] = None
    left_arm: Optional[float] = None
    right_arm: Optional[float] = None
    left_thigh: Optional[float] = None
    right_thigh: Optional[float] = None
    left_calf: Optional[float] = None
    right_calf: Optional[float] = None
    neck: Optional[float] = None
    shoulders: Optional[float] = None

class BodyScanRequest(BaseModel):
    user_id: str
    measurements: Optional[BodyMeasurements] = None
    photos: Optional[List[str]] = None  # base64 encoded images (front, side, back)
    height_inches: Optional[float] = None
    weight_lbs: Optional[float] = None
    body_fat_percentage: Optional[float] = None
    fitness_goal: str = "general_fitness"  # general_fitness, muscle_gain, fat_loss, strength, athletic
    workout_location: str = "both"  # gym, home, both
    experience_level: str = "intermediate"  # beginner, intermediate, advanced

class BodyAnalysisResult(BaseModel):
    body_type: str
    body_fat_estimate: Optional[float]
    muscle_imbalances: List[str]
    strong_areas: List[str]
    areas_to_improve: List[str]
    posture_notes: List[str]
    recommendations: List[str]

async def analyze_body_photos_with_ai(photos: List[str], measurements: dict, user_info: dict) -> dict:
    """Analyze body photos using GPT-4o vision"""
    try:
        api_key = os.getenv('EMERGENT_LLM_KEY')
        if not api_key:
            raise Exception("EMERGENT_LLM_KEY not configured")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"body_analysis_{datetime.now().timestamp()}",
            system_message="""You are an expert fitness coach and body composition analyst. 
Analyze body photos to provide fitness assessments. Be encouraging and constructive.
Focus on identifying body type, muscle development, posture, and areas that could benefit from training."""
        ).with_model("openai", "gpt-4o")
        
        # Build context from measurements
        measurements_text = ""
        if measurements:
            measurements_text = f"""
User measurements (inches):
- Chest: {measurements.get('chest', 'N/A')}
- Waist: {measurements.get('waist', 'N/A')}
- Hips: {measurements.get('hips', 'N/A')}
- Arms: L:{measurements.get('left_arm', 'N/A')} R:{measurements.get('right_arm', 'N/A')}
- Thighs: L:{measurements.get('left_thigh', 'N/A')} R:{measurements.get('right_thigh', 'N/A')}
- Neck: {measurements.get('neck', 'N/A')}
- Shoulders: {measurements.get('shoulders', 'N/A')}
"""
        
        user_text = f"""
User Info:
- Height: {user_info.get('height_inches', 'N/A')} inches
- Weight: {user_info.get('weight_lbs', 'N/A')} lbs
- Goal: {user_info.get('fitness_goal', 'general fitness')}
- Experience: {user_info.get('experience_level', 'intermediate')}
{measurements_text}
"""
        
        prompt = f"""Analyze these body photos and provide a comprehensive fitness assessment.

{user_text}

Return your analysis as a JSON object with these fields:
{{
  "body_type": "ectomorph" or "mesomorph" or "endomorph" or "ecto-mesomorph" or "endo-mesomorph",
  "body_fat_estimate": estimated body fat percentage as number or null if can't determine,
  "muscle_imbalances": ["list of any visible imbalances like 'right arm larger than left'"],
  "strong_areas": ["list of well-developed muscle groups"],
  "areas_to_improve": ["list of underdeveloped areas that would benefit from focus"],
  "posture_notes": ["any posture observations like 'slight forward head posture'"],
  "recommendations": ["top 3-5 training recommendations based on analysis"]
}}

Be specific but encouraging. Focus on actionable insights."""
        
        # Add photos as image content
        image_contents = [ImageContent(image_base64=photo) for photo in photos[:3]]  # Max 3 photos
        
        user_message = UserMessage(
            text=prompt,
            file_contents=image_contents
        )
        
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        response_text = response.strip()
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        
        import json
        return json.loads(response_text)
        
    except Exception as e:
        logger.error(f"Error analyzing body photos: {str(e)}")
        # Return default analysis if AI fails
        return {
            "body_type": "mesomorph",
            "body_fat_estimate": None,
            "muscle_imbalances": [],
            "strong_areas": ["Unable to analyze from photos"],
            "areas_to_improve": ["Full body training recommended"],
            "posture_notes": [],
            "recommendations": ["Focus on compound movements", "Include both strength and cardio", "Maintain consistent training schedule"]
        }

def analyze_measurements_only(measurements: dict, user_info: dict) -> dict:
    """Analyze body based on measurements only (no photos)"""
    analysis = {
        "body_type": "mesomorph",
        "body_fat_estimate": None,
        "muscle_imbalances": [],
        "strong_areas": [],
        "areas_to_improve": [],
        "posture_notes": [],
        "recommendations": []
    }
    
    # Calculate waist-to-hip ratio if available
    waist = measurements.get('waist')
    hips = measurements.get('hips')
    if waist and hips:
        whr = waist / hips
        if whr > 0.9:  # For men
            analysis["areas_to_improve"].append("Core/midsection - elevated waist-to-hip ratio")
            analysis["recommendations"].append("Include dedicated core training and cardio")
        else:
            analysis["strong_areas"].append("Good waist-to-hip ratio")
    
    # Check arm symmetry
    left_arm = measurements.get('left_arm')
    right_arm = measurements.get('right_arm')
    if left_arm and right_arm:
        diff = abs(left_arm - right_arm)
        if diff > 0.5:
            larger = "right" if right_arm > left_arm else "left"
            analysis["muscle_imbalances"].append(f"{larger.capitalize()} arm is larger - consider unilateral exercises")
    
    # Check leg symmetry
    left_thigh = measurements.get('left_thigh')
    right_thigh = measurements.get('right_thigh')
    if left_thigh and right_thigh:
        diff = abs(left_thigh - right_thigh)
        if diff > 0.5:
            larger = "right" if right_thigh > left_thigh else "left"
            analysis["muscle_imbalances"].append(f"{larger.capitalize()} thigh is larger - include single-leg exercises")
    
    # Estimate body type from proportions
    shoulders = measurements.get('shoulders')
    if waist and shoulders:
        ratio = shoulders / waist
        if ratio > 1.4:
            analysis["body_type"] = "mesomorph"
            analysis["strong_areas"].append("Good shoulder-to-waist ratio (V-taper)")
        elif ratio < 1.2:
            analysis["body_type"] = "endomorph"
            analysis["areas_to_improve"].append("Shoulder development")
    
    # Body fat estimation from measurements (Navy method approximation)
    neck = measurements.get('neck')
    height = user_info.get('height_inches')
    if waist and neck and height:
        # Simplified estimation
        bf_estimate = 86.010 * (waist - neck) / height - 70.041
        if 5 < bf_estimate < 45:
            analysis["body_fat_estimate"] = round(bf_estimate, 1)
    
    # Goal-based recommendations
    goal = user_info.get('fitness_goal', 'general_fitness')
    if goal == 'muscle_gain':
        analysis["recommendations"].extend([
            "Focus on progressive overload with compound movements",
            "Prioritize protein intake (1g per lb bodyweight)",
            "Include both heavy and hypertrophy rep ranges"
        ])
    elif goal == 'fat_loss':
        analysis["recommendations"].extend([
            "Combine strength training with cardio",
            "Focus on high-intensity interval training",
            "Maintain muscle mass with adequate protein"
        ])
    elif goal == 'strength':
        analysis["recommendations"].extend([
            "Prioritize compound lifts (squat, deadlift, bench, OHP)",
            "Use lower rep ranges (3-6 reps)",
            "Focus on progressive overload weekly"
        ])
    else:
        analysis["recommendations"].extend([
            "Include mix of strength and cardio training",
            "Focus on compound movements for efficiency",
            "Maintain consistent training schedule"
        ])
    
    return analysis

def generate_workout_from_analysis(analysis: dict, user_info: dict) -> dict:
    """Generate a personalized workout plan based on body analysis"""
    
    workout_location = user_info.get('workout_location', 'both')
    experience = user_info.get('experience_level', 'intermediate')
    goal = user_info.get('fitness_goal', 'general_fitness')
    areas_to_improve = analysis.get('areas_to_improve', [])
    
    # Base workout templates
    gym_exercises = {
        "chest": ["Bench Press", "Incline Dumbbell Press", "Cable Flyes", "Dips"],
        "back": ["Pull-ups", "Barbell Rows", "Lat Pulldown", "Cable Rows", "Deadlifts"],
        "shoulders": ["Overhead Press", "Lateral Raises", "Face Pulls", "Arnold Press"],
        "arms": ["Barbell Curls", "Tricep Pushdowns", "Hammer Curls", "Skull Crushers"],
        "legs": ["Squats", "Leg Press", "Romanian Deadlifts", "Leg Curls", "Calf Raises"],
        "core": ["Cable Crunches", "Hanging Leg Raises", "Planks", "Ab Wheel Rollouts"]
    }
    
    home_exercises = {
        "chest": ["Push-ups", "Diamond Push-ups", "Wide Push-ups", "Pike Push-ups"],
        "back": ["Pull-ups", "Inverted Rows", "Superman Holds", "Resistance Band Rows"],
        "shoulders": ["Pike Push-ups", "Lateral Raises (bands)", "Front Raises", "YTW Raises"],
        "arms": ["Chin-ups", "Diamond Push-ups", "Resistance Band Curls", "Tricep Dips"],
        "legs": ["Squats", "Lunges", "Bulgarian Split Squats", "Glute Bridges", "Calf Raises"],
        "core": ["Planks", "Mountain Climbers", "Bicycle Crunches", "Leg Raises", "Dead Bug"]
    }
    
    # Determine sets/reps based on goal
    if goal == 'strength':
        sets_reps = "4-5 sets x 3-6 reps"
        rest = "2-3 minutes"
    elif goal == 'muscle_gain':
        sets_reps = "3-4 sets x 8-12 reps"
        rest = "60-90 seconds"
    elif goal == 'fat_loss':
        sets_reps = "3-4 sets x 12-15 reps"
        rest = "30-60 seconds"
    else:
        sets_reps = "3 sets x 10-12 reps"
        rest = "60-90 seconds"
    
    # Build workout days
    workout_days = []
    
    # Determine split based on experience
    if experience == 'beginner':
        # Full body 3x per week
        exercises = gym_exercises if workout_location in ['gym', 'both'] else home_exercises
        workout_days = [
            {
                "day": 1,
                "name": "Full Body A",
                "focus": ["Full Body"],
                "exercises": [
                    {"name": exercises["legs"][0], "sets_reps": sets_reps, "notes": "Compound leg movement"},
                    {"name": exercises["chest"][0], "sets_reps": sets_reps, "notes": "Primary chest"},
                    {"name": exercises["back"][0], "sets_reps": sets_reps, "notes": "Primary back"},
                    {"name": exercises["shoulders"][0], "sets_reps": "3 sets x 10 reps", "notes": "Shoulder press"},
                    {"name": exercises["core"][0], "sets_reps": "3 sets x 30-60 sec", "notes": "Core stability"},
                ]
            },
            {
                "day": 2,
                "name": "Full Body B",
                "focus": ["Full Body"],
                "exercises": [
                    {"name": exercises["legs"][3] if len(exercises["legs"]) > 3 else exercises["legs"][1], "sets_reps": sets_reps, "notes": "Hamstring focus"},
                    {"name": exercises["chest"][1] if len(exercises["chest"]) > 1 else exercises["chest"][0], "sets_reps": sets_reps, "notes": "Secondary chest"},
                    {"name": exercises["back"][1] if len(exercises["back"]) > 1 else exercises["back"][0], "sets_reps": sets_reps, "notes": "Row movement"},
                    {"name": exercises["arms"][0], "sets_reps": "3 sets x 12 reps", "notes": "Bicep focus"},
                    {"name": exercises["core"][1] if len(exercises["core"]) > 1 else exercises["core"][0], "sets_reps": "3 sets x 15 reps", "notes": "Core movement"},
                ]
            }
        ]
    else:
        # Upper/Lower or Push/Pull/Legs split
        exercises = gym_exercises if workout_location in ['gym', 'both'] else home_exercises
        
        # Check areas to improve and prioritize
        prioritize_upper = any('shoulder' in a.lower() or 'arm' in a.lower() or 'chest' in a.lower() or 'back' in a.lower() for a in areas_to_improve)
        prioritize_lower = any('leg' in a.lower() or 'glute' in a.lower() or 'thigh' in a.lower() for a in areas_to_improve)
        prioritize_core = any('core' in a.lower() or 'waist' in a.lower() or 'midsection' in a.lower() for a in areas_to_improve)
        
        workout_days = [
            {
                "day": 1,
                "name": "Push (Chest, Shoulders, Triceps)",
                "focus": ["Chest", "Shoulders", "Triceps"],
                "exercises": [
                    {"name": exercises["chest"][0], "sets_reps": sets_reps, "notes": "Primary chest compound"},
                    {"name": exercises["chest"][1] if len(exercises["chest"]) > 1 else exercises["chest"][0], "sets_reps": sets_reps, "notes": "Secondary chest"},
                    {"name": exercises["shoulders"][0], "sets_reps": sets_reps, "notes": "Overhead pressing"},
                    {"name": exercises["shoulders"][1] if len(exercises["shoulders"]) > 1 else exercises["shoulders"][0], "sets_reps": "3 sets x 15 reps", "notes": "Lateral deltoid"},
                    {"name": exercises["arms"][1] if len(exercises["arms"]) > 1 else "Tricep Exercise", "sets_reps": "3 sets x 12 reps", "notes": "Tricep isolation"},
                ]
            },
            {
                "day": 2,
                "name": "Pull (Back, Biceps)",
                "focus": ["Back", "Biceps"],
                "exercises": [
                    {"name": exercises["back"][0], "sets_reps": sets_reps, "notes": "Vertical pull"},
                    {"name": exercises["back"][1] if len(exercises["back"]) > 1 else exercises["back"][0], "sets_reps": sets_reps, "notes": "Horizontal row"},
                    {"name": exercises["back"][2] if len(exercises["back"]) > 2 else exercises["back"][0], "sets_reps": sets_reps, "notes": "Secondary back"},
                    {"name": exercises["shoulders"][2] if len(exercises["shoulders"]) > 2 else "Face Pulls", "sets_reps": "3 sets x 15 reps", "notes": "Rear delts"},
                    {"name": exercises["arms"][0], "sets_reps": "3 sets x 12 reps", "notes": "Bicep work"},
                ]
            },
            {
                "day": 3,
                "name": "Legs & Core",
                "focus": ["Quads", "Hamstrings", "Glutes", "Core"],
                "exercises": [
                    {"name": exercises["legs"][0], "sets_reps": sets_reps, "notes": "Primary quad compound"},
                    {"name": exercises["legs"][2] if len(exercises["legs"]) > 2 else exercises["legs"][1], "sets_reps": sets_reps, "notes": "Hamstring focus"},
                    {"name": exercises["legs"][1] if len(exercises["legs"]) > 1 else exercises["legs"][0], "sets_reps": sets_reps, "notes": "Secondary leg"},
                    {"name": exercises["legs"][4] if len(exercises["legs"]) > 4 else "Calf Raises", "sets_reps": "4 sets x 15 reps", "notes": "Calf development"},
                    {"name": exercises["core"][0], "sets_reps": "3 sets x 45 sec", "notes": "Core stability"},
                    {"name": exercises["core"][1] if len(exercises["core"]) > 1 else exercises["core"][0], "sets_reps": "3 sets x 15 reps", "notes": "Core movement"},
                ]
            }
        ]
        
        # Add extra focus day if needed
        if prioritize_core:
            workout_days.append({
                "day": 4,
                "name": "Core & Conditioning",
                "focus": ["Core", "Cardio"],
                "exercises": [
                    {"name": exercises["core"][0], "sets_reps": "4 sets x 60 sec", "notes": "Plank variations"},
                    {"name": exercises["core"][1] if len(exercises["core"]) > 1 else "Crunches", "sets_reps": "3 sets x 20 reps", "notes": "Ab movement"},
                    {"name": "Mountain Climbers", "sets_reps": "3 sets x 30 sec", "notes": "Cardio core"},
                    {"name": "Russian Twists", "sets_reps": "3 sets x 20 reps", "notes": "Obliques"},
                    {"name": "HIIT Cardio", "sets_reps": "15-20 minutes", "notes": "Fat burning"},
                ]
            })
    
    return {
        "plan_name": f"Personalized {goal.replace('_', ' ').title()} Plan",
        "duration_weeks": 8,
        "days_per_week": len(workout_days),
        "sets_reps_scheme": sets_reps,
        "rest_between_sets": rest,
        "workout_days": workout_days,
        "notes": [
            "Warm up for 5-10 minutes before each workout",
            "Focus on proper form over heavy weight",
            "Progressive overload: increase weight/reps weekly",
            "Stay hydrated and get adequate sleep for recovery"
        ],
        "cardio_recommendation": "2-3 sessions per week, 20-30 minutes" if goal in ['fat_loss', 'general_fitness'] else "1-2 sessions per week for cardiovascular health"
    }

@api_router.post("/body-scan/analyze")
async def analyze_body_scan(data: BodyScanRequest):
    """Analyze body from photos and/or measurements and generate workout"""
    try:
        user_info = {
            "height_inches": data.height_inches,
            "weight_lbs": data.weight_lbs,
            "body_fat_percentage": data.body_fat_percentage,
            "fitness_goal": data.fitness_goal,
            "workout_location": data.workout_location,
            "experience_level": data.experience_level
        }
        
        measurements_dict = data.measurements.dict() if data.measurements else {}
        
        # Analyze based on available data
        if data.photos and len(data.photos) > 0:
            # Use AI vision for photo analysis
            analysis = await analyze_body_photos_with_ai(data.photos, measurements_dict, user_info)
        else:
            # Use measurements only
            analysis = analyze_measurements_only(measurements_dict, user_info)
        
        # Generate personalized workout
        workout_plan = generate_workout_from_analysis(analysis, user_info)
        
        # Save scan to database
        scan_record = {
            "scan_id": f"scan_{datetime.now().timestamp()}",
            "user_id": data.user_id,
            "measurements": measurements_dict,
            "analysis": analysis,
            "workout_plan": workout_plan,
            "user_info": user_info,
            "created_at": datetime.utcnow().isoformat()
        }
        
        await db.body_scans.insert_one(scan_record)
        
        return {
            "scan_id": scan_record["scan_id"],
            "analysis": analysis,
            "workout_plan": workout_plan,
            "message": "Body scan analysis complete"
        }
        
    except Exception as e:
        logger.error(f"Error analyzing body scan: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/body-scan/history/{user_id}")
async def get_body_scan_history(user_id: str, limit: int = 10):
    """Get user's body scan history"""
    try:
        scans = await db.body_scans.find(
            {"user_id": user_id}
        ).sort("created_at", -1).to_list(limit)
        
        # Don't include full workout plans in list view
        for scan in scans:
            scan["_id"] = str(scan["_id"])
            if "workout_plan" in scan:
                scan["has_workout_plan"] = True
                del scan["workout_plan"]
        
        return {"scans": scans, "count": len(scans)}
    except Exception as e:
        logger.error(f"Error getting body scan history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/body-scan/{scan_id}")
async def get_body_scan(scan_id: str):
    """Get a specific body scan with full details"""
    try:
        scan = await db.body_scans.find_one({"scan_id": scan_id})
        if not scan:
            raise HTTPException(status_code=404, detail="Scan not found")
        
        scan["_id"] = str(scan["_id"])
        return scan
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting body scan: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/body-scan/progress/{user_id}")
async def get_body_scan_progress(user_id: str):
    """Get measurement progress over time"""
    try:
        scans = await db.body_scans.find(
            {"user_id": user_id}
        ).sort("created_at", 1).to_list(100)
        
        if not scans:
            return {"has_data": False, "measurements": []}
        
        # Extract measurements over time
        progress_data = []
        for scan in scans:
            if scan.get("measurements"):
                progress_data.append({
                    "scan_id": scan.get("scan_id"),
                    "date": scan["created_at"][:10],
                    "measurements": scan["measurements"],
                    "weight": scan.get("user_info", {}).get("weight_lbs"),
                    "body_fat": scan.get("analysis", {}).get("body_fat_estimate")
                })
        
        return {
            "has_data": len(progress_data) > 0,
            "progress": progress_data,
            "total_scans": len(scans)
        }
    except Exception as e:
        logger.error(f"Error getting body scan progress: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/body-scan/{scan_id}")
async def delete_body_scan(scan_id: str):
    """Delete a body scan entry"""
    try:
        result = await db.body_scans.delete_one({"scan_id": scan_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Scan not found")
        return {"message": "Body scan deleted successfully", "scan_id": scan_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting body scan: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# MANUAL WORKOUT LOG ENDPOINTS
# ============================================================================

class ManualWorkoutLogEntry(BaseModel):
    user_id: str
    exercise_name: str
    reps: dict = {}
    weight: dict = {}
    notes: str = ""

@api_router.post("/manual-workout-log")
async def create_manual_workout_entry(entry: ManualWorkoutLogEntry):
    """Create a new manual workout log entry"""
    try:
        entry_id = f"mwl_{datetime.utcnow().timestamp()}_{entry.user_id[:8]}"
        entry_data = {
            "entry_id": entry_id,
            "user_id": entry.user_id,
            "exercise_name": entry.exercise_name,
            "reps": entry.reps,
            "weight": entry.weight,
            "notes": entry.notes,
            "synced_to_calendar": False,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        await db.manual_workout_logs.insert_one(entry_data)
        return {
            "message": "Workout entry created", 
            "entry": {
                "entry_id": entry_id,
                "exercise_name": entry.exercise_name,
                "reps": entry.reps,
                "weight": entry.weight,
                "notes": entry.notes
            }
        }
    except Exception as e:
        logger.error(f"Error creating manual workout entry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/manual-workout-log/{user_id}")
async def get_manual_workout_entries(user_id: str):
    """Get all manual workout log entries for a user"""
    try:
        entries = await db.manual_workout_logs.find(
            {"user_id": user_id}
        ).sort("created_at", -1).to_list(100)
        
        # Remove MongoDB _id field
        for entry in entries:
            entry.pop('_id', None)
        
        return {"entries": entries}
    except Exception as e:
        logger.error(f"Error getting manual workout entries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/manual-workout-log/{entry_id}")
async def update_manual_workout_entry(entry_id: str, entry: ManualWorkoutLogEntry):
    """Update a manual workout log entry"""
    try:
        update_data = {
            "exercise_name": entry.exercise_name,
            "reps": entry.reps,
            "weight": entry.weight,
            "notes": entry.notes,
            "updated_at": datetime.utcnow().isoformat(),
        }
        result = await db.manual_workout_logs.update_one(
            {"entry_id": entry_id},
            {"$set": update_data}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Entry not found")
        return {"message": "Workout entry updated", "entry_id": entry_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating manual workout entry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/manual-workout-log/{entry_id}")
async def delete_manual_workout_entry(entry_id: str):
    """Delete a manual workout log entry"""
    try:
        result = await db.manual_workout_logs.delete_one({"entry_id": entry_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Entry not found")
        return {"message": "Workout entry deleted", "entry_id": entry_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting manual workout entry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/manual-workout-log/all/{user_id}")
async def delete_all_manual_workout_entries(user_id: str, date: str = Query(..., description="Date in YYYY-MM-DD format")):
    """Delete all manual workout log entries for a user on a specific date"""
    try:
        # Delete all entries for the user on the specified date
        # Match entries where created_at starts with the given date (YYYY-MM-DD)
        result = await db.manual_workout_logs.delete_many({
            "user_id": user_id,
            "created_at": {"$regex": f"^{date}"}
        })
        return {
            "message": f"Deleted {result.deleted_count} workout entries",
            "deleted_count": result.deleted_count,
            "user_id": user_id,
            "date": date
        }
    except Exception as e:
        logger.error(f"Error deleting all manual workout entries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class WorkoutCompleteData(BaseModel):
    user_id: str
    workout_date: str
    exercises: list
    completed_at: str

@api_router.post("/manual-workout-log/complete")
async def complete_workout(data: WorkoutCompleteData):
    """Mark workout as complete and sync to schedule calendar"""
    try:
        # Get all unsynced entries for today for this user
        today = data.workout_date
        
        # Create a scheduled workout entry for the calendar
        workout_id = f"completed_{datetime.utcnow().timestamp()}_{data.user_id[:8]}"
        
        # Build exercise summary for the calendar
        exercise_names = [e.get('name', 'Unknown') for e in data.exercises]
        
        # Create calendar entry
        calendar_entry = {
            "workout_id": workout_id,
            "user_id": data.user_id,
            "workout_type": "manual_log",
            "title": f"Workout Log - {len(data.exercises)} exercises",
            "description": ", ".join(exercise_names),
            "exercises": data.exercises,
            "scheduled_date": today,
            "completed": True,
            "completed_at": data.completed_at,
            "created_at": datetime.utcnow().isoformat(),
        }
        
        await db.scheduled_workouts.insert_one(calendar_entry)
        
        # Mark all entries as synced
        await db.manual_workout_logs.update_many(
            {"user_id": data.user_id, "synced_to_calendar": False},
            {"$set": {"synced_to_calendar": True}}
        )
        
        return {
            "message": "Workout completed and synced to calendar",
            "workout_id": workout_id,
            "exercises_count": len(data.exercises)
        }
    except Exception as e:
        logger.error(f"Error completing workout: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# WORKOUT TEMPLATES - Save and Schedule Repeating Workouts
# ============================================================================

# Available colors for workout templates
WORKOUT_COLORS = [
    {"id": "blue", "name": "Blue", "hex": "#3B82F6"},
    {"id": "purple", "name": "Purple", "hex": "#8B5CF6"},
    {"id": "pink", "name": "Pink", "hex": "#EC4899"},
    {"id": "red", "name": "Red", "hex": "#EF4444"},
    {"id": "orange", "name": "Orange", "hex": "#F59E0B"},
    {"id": "yellow", "name": "Yellow", "hex": "#EAB308"},
    {"id": "green", "name": "Green", "hex": "#22C55E"},
    {"id": "teal", "name": "Teal", "hex": "#14B8A6"},
    {"id": "cyan", "name": "Cyan", "hex": "#06B6D4"},
    {"id": "indigo", "name": "Indigo", "hex": "#6366F1"},
]

class WorkoutTemplateCreate(BaseModel):
    user_id: str
    name: str
    exercises: list  # List of exercise objects with name, sets, reps, weight, notes
    source: str = "manual"  # "manual" or "ai_coach"
    color: str = "blue"  # Color ID for the template

class ScheduleWorkoutTemplate(BaseModel):
    user_id: str
    template_id: str
    scheduled_days: list  # List of dates in YYYY-MM-DD format
    time: str = "08:00"  # Time for the workout
    recurring_days: Optional[list] = None  # Optional: days of week for recurring (0=Mon, 6=Sun)
    reminder_option: str = "30min"  # Reminder option ID
    reminder_minutes: int = 30  # Minutes before workout to send reminder

class UpdateScheduledWorkout(BaseModel):
    title: Optional[str] = None
    scheduled_time: Optional[str] = None
    exercises: Optional[list] = None
    color: Optional[str] = None
    reminder_option: Optional[str] = None
    reminder_minutes: Optional[int] = None

@api_router.get("/workout-colors")
async def get_workout_colors():
    """Get available colors for workout templates"""
    return {"colors": WORKOUT_COLORS}

@api_router.post("/workout-templates")
async def create_workout_template(template: WorkoutTemplateCreate):
    """Save current workout as a reusable template"""
    try:
        template_id = f"wt_{datetime.utcnow().timestamp()}_{template.user_id[:8]}"
        
        # Find the color hex
        color_data = next((c for c in WORKOUT_COLORS if c["id"] == template.color), WORKOUT_COLORS[0])
        
        template_data = {
            "template_id": template_id,
            "user_id": template.user_id,
            "name": template.name,
            "exercises": template.exercises,
            "source": template.source,
            "color": template.color,
            "color_hex": color_data["hex"],
            "created_at": datetime.utcnow().isoformat(),
            "last_used": None,
            "times_used": 0,
        }
        
        await db.workout_templates.insert_one(template_data)
        
        return {
            "message": "Workout template saved",
            "template_id": template_id,
            "name": template.name,
            "color": template.color,
            "color_hex": color_data["hex"]
        }
    except Exception as e:
        logger.error(f"Error creating workout template: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/workout-templates/{user_id}")
async def get_workout_templates(user_id: str):
    """Get all saved workout templates for a user"""
    try:
        templates = await db.workout_templates.find(
            {"user_id": user_id}
        ).sort("created_at", -1).to_list(50)
        
        for template in templates:
            template.pop('_id', None)
        
        return {"templates": templates}
    except Exception as e:
        logger.error(f"Error getting workout templates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/workout-templates/{template_id}")
async def delete_workout_template(template_id: str):
    """Delete a workout template"""
    try:
        result = await db.workout_templates.delete_one({"template_id": template_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Template not found")
        return {"message": "Template deleted", "template_id": template_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting workout template: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/workout-templates/schedule")
async def schedule_workout_template(schedule: ScheduleWorkoutTemplate):
    """Schedule a workout template on specific days"""
    try:
        # Get the template
        template = await db.workout_templates.find_one({"template_id": schedule.template_id})
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        scheduled_workouts = []
        
        for scheduled_date in schedule.scheduled_days:
            workout_id = f"scheduled_{datetime.utcnow().timestamp()}_{schedule.user_id[:8]}_{scheduled_date}"
            
            workout_entry = {
                "workout_id": workout_id,
                "user_id": schedule.user_id,
                "template_id": schedule.template_id,
                "workout_type": "scheduled_template",
                "title": template["name"],
                "description": f"{len(template['exercises'])} exercises",
                "exercises": template["exercises"],
                "scheduled_date": scheduled_date,
                "scheduled_time": schedule.time,
                "completed": False,
                "completed_at": None,
                "recurring_days": schedule.recurring_days,
                "color": template.get("color", "blue"),
                "color_hex": template.get("color_hex", "#3B82F6"),
                "created_at": datetime.utcnow().isoformat(),
            }
            
            await db.scheduled_workouts.insert_one(workout_entry)
            scheduled_workouts.append(workout_id)
        
        # Update template usage stats
        await db.workout_templates.update_one(
            {"template_id": schedule.template_id},
            {
                "$set": {"last_used": datetime.utcnow().isoformat()},
                "$inc": {"times_used": 1}
            }
        )
        
        return {
            "message": f"Workout scheduled for {len(schedule.scheduled_days)} day(s)",
            "scheduled_workouts": scheduled_workouts
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scheduling workout template: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/workout-templates/load/{template_id}")
async def load_template_to_workout_log(template_id: str, user_id: str = Query(...)):
    """Load a template's exercises into the manual workout log"""
    try:
        template = await db.workout_templates.find_one({"template_id": template_id})
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # Clear existing entries for this user (optional - could be made a parameter)
        # await db.manual_workout_logs.delete_many({"user_id": user_id})
        
        entries_created = []
        for exercise in template["exercises"]:
            entry_id = f"mwl_{datetime.utcnow().timestamp()}_{user_id[:8]}"
            
            entry_data = {
                "entry_id": entry_id,
                "user_id": user_id,
                "exercise_name": exercise.get("name", "Unknown"),
                "reps": exercise.get("reps", {}),
                "weight": exercise.get("weight", {}),
                "notes": exercise.get("notes", ""),
                "synced_to_calendar": False,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "from_template": template_id,
            }
            
            await db.manual_workout_logs.insert_one(entry_data)
            entries_created.append(entry_id)
        
        # Update template usage stats
        await db.workout_templates.update_one(
            {"template_id": template_id},
            {
                "$set": {"last_used": datetime.utcnow().isoformat()},
                "$inc": {"times_used": 1}
            }
        )
        
        return {
            "message": f"Loaded {len(entries_created)} exercises from template",
            "entries": entries_created,
            "template_name": template["name"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading template: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/scheduled-workout/{workout_id}")
async def get_scheduled_workout(workout_id: str):
    """Get a single scheduled workout by ID"""
    try:
        workout = await db.scheduled_workouts.find_one({
            "$or": [
                {"workout_id": workout_id},
                {"scheduled_id": workout_id}
            ]
        })
        if not workout:
            raise HTTPException(status_code=404, detail="Scheduled workout not found")
        
        workout.pop('_id', None)
        return {"workout": workout}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting scheduled workout: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/scheduled-workout/{workout_id}")
async def update_scheduled_workout(workout_id: str, update: UpdateScheduledWorkout):
    """Update a scheduled workout"""
    try:
        update_data = {}
        if update.title is not None:
            update_data["title"] = update.title
        if update.scheduled_time is not None:
            update_data["scheduled_time"] = update.scheduled_time
        if update.exercises is not None:
            update_data["exercises"] = update.exercises
            update_data["description"] = f"{len(update.exercises)} exercises"
        if update.color is not None:
            color_data = next((c for c in WORKOUT_COLORS if c["id"] == update.color), WORKOUT_COLORS[0])
            update_data["color"] = update.color
            update_data["color_hex"] = color_data["hex"]
        if update.reminder_option is not None:
            update_data["reminder_option"] = update.reminder_option
        if update.reminder_minutes is not None:
            update_data["reminder_minutes"] = update.reminder_minutes
        
        update_data["updated_at"] = datetime.utcnow().isoformat()
        
        result = await db.scheduled_workouts.update_one(
            {"$or": [{"workout_id": workout_id}, {"scheduled_id": workout_id}]},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Scheduled workout not found")
        
        return {"message": "Workout updated successfully", "workout_id": workout_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating scheduled workout: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# STEP TRACKER ENDPOINTS
# ============================================================================

class StepEntry(BaseModel):
    user_id: str
    steps: int
    date: str  # YYYY-MM-DD format
    source: str = "manual"  # manual, pedometer, healthkit, health_connect
    calories_burned: Optional[float] = None
    distance_miles: Optional[float] = None

class StepGoalSettings(BaseModel):
    user_id: str
    daily_goal: int = 10000
    tracking_enabled: bool = False  # Start in OFF position by default
    auto_sync_health: bool = False

@api_router.post("/steps")
async def save_steps(entry: StepEntry):
    """Save or update step entry for a specific date"""
    try:
        # Calculate calories if not provided (approx 0.04 cal per step)
        if entry.calories_burned is None:
            entry.calories_burned = round(entry.steps * 0.04, 1)
        
        # Calculate distance if not provided (approx 2000 steps per mile)
        if entry.distance_miles is None:
            entry.distance_miles = round(entry.steps / 2000, 2)
        
        # Upsert - update if exists for that date, otherwise insert
        result = await db.step_entries.update_one(
            {"user_id": entry.user_id, "date": entry.date},
            {"$set": {
                "steps": entry.steps,
                "source": entry.source,
                "calories_burned": entry.calories_burned,
                "distance_miles": entry.distance_miles,
                "updated_at": datetime.utcnow().isoformat()
            }},
            upsert=True
        )
        
        return {
            "message": "Steps saved successfully",
            "date": entry.date,
            "steps": entry.steps,
            "calories_burned": entry.calories_burned,
            "distance_miles": entry.distance_miles
        }
    except Exception as e:
        logger.error(f"Error saving steps: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/steps/{user_id}/today")
async def get_today_steps(user_id: str):
    """Get today's step count"""
    try:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        entry = await db.step_entries.find_one({"user_id": user_id, "date": today})
        
        if entry:
            return {
                "date": today,
                "steps": entry.get("steps", 0),
                "calories_burned": entry.get("calories_burned", 0),
                "distance_miles": entry.get("distance_miles", 0),
                "source": entry.get("source", "manual")
            }
        return {
            "date": today,
            "steps": 0,
            "calories_burned": 0,
            "distance_miles": 0,
            "source": None
        }
    except Exception as e:
        logger.error(f"Error getting today's steps: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/steps/{user_id}/history")
async def get_step_history(user_id: str, days: int = 30):
    """Get step history for the past N days"""
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        entries = await db.step_entries.find({
            "user_id": user_id,
            "date": {
                "$gte": start_date.strftime("%Y-%m-%d"),
                "$lte": end_date.strftime("%Y-%m-%d")
            }
        }).sort("date", -1).to_list(length=days)
        
        # Calculate totals
        total_steps = sum(e.get("steps", 0) for e in entries)
        total_calories = sum(e.get("calories_burned", 0) for e in entries)
        total_distance = sum(e.get("distance_miles", 0) for e in entries)
        avg_steps = total_steps // len(entries) if entries else 0
        
        return {
            "entries": [{
                "date": e.get("date"),
                "steps": e.get("steps", 0),
                "calories_burned": e.get("calories_burned", 0),
                "distance_miles": e.get("distance_miles", 0),
                "source": e.get("source", "manual")
            } for e in entries],
            "summary": {
                "total_steps": total_steps,
                "total_calories": round(total_calories, 1),
                "total_distance": round(total_distance, 2),
                "average_steps": avg_steps,
                "days_tracked": len(entries)
            }
        }
    except Exception as e:
        logger.error(f"Error getting step history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/steps/{user_id}/weekly")
async def get_weekly_steps(user_id: str):
    """Get step data aggregated by week for the past 12 weeks"""
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(weeks=12)
        
        entries = await db.step_entries.find({
            "user_id": user_id,
            "date": {
                "$gte": start_date.strftime("%Y-%m-%d"),
                "$lte": end_date.strftime("%Y-%m-%d")
            }
        }).to_list(length=100)
        
        # Group by week
        weeks = {}
        for entry in entries:
            date = datetime.strptime(entry["date"], "%Y-%m-%d")
            week_start = date - timedelta(days=date.weekday())
            week_key = week_start.strftime("%Y-%m-%d")
            
            if week_key not in weeks:
                weeks[week_key] = {"steps": 0, "days": 0}
            weeks[week_key]["steps"] += entry.get("steps", 0)
            weeks[week_key]["days"] += 1
        
        weekly_data = [
            {
                "week_start": k,
                "total_steps": v["steps"],
                "average_daily": v["steps"] // v["days"] if v["days"] > 0 else 0,
                "days_tracked": v["days"]
            }
            for k, v in sorted(weeks.items())
        ]
        
        return {"weekly_data": weekly_data}
    except Exception as e:
        logger.error(f"Error getting weekly steps: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/steps/{user_id}/monthly")
async def get_monthly_steps(user_id: str):
    """Get step data aggregated by month for the past 12 months"""
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=365)
        
        entries = await db.step_entries.find({
            "user_id": user_id,
            "date": {
                "$gte": start_date.strftime("%Y-%m-%d"),
                "$lte": end_date.strftime("%Y-%m-%d")
            }
        }).to_list(length=400)
        
        # Group by month
        months = {}
        for entry in entries:
            date = datetime.strptime(entry["date"], "%Y-%m-%d")
            month_key = date.strftime("%Y-%m")
            
            if month_key not in months:
                months[month_key] = {"steps": 0, "days": 0}
            months[month_key]["steps"] += entry.get("steps", 0)
            months[month_key]["days"] += 1
        
        monthly_data = [
            {
                "month": k,
                "total_steps": v["steps"],
                "average_daily": v["steps"] // v["days"] if v["days"] > 0 else 0,
                "days_tracked": v["days"]
            }
            for k, v in sorted(months.items())
        ]
        
        return {"monthly_data": monthly_data}
    except Exception as e:
        logger.error(f"Error getting monthly steps: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/steps/settings")
async def save_step_settings(settings: StepGoalSettings):
    """Save user's step tracking settings"""
    try:
        await db.step_settings.update_one(
            {"user_id": settings.user_id},
            {"$set": {
                "daily_goal": settings.daily_goal,
                "tracking_enabled": settings.tracking_enabled,
                "auto_sync_health": settings.auto_sync_health,
                "updated_at": datetime.utcnow().isoformat()
            }},
            upsert=True
        )
        return {"message": "Settings saved", "settings": settings.dict()}
    except Exception as e:
        logger.error(f"Error saving step settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/steps/settings/{user_id}")
async def get_step_settings(user_id: str):
    """Get user's step tracking settings"""
    try:
        settings = await db.step_settings.find_one({"user_id": user_id})
        if settings:
            return {
                "daily_goal": settings.get("daily_goal", 10000),
                "tracking_enabled": settings.get("tracking_enabled", False),  # Default OFF
                "auto_sync_health": settings.get("auto_sync_health", False)
            }
        # Return defaults with tracking OFF for new users
        return {
            "daily_goal": 10000,
            "tracking_enabled": False,
            "auto_sync_health": False
        }
    except Exception as e:
        logger.error(f"Error getting step settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/steps/{user_id}/history/daily")
async def delete_daily_step_history(user_id: str):
    """Delete today's step data for a user"""
    try:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        result = await db.step_data.delete_many({
            "user_id": user_id,
            "date": today
        })
        logger.info(f"Deleted {result.deleted_count} daily step records for user {user_id}")
        return {
            "message": "Daily step history deleted",
            "deleted_count": result.deleted_count
        }
    except Exception as e:
        logger.error(f"Error deleting daily step history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/steps/{user_id}/history/weekly")
async def delete_weekly_step_history(user_id: str):
    """Delete this week's step data for a user"""
    try:
        today = datetime.utcnow()
        # Get start of week (Monday)
        start_of_week = today - timedelta(days=today.weekday())
        start_date = start_of_week.strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")
        
        result = await db.step_data.delete_many({
            "user_id": user_id,
            "date": {"$gte": start_date, "$lte": end_date}
        })
        logger.info(f"Deleted {result.deleted_count} weekly step records for user {user_id}")
        return {
            "message": "Weekly step history deleted",
            "deleted_count": result.deleted_count,
            "period": f"{start_date} to {end_date}"
        }
    except Exception as e:
        logger.error(f"Error deleting weekly step history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/steps/{user_id}/history/monthly")
async def delete_monthly_step_history(user_id: str):
    """Delete this month's step data for a user"""
    try:
        today = datetime.utcnow()
        start_of_month = today.replace(day=1).strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")
        
        result = await db.step_data.delete_many({
            "user_id": user_id,
            "date": {"$gte": start_of_month, "$lte": end_date}
        })
        logger.info(f"Deleted {result.deleted_count} monthly step records for user {user_id}")
        return {
            "message": "Monthly step history deleted",
            "deleted_count": result.deleted_count,
            "period": f"{start_of_month} to {end_date}"
        }
    except Exception as e:
        logger.error(f"Error deleting monthly step history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/steps/{user_id}/history/all")
async def delete_all_step_history(user_id: str):
    """Delete all step data for a user"""
    try:
        result = await db.step_data.delete_many({"user_id": user_id})
        logger.info(f"Deleted {result.deleted_count} total step records for user {user_id}")
        return {
            "message": "All step history deleted",
            "deleted_count": result.deleted_count
        }
    except Exception as e:
        logger.error(f"Error deleting all step history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# ADMIN ENDPOINTS (Production Monitoring)
# ============================================================================

@api_router.get("/admin/health-check")
async def admin_health_check():
    """Detailed health check for production monitoring"""
    from config import run_production_checks
    
    checks = run_production_checks()
    
    # Test database connection
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "database": db_status,
        "environment": checks["environment"],
        "config_issues": len(checks["issues"]),
        "critical_issues": len(checks["critical"]),
        "warnings": len(checks["warnings"])
    }

@api_router.get("/admin/audit-logs")
async def get_audit_logs(
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    skip: int = 0
):
    """Retrieve audit logs"""
    logs = await audit_storage.get_logs(user_id, action, limit, skip)
    return {"logs": logs, "count": len(logs)}

# ============================================================================
# AI WORKOUT CHAT ENDPOINT
# ============================================================================

class AIWorkoutChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str
    user_profile: Optional[dict] = None
    conversation_history: Optional[List[dict]] = []

class ChatMessageData(BaseModel):
    id: str
    role: str
    content: str
    timestamp: str
    workout: Optional[dict] = None

class SaveConversationRequest(BaseModel):
    user_id: str
    messages: List[ChatMessageData]

@api_router.post("/ai-workout-chat/save")
async def save_workout_chat(request: SaveConversationRequest):
    """Save AI workout chat conversation - expires after 12 hours"""
    try:
        # Delete any existing conversation for this user
        await db.workout_chat_conversations.delete_many({"user_id": request.user_id})
        
        # Save new conversation with expiration time (12 hours from now)
        expiration_time = datetime.utcnow() + timedelta(hours=12)
        
        conversation_data = {
            "user_id": request.user_id,
            "messages": [msg.dict() for msg in request.messages],
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": expiration_time.isoformat()
        }
        
        await db.workout_chat_conversations.insert_one(conversation_data)
        
        return {"success": True, "message": "Conversation saved", "expires_at": expiration_time.isoformat()}
    except Exception as e:
        logger.error(f"Error saving workout chat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/ai-workout-chat/load/{user_id}")
async def load_workout_chat(user_id: str):
    """Load AI workout chat conversation if not expired"""
    try:
        conversation = await db.workout_chat_conversations.find_one({"user_id": user_id})
        
        if not conversation:
            return {"messages": [], "found": False}
        
        # Check if conversation has expired
        expires_at = conversation.get("expires_at")
        if expires_at:
            expiration_time = datetime.fromisoformat(expires_at.replace('Z', '+00:00')) if 'Z' in expires_at else datetime.fromisoformat(expires_at)
            if datetime.utcnow() > expiration_time:
                # Conversation expired, delete it
                await db.workout_chat_conversations.delete_one({"user_id": user_id})
                return {"messages": [], "found": False, "expired": True}
        
        conversation.pop('_id', None)
        return {
            "messages": conversation.get("messages", []),
            "found": True,
            "expires_at": conversation.get("expires_at")
        }
    except Exception as e:
        logger.error(f"Error loading workout chat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/ai-workout-chat/clear/{user_id}")
async def clear_workout_chat(user_id: str):
    """Clear AI workout chat conversation"""
    try:
        result = await db.workout_chat_conversations.delete_many({"user_id": user_id})
        return {"success": True, "deleted_count": result.deleted_count}
    except Exception as e:
        logger.error(f"Error clearing workout chat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/ai-workout-chat")
async def ai_workout_chat(request: AIWorkoutChatRequest):
    """AI-powered workout chat - creates personalized workouts through conversation"""
    try:
        api_key = os.getenv('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
        
        # Build context from user profile
        profile_context = ""
        if request.user_profile:
            profile_context = f"""
User Profile:
- Name: {request.user_profile.get('name', 'User')}
- Fitness Level: {request.user_profile.get('fitness_level', 'moderate')}
- Goals: {request.user_profile.get('goals', 'general fitness')}
"""
        
        # Build conversation history for context
        history_text = ""
        if request.conversation_history:
            for msg in request.conversation_history[-6:]:  # Last 6 messages for context
                role = "User" if msg.get("role") == "user" else "Coach"
                history_text += f"{role}: {msg.get('content', '')}\n"
        
        # System prompt for workout creation
        system_message = f"""You are an expert fitness coach AI assistant. Your job is to help users create personalized workout plans through friendly conversation.

{profile_context}

GUIDELINES:
1. Be encouraging, friendly, and motivational
2. Ask clarifying questions if needed (duration, equipment, fitness level, target muscles, preferred weights)
3. When you have enough information, create a detailed workout plan
4. Always explain the benefits of exercises you recommend
5. Adapt to the user's fitness level
6. If user mentions specific weights they want to use, include them in the workout

WHEN CREATING A WORKOUT:
After your conversational response, if you're providing a complete workout, include a JSON block at the END of your response in this exact format:

```workout
{{
  "name": "Workout Name",
  "description": "Brief description",
  "duration_minutes": 30,
  "exercises": [
    {{
      "name": "Exercise Name",
      "sets": 3,
      "reps": "10-12",
      "weight": "20 lbs",
      "duration": null,
      "rest": "60 seconds",
      "notes": "Form tips or modifications"
    }}
  ]
}}
```

IMPORTANT for weight field:
- Include weight recommendations based on exercise type and user's fitness level
- For bodyweight exercises, use "Bodyweight" 
- For weighted exercises, suggest appropriate weight like "15 lbs", "20 kg", etc.
- If user specifies weights they want to use, use those exact values

Only include the workout JSON when you're presenting a finalized workout plan, not during clarifying questions.

Previous conversation:
{history_text}
"""
        
        # Create chat instance
        chat = LlmChat(
            api_key=api_key,
            session_id=request.session_id,
            system_message=system_message
        ).with_model("openai", "gpt-4o")
        
        # Send message
        user_message = UserMessage(text=request.message)
        response = await chat.send_message(user_message)
        
        # Parse response for workout JSON
        workout = None
        message_text = response
        
        if "```workout" in response:
            try:
                # Extract JSON from workout block
                parts = response.split("```workout")
                message_text = parts[0].strip()
                json_str = parts[1].split("```")[0].strip()
                workout = json.loads(json_str)
            except Exception as e:
                logger.warning(f"Failed to parse workout JSON: {e}")
        elif "```json" in response:
            try:
                # Try parsing as regular JSON block
                parts = response.split("```json")
                message_text = parts[0].strip()
                json_str = parts[1].split("```")[0].strip()
                data = json.loads(json_str)
                if "exercises" in data:
                    workout = data
            except Exception as e:
                logger.warning(f"Failed to parse JSON: {e}")
        
        return {
            "message": message_text or response,
            "workout": workout,
            "session_id": request.session_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in AI workout chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process message: {str(e)}")


# ============================================================
# MEAL PLANNER, GROCERY LIST & RECIPE ENDPOINTS
# ============================================================

class PlannedMealRequest(BaseModel):
    user_id: str
    meal: dict

@api_router.post("/meals/planned")
async def create_planned_meal(request: PlannedMealRequest):
    """Create a planned meal"""
    try:
        meal_data = request.meal
        meal_data["user_id"] = request.user_id
        meal_data["created_at"] = datetime.utcnow().isoformat()
        
        await db.planned_meals.insert_one(meal_data)
        return {"message": "Meal planned successfully", "meal_id": meal_data.get("id")}
    except Exception as e:
        logger.error(f"Error creating planned meal: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/meals/planned/{user_id}")
async def get_planned_meals(user_id: str, date: str = None):
    """Get planned meals for a user, optionally filtered by date"""
    try:
        query = {"user_id": user_id}
        if date:
            query["date"] = date
        
        meals = await db.planned_meals.find(query).sort("created_at", -1).to_list(100)
        for meal in meals:
            meal["_id"] = str(meal["_id"])
        
        return {"meals": meals}
    except Exception as e:
        logger.error(f"Error getting planned meals: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/meals/planned/{meal_id}/cook")
async def mark_meal_cooked(meal_id: str, user_id: str = Body(..., embed=True)):
    """Mark a planned meal as cooked"""
    try:
        result = await db.planned_meals.update_one(
            {"id": meal_id, "user_id": user_id},
            {"$set": {"cooked": True, "cooked_at": datetime.utcnow().isoformat()}}
        )
        return {"message": "Meal marked as cooked", "modified": result.modified_count}
    except Exception as e:
        logger.error(f"Error marking meal as cooked: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/meals/planned/{meal_id}")
async def delete_planned_meal(meal_id: str, user_id: str):
    """Delete a planned meal"""
    try:
        result = await db.planned_meals.delete_one({"id": meal_id, "user_id": user_id})
        return {"message": "Meal deleted", "deleted": result.deleted_count}
    except Exception as e:
        logger.error(f"Error deleting planned meal: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class UpdateMealRequest(BaseModel):
    user_id: str
    meal: dict

@api_router.put("/meals/planned/{meal_id}")
async def update_planned_meal(meal_id: str, request: UpdateMealRequest):
    """Update a planned meal"""
    try:
        meal_data = request.meal
        meal_data["user_id"] = request.user_id
        meal_data["updated_at"] = datetime.utcnow().isoformat()
        
        result = await db.planned_meals.update_one(
            {"id": meal_id, "user_id": request.user_id},
            {"$set": meal_data}
        )
        return {"message": "Meal updated", "modified": result.modified_count}
    except Exception as e:
        logger.error(f"Error updating planned meal: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Custom meal logging
class CustomMealLog(BaseModel):
    user_id: str
    meal_name: str
    meal_category: str
    calories: int
    protein: int
    carbs: int
    fat: int
    sugar: int = 0
    fiber: int = 0
    sodium: int = 0

@api_router.post("/food/log-custom")
async def log_custom_meal(request: CustomMealLog):
    """Log a custom meal to nutrition tracker"""
    try:
        today_date = datetime.utcnow().strftime("%Y-%m-%d")
        meal_data = {
            "meal_id": f"custom_{int(datetime.utcnow().timestamp() * 1000)}",
            "user_id": request.user_id,
            "meal_category": request.meal_category,
            "food_name": request.meal_name,
            "calories": request.calories,
            "protein": request.protein,
            "carbs": request.carbs,
            "fat": request.fat,
            "sugar": request.sugar,
            "fiber": request.fiber,
            "sodium": request.sodium,
            "timestamp": datetime.utcnow().isoformat(),
            "date": today_date,
            "source": "custom_meal"
        }
        
        await db.meals.insert_one(meal_data)
        return {"message": "Meal logged successfully", "meal_id": meal_data["meal_id"]}
    except Exception as e:
        logger.error(f"Error logging custom meal: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/meals/nutrition-log/{meal_id}")
async def delete_nutrition_log(meal_id: str, user_id: str):
    """Delete a logged meal from nutrition tracker"""
    try:
        result = await db.meals.delete_one({"meal_id": meal_id, "user_id": user_id})
        if result.deleted_count == 0:
            # Also try to find by custom meal pattern
            result = await db.meals.delete_one({"meal_id": {"$regex": f"^custom_"}, "food_name": {"$exists": True}, "user_id": user_id})
        return {"message": "Nutrition log deleted", "deleted_count": result.deleted_count}
    except Exception as e:
        logger.error(f"Error deleting nutrition log: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Grocery List endpoints
class GroceryItemRequest(BaseModel):
    user_id: str
    item: dict

@api_router.get("/meals/groceries/{user_id}")
async def get_grocery_list(user_id: str):
    """Get grocery list for a user"""
    try:
        items = await db.grocery_items.find({"user_id": user_id}).to_list(200)
        for item in items:
            item["_id"] = str(item["_id"])
        return {"items": items}
    except Exception as e:
        logger.error(f"Error getting grocery list: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/meals/groceries")
async def add_grocery_item(request: GroceryItemRequest):
    """Add a grocery item"""
    try:
        item = request.item
        item["user_id"] = request.user_id
        await db.grocery_items.insert_one(item)
        return {"message": "Item added", "item_id": item.get("id")}
    except Exception as e:
        logger.error(f"Error adding grocery item: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/meals/groceries/{item_id}/toggle")
async def toggle_grocery_item(item_id: str, user_id: str = Body(..., embed=True)):
    """Toggle grocery item checked status"""
    try:
        item = await db.grocery_items.find_one({"id": item_id, "user_id": user_id})
        if item:
            new_checked = not item.get("checked", False)
            await db.grocery_items.update_one(
                {"id": item_id, "user_id": user_id},
                {"$set": {"checked": new_checked}}
            )
        return {"message": "Item toggled"}
    except Exception as e:
        logger.error(f"Error toggling grocery item: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/meals/groceries/clear-checked")
async def clear_checked_groceries(user_id: str = Body(...), item_ids: List[str] = Body(...)):
    """Clear checked grocery items"""
    try:
        result = await db.grocery_items.delete_many({"user_id": user_id, "id": {"$in": item_ids}})
        return {"message": "Items cleared", "deleted": result.deleted_count}
    except Exception as e:
        logger.error(f"Error clearing groceries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# AI Grocery List Generator
class GroceryGenerateRequest(BaseModel):
    user_id: str
    meals: List[str]

@api_router.post("/meals/generate-groceries")
async def generate_grocery_list(request: GroceryGenerateRequest):
    """Generate AI grocery list from meal plan"""
    try:
        api_key = os.getenv("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        meals_text = "\n".join([f"- {meal}" for meal in request.meals])
        
        prompt = f"""Generate a grocery shopping list for these meals:
{meals_text}

Return a JSON array of grocery items. Each item should have:
- id: unique string like "grocery_1", "grocery_2" etc
- name: item name
- quantity: amount needed (e.g. "2 lbs", "1 dozen", "3 cups")
- category: one of "Produce", "Meat & Seafood", "Dairy", "Grains", "Canned Goods", "Spices", "Other"
- checked: false

Return ONLY the JSON array, no other text."""

        chat = LlmChat(
            api_key=api_key,
            session_id=f"grocery_gen_{datetime.utcnow().timestamp()}",
            system_message="You are a helpful meal planning assistant. Generate grocery lists based on meal plans."
        ).with_model("openai", "gpt-4o")
        response = await chat.send_message(UserMessage(text=prompt))
        
        # Parse JSON from response
        items = []
        try:
            # Clean up response
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("```")[1]
                if clean_response.startswith("json"):
                    clean_response = clean_response[4:]
            items = json.loads(clean_response)
        except:
            # Fallback parsing
            import re
            json_match = re.search(r'\[[\s\S]*\]', response)
            if json_match:
                items = json.loads(json_match.group())
        
        # Save to database
        for item in items:
            item["user_id"] = request.user_id
            await db.grocery_items.update_one(
                {"user_id": request.user_id, "name": item["name"]},
                {"$set": item},
                upsert=True
            )
        
        return {"items": items}
    except Exception as e:
        logger.error(f"Error generating groceries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Recipe endpoints
@api_router.get("/meals/recipes/{user_id}")
async def get_recipes(user_id: str):
    """Get saved recipes for a user"""
    try:
        recipes = await db.user_recipes.find({"user_id": user_id}).sort("created_at", -1).to_list(50)
        for recipe in recipes:
            recipe["_id"] = str(recipe["_id"])
        return {"recipes": recipes}
    except Exception as e:
        logger.error(f"Error getting recipes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class RecipeGenerateRequest(BaseModel):
    user_id: str
    prompt: str

@api_router.post("/meals/generate-recipe")
async def generate_recipe(request: RecipeGenerateRequest):
    """Generate an AI recipe based on user prompt"""
    try:
        api_key = os.getenv("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        prompt = f"""Create a healthy recipe based on this request: {request.prompt}

Return a JSON object with these exact fields:
- name: recipe name (string)
- image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600"
- calories: total calories (integer number only)
- protein: grams of protein (integer number only)
- carbs: grams of carbs (integer number only)
- fat: grams of fat (integer number only)
- prepTime: preparation time like "25 mins" (string)
- ingredients: array of ingredient strings with amounts
- instructions: array of step-by-step instruction strings
- category: one of "breakfast", "lunch", "dinner", "snack"

IMPORTANT: Return ONLY the raw JSON object. No markdown, no code blocks, no extra text."""

        chat = LlmChat(
            api_key=api_key,
            session_id=f"recipe_gen_{datetime.utcnow().timestamp()}",
            system_message="You are a helpful cooking assistant. Generate healthy recipes based on user requests."
        ).with_model("openai", "gpt-4o")
        response = await chat.send_message(UserMessage(text=prompt))
        
        # Parse JSON from response
        recipe = None
        try:
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("```")[1]
                if clean_response.startswith("json"):
                    clean_response = clean_response[4:]
            recipe = json.loads(clean_response)
        except:
            import re
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                recipe = json.loads(json_match.group())
        
        if not recipe:
            raise HTTPException(status_code=500, detail="Failed to generate recipe")
        
        # Add metadata and save
        recipe["id"] = f"recipe_{int(datetime.utcnow().timestamp() * 1000)}"
        recipe["user_id"] = request.user_id
        recipe["created_at"] = datetime.utcnow().isoformat()
        
        # Ensure image URL is valid
        if not recipe.get("image") or "unsplash" not in recipe.get("image", ""):
            recipe["image"] = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600"
        
        await db.user_recipes.insert_one(recipe)
        
        # Remove MongoDB _id before returning (it's not JSON serializable)
        recipe.pop("_id", None)
        
        return {"recipe": recipe}
    except Exception as e:
        logger.error(f"Error generating recipe: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/meals/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user_id: str):
    """Delete a saved recipe"""
    try:
        result = await db.user_recipes.delete_one({"id": recipe_id, "user_id": user_id})
        return {"message": "Recipe deleted", "deleted_count": result.deleted_count}
    except Exception as e:
        logger.error(f"Error deleting recipe: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AI NUTRITION COACH ENDPOINTS
# ============================================================================

class NutritionCoachChatRequest(BaseModel):
    user_id: str
    message: str
    conversation_history: list = []

@api_router.get("/nutrition-coach/conversation/{user_id}")
async def get_nutrition_coach_conversation(user_id: str):
    """Get nutrition coach conversation (auto-delete after 12 hours)"""
    try:
        # Delete conversations older than 12 hours
        cutoff_time = datetime.utcnow() - timedelta(hours=12)
        await db.nutrition_coach_conversations.delete_many({
            "user_id": user_id,
            "created_at": {"$lt": cutoff_time.isoformat()}
        })
        
        # Get current conversation
        conversation = await db.nutrition_coach_conversations.find_one(
            {"user_id": user_id},
            sort=[("created_at", -1)]
        )
        
        if conversation:
            conversation.pop("_id", None)
            return {"messages": conversation.get("messages", [])}
        return {"messages": []}
    except Exception as e:
        logger.error(f"Error getting nutrition coach conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/nutrition-coach/chat")
async def chat_with_nutrition_coach(request: NutritionCoachChatRequest):
    """Chat with AI nutrition coach - learns from user's meal history"""
    try:
        # Get user's recent meal history for context
        recent_meals = await db.meals.find({
            "user_id": request.user_id
        }).sort("timestamp", -1).limit(20).to_list(20)
        
        # Get user's planned meals
        planned_meals = await db.planned_meals.find({
            "user_id": request.user_id
        }).sort("date", -1).limit(10).to_list(10)
        
        # Get user profile for goals
        profile = await db.profiles.find_one({"user_id": request.user_id})
        
        # Build nutrition context
        meal_summary = []
        total_calories = 0
        total_protein = 0
        total_carbs = 0
        total_fat = 0
        
        for meal in recent_meals[:7]:  # Last 7 meals
            calories = meal.get("calories", 0)
            protein = meal.get("protein", 0)
            carbs = meal.get("carbs", 0)
            fat = meal.get("fat", 0)
            name = meal.get("food_name", meal.get("meal_name", "Unknown"))
            total_calories += calories
            total_protein += protein
            total_carbs += carbs
            total_fat += fat
            meal_summary.append(f"- {name}: {calories} cal, {protein}g protein")
        
        avg_calories = total_calories / max(len(recent_meals[:7]), 1)
        
        # Build conversation history for context
        history_text = "\n".join([
            f"{'User' if m.get('role') == 'user' else 'Coach'}: {m.get('content', '')}"
            for m in request.conversation_history[-6:]
        ])
        
        calorie_goal = profile.get("custom_calorie_goal", 2000) if profile else 2000
        fitness_goals = profile.get("fitness_goals", []) if profile else []
        
        system_prompt = f"""You are a friendly, knowledgeable AI Nutrition Coach for FitTrax+. Your role is to provide personalized nutrition advice based on the user's eating habits and goals.

USER'S NUTRITION PROFILE:
- Daily Calorie Goal: {calorie_goal} cal
- Fitness Goals: {', '.join(fitness_goals) if fitness_goals else 'Not specified'}
- Recent Average Calories: {avg_calories:.0f} cal/meal

USER'S RECENT MEALS:
{chr(10).join(meal_summary) if meal_summary else "No recent meals logged"}

GUIDELINES:
1. Be encouraging and supportive
2. Give specific, actionable advice
3. Reference their actual eating patterns when relevant
4. Keep responses concise (2-3 paragraphs max)
5. Use emojis sparingly for friendliness
6. If they ask about meal planning, consider their calorie goals
7. Suggest improvements based on their actual meal history

RECENT CONVERSATION:
{history_text if history_text else "This is the start of the conversation."}"""

        # Generate response using LLM
        emergent_key = os.getenv("EMERGENT_API_KEY") or os.getenv("EMERGENT_LLM_KEY")
        if not emergent_key:
            raise HTTPException(status_code=500, detail="API key not configured")
            
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"nutrition_coach_{datetime.utcnow().timestamp()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-4o")
        
        user_msg = UserMessage(text=f"User message: {request.message}")
        response = await chat.send_message(user_msg)
        response_text = response.strip() if isinstance(response, str) else str(response)
        
        # Save conversation to database
        new_messages = request.conversation_history + [
            {"id": f"msg_{int(datetime.utcnow().timestamp() * 1000)}", "role": "user", "content": request.message, "timestamp": datetime.utcnow().isoformat()},
            {"id": f"msg_{int(datetime.utcnow().timestamp() * 1000)}_assistant", "role": "assistant", "content": response_text, "timestamp": datetime.utcnow().isoformat()}
        ]
        
        await db.nutrition_coach_conversations.update_one(
            {"user_id": request.user_id},
            {
                "$set": {
                    "user_id": request.user_id,
                    "messages": new_messages,
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat()
                }
            },
            upsert=True
        )
        
        return {"response": response_text}
    except Exception as e:
        logger.error(f"Error in nutrition coach chat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/nutrition-coach/conversation/{user_id}")
async def delete_nutrition_coach_conversation(user_id: str):
    """Delete nutrition coach conversation"""
    try:
        result = await db.nutrition_coach_conversations.delete_many({"user_id": user_id})
        return {"message": "Conversation deleted", "deleted_count": result.deleted_count}
    except Exception as e:
        logger.error(f"Error deleting nutrition coach conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# MIDDLEWARE AND APP SETUP
# ============================================================================

# Include the router in the main app
app.include_router(api_router)

# Add CORS middleware with configuration-based origins
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORSConfig.ALLOWED_ORIGINS + [
        "https://workout-tracker-535.preview.emergentagent.com",  # Preview URL
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)

# Add request size limit middleware (10MB max)
app.add_middleware(RequestSizeLimitMiddleware, max_size=10 * 1024 * 1024)

# Add HTTPS redirect middleware (only enforces if ENFORCE_HTTPS=true)
app.add_middleware(HTTPSRedirectMiddleware)

@app.on_event("startup")
async def startup_event():
    """Run startup checks and initialize components"""
    # Log configuration checks
    log_startup_checks()
    
    # Setup audit log indexes
    await audit_storage.setup_indexes()
    
    # Create database indexes for multi-user performance
    try:
        # User-related indexes
        await db.users.create_index("user_id", unique=True, background=True)
        await db.users.create_index("email", unique=True, sparse=True, background=True)
        
        # Meals - for quick user lookups
        await db.meals.create_index([("user_id", 1), ("date", -1)], background=True)
        
        # Workouts - for user workout history
        await db.workouts.create_index([("user_id", 1), ("date", -1)], background=True)
        
        # Water intake - for daily/weekly tracking
        await db.water_intake.create_index([("user_id", 1), ("date", -1)], background=True)
        await db.water_intake.create_index("water_id", background=True)
        
        # Heart rate - for health data queries
        await db.heart_rate.create_index([("user_id", 1), ("timestamp", -1)], background=True)
        
        # Step tracking - for daily/weekly/monthly queries
        await db.step_data.create_index([("user_id", 1), ("date", -1)], background=True)
        
        # Gamification - for badges and challenges
        await db.user_badges.create_index([("user_id", 1), ("badge_id", 1)], background=True)
        await db.challenge_completions.create_index([("user_id", 1), ("challenge_id", 1)], background=True)
        
        # Weight training - for workout history
        await db.weight_training_sessions.create_index([("user_id", 1), ("date", -1)], background=True)
        
        logger.info("Database indexes created/verified successfully")
    except Exception as e:
        logger.warning(f"Error creating indexes (may already exist): {str(e)}")
    
    logger.info("FitTrax+ API started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    """Gracefully shutdown database connections"""
    logger.info("Shutting down FitTrax+ API...")
    client.close()
    logger.info("Database connection closed")

# Root endpoint for Kubernetes health probes
@app.get("/")
async def root():
    """Root endpoint for health checks"""
    return {"status": "healthy", "app": "FitTrax+ API", "version": "2.0"}

@app.get("/healthz")
async def healthz():
    """Kubernetes liveness probe endpoint"""
    return {"status": "ok"}

@app.get("/readyz")
async def readyz():
    """Kubernetes readiness probe endpoint"""
    try:
        # Quick database check
        await db.command("ping")
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "not ready", "error": str(e)}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
