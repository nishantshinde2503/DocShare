from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase_utils import (
    get_supabase_client, create_link_if_not_exists, 
    get_link, upload_file, save_file_metadata, 
    get_files_for_link, get_signed_url, delete_expired_customers,
    get_active_customer_folder_by_session_and_name, get_next_customer_number
)

# Load environment variables
load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LINK_EXPIRY_DAYS = 7
CUSTOMER_EXPIRY_MINUTES = 10
BUCKET_NAME = "links"

@app.get("/")
def root():
    return {"status": "ok", "service": "Document Sharing API"}

# -----------------------------
# Upload Endpoint
# -----------------------------
@app.post("/upload/{link_id}")
async def upload_files(
    link_id: str,
    customer_name: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    if not files or not link_id or len(link_id) < 3:
        raise HTTPException(400, "Invalid request - link_id and files required")

    supabase = get_supabase_client()

    # Create or get link
    expires_at = datetime.now(timezone.utc) + timedelta(days=LINK_EXPIRY_DAYS)
    link = create_link_if_not_exists(supabase, link_id, expires_at)

    link_expires = datetime.fromisoformat(link['expires_at'].replace('Z', '+00:00'))
    if link_expires < datetime.now(timezone.utc):
        raise HTTPException(410, "Link expired")

    # Determine safe customer name / folder
    safe_name = customer_name.strip() if customer_name else None
    if not safe_name:
        safe_name = get_next_customer_number(supabase, link_id)

    folder_name = None
    if session_id:
        folder_name = get_active_customer_folder_by_session_and_name(
            supabase, link_id, session_id, safe_name
        )
    if not folder_name:
        folder_name = safe_name

    # Customer expiry
    customer_expires_at = datetime.now(timezone.utc) + timedelta(minutes=CUSTOMER_EXPIRY_MINUTES)

    uploaded = []
    import time
    import uuid
    # generate a new session_id if not provided
    session_id = session_id or str(uuid.uuid4())

    for file in files:
        content = await file.read()
        timestamp = int(time.time())
        # Storage filename is unique
        unique_filename = f"{timestamp}_{file.filename}"
        path = f"{link_id}/{folder_name}/{unique_filename}"

        # Upload to storage
        upload_file(supabase, BUCKET_NAME, path, content, file.content_type or "application/octet-stream")

        # Save metadata: original filename for UI, path for signed URL
        file_record = save_file_metadata(
            supabase, link_id, safe_name, file.filename, path,
            file.content_type or "application/octet-stream", len(content),
            customer_expires_at, session_id=session_id
        )

        uploaded.append({"id": file_record['id'], "filename": file.filename})

    return {
        "link_id": link_id,
        "customer_name": safe_name,
        "folder_name": folder_name,
        "files_uploaded": len(uploaded),
        "files": uploaded,
        "expires_at": link['expires_at'],
        "customer_expires_at": customer_expires_at.isoformat(),
        "session_id": session_id
    }

# -----------------------------
# Viewer Endpoint
# -----------------------------
@app.get("/files/{link_id}")
def get_files(link_id: str):
    supabase = get_supabase_client()
    delete_expired_customers(supabase, BUCKET_NAME)

    link = get_link(supabase, link_id)
    if not link:
        raise HTTPException(404, "Link not found")

    expires_at = datetime.fromisoformat(link['expires_at'].replace('Z', '+00:00'))
    if expires_at < datetime.now(timezone.utc):
        return {"link_id": link_id, "expired": True}

    files = get_files_for_link(supabase, link_id)
    customers = {}

    for file in files:
        customer = file['customer_name']
        if customer not in customers:
            customers[customer] = []

        # Use the actual storage path for signed URL
        url = get_signed_url(supabase, BUCKET_NAME, file['path'])
        customers[customer].append({
            "id": file['id'],
            "filename": file['filename'],   # original filename for display
            "size": file['size'],
            "mimetype": file['mimetype'],
            "uploaded_at": file['uploaded_at'],
            "customer_expires_at": file['customer_expires_at'],
            "download_url": url
        })

    return {
        "link_id": link_id,
        "expired": False,
        "expires_at": link['expires_at'],
        "customers": customers
    }
