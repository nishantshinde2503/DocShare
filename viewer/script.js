// Configuration
//const API_BASE = 'http://localhost:8000';
const API_BASE = 'https://docshare-75dr.onrender.com';
let customersData = {};
let selectedCustomer = null;
let currentPreviewIndex = null;
let viewedFiles = new Set(); // Track which files have been viewed

// Initialize
window.addEventListener('load', () => {
    const linkId = new URLSearchParams(window.location.search).get('id');
    if (!linkId) {
        showSidebarMessage('No link ID provided');
        return;
    }
    document.getElementById('linkId').textContent = linkId;
    loadFiles(linkId);
    
    // Load viewed files from localStorage
    const stored = localStorage.getItem(`viewed_files_${linkId}`);
    if (stored) {
        viewedFiles = new Set(JSON.parse(stored));
    }
});

// Refresh files
function refreshFiles() {
    const linkId = new URLSearchParams(window.location.search).get('id');
    if (linkId) {
        loadFiles(linkId);
    }
}

// Load files from API
async function loadFiles(linkId) {
    show('loading');
    hide('sidebarMessage');
    document.getElementById('customerList').innerHTML = '';
    
    try {
        const res = await fetch(`${API_BASE}/files/${linkId}`);
        const data = await res.json();
        
        hide('loading');
        
        if (!res.ok) {
            showSidebarMessage('Failed to load files');
            return;
        }
        
        if (data.expired) {
            showSidebarMessage('This link has expired');
            return;
        }
        
        if (!data.customers || Object.keys(data.customers).length === 0) {
            showSidebarMessage('No files found');
            return;
        }
        
        customersData = data.customers;
        document.getElementById('expiryDate').textContent = new Date(data.expires_at).toLocaleString();
        displayCustomerList();
    } catch (error) {
        hide('loading');
        showSidebarMessage('Error: ' + error.message);
    }
}

// Display customer list in sidebar
function displayCustomerList() {
    const container = document.getElementById('customerList');
    container.innerHTML = '';
    
    Object.keys(customersData).forEach(customerName => {
        const files = customersData[customerName];
        const expiryTime = new Date(files[0].customer_expires_at);
        const timeLeft = getTimeLeft(expiryTime);
        
        // Count unviewed files for this customer
        const unviewedCount = files.filter(f => !viewedFiles.has(f.id)).length;
        
        const customerItem = document.createElement('div');
        customerItem.className = `customer-item ${selectedCustomer === customerName ? 'active' : ''}`;
        customerItem.onclick = () => selectCustomer(customerName);
        
        const initials = getInitials(customerName);
        
        customerItem.innerHTML = `
            <div class="flex items-center gap-3 p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 transition-colors">
                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    ${initials}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-baseline mb-1">
                        <h3 class="font-semibold text-gray-900 truncate">${customerName}</h3>
                    </div>
                    <div class="flex justify-between items-center">
                        <p class="text-sm text-gray-600 truncate">
                            <i class="bi bi-file-earmark-text"></i> ${files.length} file${files.length > 1 ? 's' : ''}
                        </p>
                        ${unviewedCount > 0 ? `
                            <span class="bg-teal-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ml-2">
                                ${unviewedCount}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(customerItem);
    });
}

