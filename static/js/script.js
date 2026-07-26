// DOM Elements
const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const videoSection = document.getElementById('videoSection');
const loadingState = document.getElementById('loadingState');
const alertContainer = document.getElementById('alertContainer');
const downloadSection = document.getElementById('downloadSection');
const successSection = document.getElementById('successSection');

let selectedFormat = null;
let currentVideoUrl = null;

// Event Listeners
fetchBtn.addEventListener('click', fetchVideo);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchVideo();
});

// Fetch Video Information
async function fetchVideo() {
    const url = urlInput.value.trim();
    
    if (!url) {
        showAlert('Please enter a YouTube URL', 'error');
        return;
    }

    showLoading(true);
    clearAlerts();

    try {
        console.log('Fetching video from:', url);
        const response = await fetch('/api/video-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch video');
        }

        const videoData = await response.json();
        console.log('Video data received:', videoData);
        
        currentVideoUrl = videoData.url;
        displayVideoInfo(videoData);
        showAlert('✓ Video loaded successfully!', 'success');

    } catch (error) {
        console.error('Error:', error);
        showAlert(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Display Video Information
function displayVideoInfo(data) {
    console.log('Displaying video info...');
    
    // Thumbnail and Duration
    document.getElementById('videoThumbnail').src = data.thumbnail;
    document.getElementById('duration').textContent = formatDuration(data.duration);

    // Title and Metadata
    document.getElementById('videoTitle').textContent = data.title;
    document.getElementById('videoChannel').textContent = data.uploader;
    document.getElementById('videoViews').textContent = `${data.view_count} views`;
    document.getElementById('videoDate').textContent = formatDate(data.upload_date);

    // Description
    const descElement = document.getElementById('videoDescription');
    descElement.textContent = data.description || 'No description available';

    // Formats
    console.log('Formats available:', data.formats);
    displayFormats(data.formats);

    // Show video section
    videoSection.classList.remove('hidden');
    console.log('Video section now visible');
}

// Display Available Formats
function displayFormats(formats) {
    const audioContainer = document.getElementById('audioFormats');
    const videoContainer = document.getElementById('videoFormats');

    console.log('Clearing format containers...');
    audioContainer.innerHTML = '';
    videoContainer.innerHTML = '';

    console.log('Audio formats:', formats.audio);
    console.log('Video formats:', formats.video);

    // Audio Formats
    if (formats.audio && formats.audio.length > 0) {
        formats.audio.forEach(format => {
            const card = createFormatCard(format);
            audioContainer.appendChild(card);
        });
    }

    // Video Formats
    if (formats.video && formats.video.length > 0) {
        formats.video.forEach(format => {
            const card = createFormatCard(format);
            videoContainer.appendChild(card);
        });
    }

    // Select first format by default
    const firstCard = audioContainer.querySelector('.format-card') || 
                      videoContainer.querySelector('.format-card');
    if (firstCard) {
        console.log('Selecting first format card');
        selectFormat(firstCard);
    } else {
        console.error('No format cards found!');
    }
}

// Create Format Card
function createFormatCard(format) {
    const card = document.createElement('div');
    card.className = 'format-card';
    card.innerHTML = `
        <div class="format-card-icon">${format.type === 'audio' ? '🎵' : '🎬'}</div>
        <div class="format-card-name">${format.name}</div>
        <div class="format-card-info">${format.id}</div>
    `;

    card.addEventListener('click', () => {
        console.log('Format card clicked:', format.id);
        selectFormat(card, format.id);
    });

    return card;
}

// Select Format
function selectFormat(card, formatId) {
    console.log('Selecting format:', formatId);
    
    // Remove previous selection
    document.querySelectorAll('.format-card').forEach(c => {
        c.classList.remove('selected');
    });

    // Add selection to clicked card
    card.classList.add('selected');
    selectedFormat = formatId || card.querySelector('.format-card-info').textContent;
    
    console.log('Format selected:', selectedFormat);
}

// Download Video
document.getElementById('downloadBtn').addEventListener('click', downloadVideo);

async function downloadVideo() {
    console.log('Download button clicked');
    console.log('Selected format:', selectedFormat);
    console.log('Current video URL:', currentVideoUrl);
    
    if (!selectedFormat) {
        showAlert('Please select a format', 'error');
        return;
    }

    if (!currentVideoUrl) {
        showAlert('Please fetch a video first', 'error');
        return;
    }

    try {
        // Hide video section
        videoSection.classList.add('hidden');
        downloadSection.classList.remove('hidden');
        successSection.classList.add('hidden');

        console.log('Starting download with format:', selectedFormat);

        // Start download
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: currentVideoUrl,
                format: selectedFormat
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Download failed');
        }

        const result = await response.json();
        console.log('Download started:', result);

        // Monitor progress
        monitorProgress();

    } catch (error) {
        console.error('Download error:', error);
        showAlert(error.message, 'error');
        downloadSection.classList.add('hidden');
        videoSection.classList.remove('hidden');
    }
}

// Monitor Download Progress
async function monitorProgress() {
    console.log('Starting progress monitoring...');
    let isComplete = false;

    while (!isComplete) {
        try {
            const response = await fetch('/api/progress');
            const progress = await response.json();

            console.log('Progress update:', progress);

            // Update UI
            updateProgressUI(progress);

            if (progress.status === 'completed') {
                isComplete = true;
                showDownloadSuccess(progress);
            } else if (progress.status === 'error') {
                isComplete = true;
                showAlert(`Download error: ${progress.error}`, 'error');
                downloadSection.classList.add('hidden');
                videoSection.classList.remove('hidden');
            }

        } catch (error) {
            console.error('Progress monitoring error:', error);
        }

        if (!isComplete) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

// Update Progress UI
function updateProgressUI(progress) {
    const percentage = progress.percentage || 0;
    const totalMB = progress.total ? (progress.total / (1024 * 1024)).toFixed(2) : '?';
    const downloadedMB = progress.downloaded ? (progress.downloaded / (1024 * 1024)).toFixed(2) : '0';

    document.getElementById('progressPercent').textContent = `${percentage}%`;
    document.getElementById('progressFill').style.width = `${percentage}%`;
    document.getElementById('downloadSpeed').textContent = progress.speed || '-';
    document.getElementById('downloadEta').textContent = progress.eta || '-';
    document.getElementById('downloadedSize').textContent = `${downloadedMB} MB / ${totalMB} MB`;
    document.getElementById('downloadStatus').textContent = progress.status === 'downloading' 
        ? 'Downloading...' 
        : 'Processing...';
}

// Show Download Success
function showDownloadSuccess(progress) {
    downloadSection.classList.add('hidden');
    successSection.classList.remove('hidden');

    const fileName = progress.filename || 'video file';
    
    document.getElementById('successMessage').textContent = 
        `Your file "${fileName}" has been successfully downloaded!`;
}

// Reset Download
document.getElementById('resetBtn').addEventListener('click', () => {
    console.log('Reset button clicked');
    urlInput.value = '';
    videoSection.classList.add('hidden');
    downloadSection.classList.add('hidden');
    successSection.classList.add('hidden');
    selectedFormat = null;
    currentVideoUrl = null;
    clearAlerts();
});

document.getElementById('newDownloadBtn').addEventListener('click', () => {
    console.log('New download button clicked');
    urlInput.value = '';
    videoSection.classList.add('hidden');
    downloadSection.classList.add('hidden');
    successSection.classList.add('hidden');
    selectedFormat = null;
    currentVideoUrl = null;
    clearAlerts();
    urlInput.focus();
});

// Cancel Download
document.getElementById('cancelBtn').addEventListener('click', () => {
    console.log('Cancel button clicked');
    downloadSection.classList.add('hidden');
    videoSection.classList.remove('hidden');
    showAlert('Download cancelled', 'error');
});

// Show/Hide Loading State
function showLoading(show) {
    loadingState.classList.toggle('hidden', !show);
    fetchBtn.disabled = show;
}

// Show Alert
function showAlert(message, type = 'error') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <span class="alert-icon">${type === 'error' ? '❌' : '✓'}</span>
        <span>${message}</span>
        <button class="alert-close">×</button>
    `;

    alert.querySelector('.alert-close').addEventListener('click', () => {
        alert.remove();
    });

    alertContainer.appendChild(alert);

    // Auto-remove after 5 seconds
    setTimeout(() => alert.remove(), 5000);
}

// Clear Alerts
function clearAlerts() {
    alertContainer.innerHTML = '';
}

// Format Duration
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// Format Date
function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded - initializing...');
    urlInput.focus();
});
