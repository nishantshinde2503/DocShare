// Configuration
//const API_BASE = 'http://localhost:8000';
const API_BASE = 'https://docshare-75dr.onrender.com';
let selectedFiles = [];
let linkId = null;

// Generate session ID for this user/browser session
let sessionId = localStorage.getItem('uploadSessionId');
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('uploadSessionId', sessionId);
}

// Initialize
window.addEventListener('load', () => {
    linkId = new URLSearchParams(window.location.search).get('id') || generateLinkId();
    updateURL();
    
    // Prevent zoom on double tap for iOS
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
});

// Generate random link ID
function generateLinkId() {
    return Math.random().toString(36).substring(2, 10);
}

// Update URL without reload
function updateURL() {
    window.history.replaceState({}, '', `?id=${linkId}`);
}

// File input handler
document.getElementById('fileInput').addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// Upload area click/tap
document.getElementById('uploadArea').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

// Drag and drop (desktop)
const uploadArea = document.getElementById('uploadArea');
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

// Handle files
function handleFiles(files) {
    if (files.length === 0) return;
    
    selectedFiles = Array.from(files);
    displayFiles();
    document.getElementById('uploadBtn').disabled = selectedFiles.length === 0;
    
    // Scroll to files list on mobile
    if (window.innerWidth < 768) {
        setTimeout(() => {
            document.getElementById('filesList').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
}

// Display files
function displayFiles() {
    const list = document.getElementById('filesList');
    if (selectedFiles.length === 0) {
        list.innerHTML = '';
        return;
    }
    
    list.innerHTML = selectedFiles.map((file, i) => `
        <div class="file-item">
            <span class="flex items-center gap-2 flex-1 min-w-0">
                <i class="bi ${getFileIcon(file.type)} text-teal-600 text-xl flex-shrink-0"></i>
                <span class="truncate">
                    <span class="font-semibold block text-sm">${file.name}</span>
                    <span class="text-xs text-gray-500">${formatSize(file.size)}</span>
                </span>
            </span>
            <button onclick="removeFile(${i}); return false;" 
                    class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition flex-shrink-0"
                    aria-label="Remove file">
                <i class="bi bi-x-lg text-xl"></i>
            </button>
        </div>
    `).join('');
}

// Remove file
function removeFile(index) {
    selectedFiles.splice(index, 1);
    displayFiles();
    document.getElementById('uploadBtn').disabled = selectedFiles.length === 0;
    
    // Show success message if present
    const successEl = document.getElementById('success');
    if (!successEl.classList.contains('hidden')) {
        successEl.classList.add('hidden');
    }
}

// Get file icon based on type
function getFileIcon(mimetype) {
    if (!mimetype) return 'bi-file-earmark';
    if (mimetype.includes('pdf')) return 'bi-file-earmark-pdf-fill';
    if (mimetype.includes('image')) return 'bi-file-earmark-image-fill';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'bi-file-earmark-word-fill';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return 'bi-file-earmark-excel-fill';
    if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return 'bi-file-earmark-ppt-fill';
    if (mimetype.includes('text')) return 'bi-file-earmark-text-fill';
    if (mimetype.includes('zip') || mimetype.includes('compressed')) return 'bi-file-earmark-zip-fill';
    return 'bi-file-earmark-fill';
}

// Format file size
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Upload files
async function uploadFiles() {
    if (selectedFiles.length === 0) return;
    
    const formData = new FormData();
    const uploadBtn = document.getElementById('uploadBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // Customer name input (optional)
    const customerName = document.getElementById('customerName')?.value.trim() || "";
    formData.append('customer_name', customerName);

    // Include session ID for folder tracking
    formData.append('session_id', sessionId);

    // Add selected files
    selectedFiles.forEach(file => formData.append('files', file));
    
    // Disable upload button and show progress
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="bi bi-hourglass-split animate-spin"></i><span>Uploading...</span>';
    progressContainer.classList.remove('hidden');
    
    // Simulate progress for better UX
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 90) progress = 90;
        progressBar.style.width = progress + '%';
        progressText.textContent = Math.round(progress) + '%';
    }, 200);
    
    try {
        const res = await fetch(`${API_BASE}/upload/${linkId}`, {
            method: 'POST',
            body: formData
        });
        
        clearInterval(progressInterval);
        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        
        const data = await res.json();
        
        if (res.ok) {
            // Save session_id returned by backend
            if (data.session_id) {
                sessionId = data.session_id;
                localStorage.setItem('uploadSessionId', sessionId);
            }

            const viewerUrl = window.location.href.replace('uploader', 'viewer');
            
            // Show success message
            document.getElementById('success').innerHTML = `
                <div class="success-box">
                    <h5 class="font-bold text-green-800 mb-3 flex items-center gap-2">
                        <i class="bi bi-check-circle-fill text-2xl"></i>
                        <span>Upload Successful!</span>
                    </h5>
                    <p class="text-green-700 mb-3">
                        ${data.files_uploaded} file${data.files_uploaded > 1 ? 's' : ''} uploaded successfully
                    </p>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <input type="text" value="${viewerUrl}" 
                               class="flex-1 px-3 py-2 border-2 border-green-300 rounded-lg bg-white text-sm" 
                               readonly id="shareUrl">
                        <button onclick="copyToClipboard(); return false;" 
                                class="copy-btn flex items-center justify-center gap-2">
                            <i class="bi bi-clipboard"></i>
                            <span>Copy Link</span>
                        </button>
                    </div>
                    <p class="text-xs text-green-600 mt-3">
                        <i class="bi bi-info-circle"></i> Share this link to view documents
                    </p>
                </div>
            `;
            document.getElementById('success').classList.remove('hidden');

            // Clear files
            selectedFiles = [];
            displayFiles();
            document.getElementById('customerName').value = '';
            
            // Scroll to success message on mobile
            if (window.innerWidth < 768) {
                setTimeout(() => {
                    document.getElementById('success').scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
            
            // Hide progress after animation
            setTimeout(() => {
                progressContainer.classList.add('hidden');
                progressBar.style.width = '0%';
                progressText.textContent = '0%';
            }, 1500);
            
        } else {
            throw new Error(data.detail || 'Upload failed');
        }
    } catch (error) {
        clearInterval(progressInterval);
        progressContainer.classList.add('hidden');
        
        // Show error
        alert('Upload failed: ' + error.message);
        console.error('Upload error:', error);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-upload"></i><span>Upload Files</span>';
    }
}

// Copy to clipboard with feedback
function copyToClipboard() {
    const shareUrl = document.getElementById('shareUrl');
    shareUrl.select();
    shareUrl.setSelectionRange(0, 99999); // For mobile
    
    navigator.clipboard.writeText(shareUrl.value).then(() => {
        const btn = event.target.closest('button');
        const originalHTML = btn.innerHTML;
        
        btn.innerHTML = '<i class="bi bi-check-lg"></i><span>Copied!</span>';
        btn.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
        
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '';
        }, 2000);
    }).catch(err => {
        // Fallback for older browsers
        shareUrl.focus();
        shareUrl.select();
        try {
            document.execCommand('copy');
            alert('Link copied to clipboard!');
        } catch (e) {
            alert('Please manually copy the link');
        }
    });
}

// Prevent form submission on enter
document.getElementById('customerName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('uploadArea').click();
    }
});

// Handle visibility change (tab switching)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Refresh when user returns to tab
        const btn = document.getElementById('uploadBtn');
        if (!btn.disabled && selectedFiles.length > 0) {
            displayFiles();
        }
    }
});