// Select a customer and show their files
function selectCustomer(customerName) {
    selectedCustomer = customerName;
    
    // Update customer list styling
    document.querySelectorAll('.customer-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // Hide default view
    hide('defaultView');
    
    // Show customer header and files
    show('customerHeader');
    show('filesContainer');
    
    // Update header
    const files = customersData[customerName];
    const initials = getInitials(customerName);
    const expiryTime = new Date(files[0].customer_expires_at);
    const timeLeft = getTimeLeft(expiryTime);
    
    document.getElementById('customerAvatar').textContent = initials;
    document.getElementById('selectedCustomerName').textContent = customerName;
    document.getElementById('fileCount').textContent = `${files.length} file${files.length > 1 ? 's' : ''}`;
    document.getElementById('customerTimeLeft').textContent = timeLeft;
    
    // Display files
    displayFiles(customerName);
}

// Display files for selected customer
function displayFiles(customerName) {
    const container = document.getElementById('filesGrid');
    const files = customersData[customerName];
    
    container.innerHTML = files.map((file, index) => {
        const isViewed = viewedFiles.has(file.id);
        
        return `
            <div class="file-card bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-all overflow-hidden">
                <div class="p-4">
                    <div class="flex items-start gap-3 mb-3">
                        <i class="bi ${getFileIcon(file.mimetype)} text-4xl text-teal-600 flex-shrink-0"></i>
                        <div class="flex-1 min-w-0">
                            <h6 class="font-semibold text-sm mb-1 truncate">
                                <a onclick="openPreview('${customerName}', ${index}); return false;" 
                                   class="file-name hover:text-teal-600 cursor-pointer ${isViewed ? 'text-gray-600' : 'text-gray-900 font-bold'}">
                                    ${file.filename}
                                </a>
                            </h6>
                            <p class="text-xs text-gray-500">${formatSize(file.size)}</p>
                            <p class="text-xs text-gray-400 mt-1">${formatDateTime(new Date(file.uploaded_at))}</p>
                        </div>
                        ${!isViewed ? `
                            <span class="bg-teal-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                                •
                            </span>
                        ` : ''}
                    </div>
                    <div class="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button onclick="download('${customerName}', ${index}); return false;" 
                                class="flex-1 text-sm bg-teal-600 text-white px-3 py-2 rounded-lg hover:bg-teal-700 transition flex items-center justify-center gap-2">
                            <i class="bi bi-download"></i>
                            <span>Download</span>
                        </button>
                        <button onclick="print('${customerName}', ${index}); return false;" 
                                class="flex-1 text-sm bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 transition flex items-center justify-center gap-2">
                            <i class="bi bi-printer"></i>
                            <span>Print</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Filter customers by search
function filterCustomers() {
    const search = document.getElementById('customerSearch').value.toLowerCase();
    const items = document.querySelectorAll('.customer-item');
    
    items.forEach(item => {
        const name = item.textContent.toLowerCase();
        if (name.includes(search)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Open preview modal
function openPreview(customerName, index) {
    const file = customersData[customerName][index];
    
    // Mark as viewed
    viewedFiles.add(file.id);
    saveViewedFiles();
    
    // Update UI
    displayCustomerList();
    if (selectedCustomer) {
        displayFiles(selectedCustomer);
    }
    
    currentPreviewIndex = index;
    selectedCustomer = customerName;
    
    document.getElementById('previewTitle').textContent = file.filename;
    document.getElementById('previewFrame').src = file.download_url;
    document.getElementById('previewModal').classList.remove('hidden');
    document.getElementById('previewModal').classList.add('flex');
}

// Close preview modal
function closePreview(event) {
    if (event && event.target !== event.currentTarget) return;
    
    document.getElementById('previewModal').classList.add('hidden');
    document.getElementById('previewModal').classList.remove('flex');
    document.getElementById('previewFrame').src = '';
}

// Download from preview
function downloadFromPreview() {
    if (selectedCustomer && currentPreviewIndex !== null) {
        download(selectedCustomer, currentPreviewIndex);
    }
}

// Print from preview
function printFromPreview() {
    if (selectedCustomer && currentPreviewIndex !== null) {
        print(selectedCustomer, currentPreviewIndex);
    }
}

// Download file
function download(customerName, index) {
    const file = customersData[customerName][index];
    
    // Mark as viewed
    viewedFiles.add(file.id);
    saveViewedFiles();
    
    fetch(file.download_url)
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = file.filename;
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);
            
            // Update UI
            displayCustomerList();
            if (selectedCustomer) {
                displayFiles(selectedCustomer);
            }
        })
        .catch(error => {
            console.error('Download failed:', error);
            window.open(file.download_url, '_blank');
        });
}

// Print file
function print(customerName, index) {
    const file = customersData[customerName][index];
    
    // Mark as viewed
    viewedFiles.add(file.id);
    saveViewedFiles();
    
    const printWindow = window.open(file.download_url, '_blank');
    
    if (printWindow) {
        printWindow.onload = function() {
            setTimeout(() => {
                printWindow.print();
            }, 500);
        };
    } else {
        alert('Please allow popups to use the print function');
    }
    
    // Update UI
    displayCustomerList();
    if (selectedCustomer) {
        displayFiles(selectedCustomer);
    }
}

// Save viewed files to localStorage
function saveViewedFiles() {
    const linkId = new URLSearchParams(window.location.search).get('id');
    localStorage.setItem(`viewed_files_${linkId}`, JSON.stringify([...viewedFiles]));
}

// Get initials from name
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Get time left until expiry
function getTimeLeft(expiryTime) {
    const now = new Date();
    const diff = expiryTime - now;
    
    if (diff <= 0) return 'Expired';
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

// Format time (e.g., "9:49 AM", "Yesterday", "Monday")
// Removed - no longer needed

// Format date and time
function formatDateTime(date) {
    return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
}

// Get file icon
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

// Format size
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Show/hide elements
function show(id) { 
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden'); 
}

function hide(id) { 
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden'); 
}

// Show sidebar message
function showSidebarMessage(text) {
    document.getElementById('sidebarMessageText').textContent = text;
    show('sidebarMessage');
    hide('customerList');
}

// Close preview on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
});