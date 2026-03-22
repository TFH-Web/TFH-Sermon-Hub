from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from pydantic import BaseModel
from typing import List, Optional
import uuid
import os

# --- AI processing placeholder ---
def process_sermon_ai(file_path: str):
    # Integrate OpenAI/Claude/Local LLM here
    return {
        "transcript": "Generated transcript text...",
        "summary": "Generated summary...",
        "tags": ["faith", "grace", "purpose"]
    }

# --- Models ---
class Sermon(BaseModel):
    id: str
    title: str
    speaker: str
    series: Optional[str] = None
    date: Optional[str] = None
    video_link: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[List[str]] = []

# --- App setup ---
app = FastAPI()

# CORS for frontend JS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update to your frontend URL in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (JS, CSS, images)
app.mount("/static", StaticFiles(directory="."), name="static")

# Templates folder
templates = Jinja2Templates(directory="templates")

# In-memory DB (replace with real DB in production)
sermons_db = {}

# --- Routes ---

# Serve the portal prototype HTML
@app.get("/")
def portal(request: Request):
    return templates.TemplateResponse("Portal Prototype.html", {"request": request})

# Upload sermon
@app.post("/upload-sermon")
async def upload_sermon(
    title: str = Form(...),
    speaker: str = Form(...),
    series: Optional[str] = Form(None),
    date: Optional[str] = Form(None),
    video_link: Optional[str] = Form(None),
    file: UploadFile = File(None),
    auto_ai: bool = Form(True)
):
    sermon_id = str(uuid.uuid4())
    file_path = None

    if file:
        upload_dir = "uploads"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, f"{sermon_id}_{file.filename}")
        with open(file_path, "wb") as f:
            f.write(await file.read())

    transcript, summary, tags = None, None, []

    if auto_ai and file_path:
        ai_result = process_sermon_ai(file_path)
        transcript = ai_result["transcript"]
        summary = ai_result["summary"]
        tags = ai_result["tags"]

    sermon = Sermon(
        id=sermon_id,
        title=title,
        speaker=speaker,
        series=series,
        date=date,
        video_link=video_link,
        transcript=transcript,
        summary=summary,
        tags=tags
    )

    sermons_db[sermon_id] = sermon
    return JSONResponse({"status": "ok", "sermon": sermon.dict()})

# Get all sermons
@app.get("/sermons", response_model=List[Sermon])
async def get_sermons():
    return list(sermons_db.values())

# Get single sermon by ID
@app.get("/sermon/{sermon_id}", response_model=Sermon)
async def get_sermon(sermon_id: str):
    sermon = sermons_db.get(sermon_id)
    if not sermon:
        raise HTTPException(status_code=404, detail="Sermon not found")
    return sermon

# Delete sermon
@app.delete("/sermon/{sermon_id}")
async def delete_sermon(sermon_id: str):
    if sermon_id in sermons_db:
        del sermons_db[sermon_id]
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Sermon not found")