import os
from supabase import create_client, Client
from datetime import datetime
from typing import Optional
import time

# -----------------------------
# Supabase Client
# -----------------------------
def get_supabase_client() -> Client:
    """Initialize Supabase client"""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY required")
    return create_client(url, key)

# -----------------------------
# Link Helpers
# -----------------------------
def create_link_if_not_exists(supabase: Client, link_id: str, expires_at: datetime):
    """Create link or return existing"""
    result = supabase.table('links').select('*').eq('id', link_id).execute()
    if result.data:
        return result.data[0]
    link_data = {'id': link_id, 'expires_at': expires_at.isoformat()}
    result = supabase.table('links').insert(link_data).execute()
    return result.data[0]

def get_link(supabase: Client, link_id: str):
    """Get link by ID"""
    result = supabase.table('links').select('*').eq('id', link_id).execute()
    return result.data[0] if result.data else None

# -----------------------------
# File Storage Helpers
# -----------------------------
def upload_file(supabase: Client, bucket: str, path: str, content: bytes, content_type: str):
    """Upload file to storage. Make filenames unique to avoid duplicates."""
    options = {'content-type': content_type} if content_type else {}
    return supabase.storage.from_(bucket).upload(path, content, file_options=options)

def save_file_metadata(
    supabase: Client, link_id: str, customer_name: str, 
    filename: str, path: str, mimetype: str, size: int, 
    customer_expires_at, session_id: Optional[str] = None
):
    """Save file metadata with session_id"""
    file_data = {
        'link_id': link_id,
        'customer_name': customer_name,
        'filename': filename,
        'path': path,
        'mimetype': mimetype,
        'size': size,
        'customer_expires_at': customer_expires_at.isoformat(),
        'uploaded_at': datetime.utcnow().isoformat(),
        'session_id': session_id
    }
    result = supabase.table('files').insert(file_data).execute()
    return result.data[0]

def get_files_for_link(supabase: Client, link_id: str):
    """Get all files for a link"""
    result = supabase.table('files').select('*').eq('link_id', link_id).order('uploaded_at', desc=True).execute()
    return result.data

def get_signed_url(supabase: Client, bucket: str, path: str, expires_in: int = 3600):
    """Generate signed download URL"""
    result = supabase.storage.from_(bucket).create_signed_url(path, expires_in)
    return result['signedURL']

# -------------------------------
# Get next sequential customer number
# -------------------------------
def get_next_customer_number(supabase: Client, link_id: str) -> str:
    """
    Returns a folder name like 'customer-1', 'customer-2' for anonymous customers
    """
    result = supabase.table('files').select('customer_name').eq('link_id', link_id).execute()
    existing = [f['customer_name'] for f in result.data] if result.data else []
    
    i = 1
    while True:
        name = f"customer-{i}"
        if name not in existing:
            return name
        i += 1

# -------------------------------
# Get active folder for same session and customer_name
# -------------------------------
def get_active_customer_folder_by_session_and_name(
    supabase: Client, link_id: str, session_id: str, customer_name: str
) -> Optional[str]:
    """
    Returns the folder name if a previous upload exists for the same session + customer_name
    """
    result = supabase.table('files') \
        .select('customer_name') \
        .eq('link_id', link_id) \
        .eq('session_id', session_id) \
        .eq('customer_name', customer_name) \
        .order('uploaded_at', desc=True) \
        .limit(1) \
        .execute()

    if result.data and len(result.data) > 0:
        return result.data[0]['customer_name']
    return None

# -----------------------------
# Cleanup expired customers
# -----------------------------
def delete_expired_customers(supabase: Client, bucket: str):
    """
    Delete all customer folders that have expired.
    Runs on every API call to clean up storage and metadata.
    """
    now = datetime.utcnow().isoformat()
    
    # 1️⃣ Get expired files
    result = supabase.table('files') \
        .select('id, path') \
        .lt('customer_expires_at', now) \
        .execute()
    
    expired_files = result.data if result.data else []
    
    # 2️⃣ Delete from storage
    for f in expired_files:
        try:
            supabase.storage.from_(bucket).remove([f['path']])
        except Exception as e:
            print(f"Error deleting file {f['path']}: {e}")
    
    # 3️⃣ Delete from database
    if expired_files:
        ids = [f['id'] for f in expired_files]
        supabase.table('files').delete().in_('id', ids).execute()
