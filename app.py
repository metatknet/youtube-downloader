from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import yt_dlp
import os
from datetime import datetime
import threading
import logging
import subprocess
import sys
import re

app = Flask(__name__)
CORS(app)

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
DOWNLOAD_FOLDER = os.path.join(os.path.expanduser("~"), "Downloads", "YouTubeDownloads")
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

download_progress = {}
download_lock = threading.Lock()

def check_ffmpeg():
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True, timeout=5)
        logger.info("✓ FFmpeg is available")
        return True
    except:
        logger.warning("✗ FFmpeg not found")
        return False

ffmpeg_available = check_ffmpeg()

def extract_video_id(url):
    """Extract video ID from various YouTube URL formats"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/)([0-9A-Za-z_-]{11})',  # Standard URLs
        r'youtube\.com\/watch\?v=([0-9A-Za-z_-]{11})',  # youtube.com format
        r'youtu\.be\/([0-9A-Za-z_-]{11})',  # youtu.be format
        r'youtube\.com\/shorts\/([0-9A-Za-z_-]{11})',  # Shorts
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            video_id = match.group(1)
            logger.info(f"Extracted video ID: {video_id}")
            return video_id
    
    return None

def clean_youtube_url(url):
    """Convert any YouTube URL to clean format"""
    url = url.strip()
    
    # Extract video ID
    video_id = extract_video_id(url)
    
    if video_id:
        clean_url = f"https://www.youtube.com/watch?v={video_id}"
        logger.info(f"Cleaned URL: {url} -> {clean_url}")
        return clean_url
    
    return url

def progress_hook(d):
    """Update download progress"""
    with download_lock:
        try:
            if d['status'] == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                downloaded = d.get('downloaded_bytes', 0)
                
                if total > 0:
                    percentage = int((downloaded / total) * 100)
                    download_progress.update({
                        'status': 'downloading',
                        'percentage': percentage,
                        'downloaded': downloaded,
                        'total': total,
                        'speed': d.get('_speed_str', 'N/A'),
                        'eta': d.get('_eta_str', 'N/A'),
                    })
                    logger.debug(f"Download progress: {percentage}%")
            
            elif d['status'] == 'finished':
                download_progress['status'] = 'finished'
                download_progress['percentage'] = 100
                logger.info("Download finished!")
                
        except Exception as e:
            logger.error(f"Progress hook error: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/video-info', methods=['POST'])
def get_video_info():
    """Fetch video information"""
    try:
        url = request.json.get('url', '').strip()
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        if 'youtube.com' not in url and 'youtu.be' not in url:
            return jsonify({'error': 'Invalid YouTube URL'}), 400
        
        # Clean the URL - remove unnecessary parameters
        clean_url = clean_youtube_url(url)
        
        logger.info(f"Fetching: {clean_url}")
        
        ydl_opts = {
            'quiet': False,
            'no_warnings': False,
            'socket_timeout': 30,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(clean_url, download=False)
        
        video_data = {
            'title': info.get('title', 'Unknown'),
            'url': clean_url,  # Return cleaned URL
            'thumbnail': info.get('thumbnail', ''),
            'duration': info.get('duration', 0),
            'uploader': info.get('uploader', 'Unknown'),
            'view_count': f"{info.get('view_count', 0):,}",
            'upload_date': info.get('upload_date', ''),
            'description': (info.get('description', '') or '')[:300],
            'formats': {
                'audio': [
                    {'id': 'mp4_audio', 'name': 'M4A Audio', 'type': 'audio'},
                    {'id': 'mp3', 'name': 'MP3 Audio (requires FFmpeg)', 'type': 'audio'},
                ] if ffmpeg_available else [
                    {'id': 'mp4_audio', 'name': 'M4A Audio', 'type': 'audio'},
                ],
                'video': [
                    {'id': 'mp4_best', 'name': 'MP4 (Best)', 'type': 'video'},
                    {'id': 'mp4_720p', 'name': 'MP4 (720p)', 'type': 'video'},
                    {'id': 'mp4_480p', 'name': 'MP4 (480p)', 'type': 'video'},
                    {'id': 'mp4_360p', 'name': 'MP4 (360p)', 'type': 'video'},
                ]
            }
        }
        
        logger.info(f"✓ Successfully loaded: {video_data['title']}")
        return jsonify(video_data), 200
        
    except Exception as e:
        error = str(e)
        logger.error(f"Error fetching video: {error}")
        return jsonify({'error': f'Failed to fetch video: {error}'}), 500

@app.route('/api/download', methods=['POST'])
def start_download():
    """Start downloading video"""
    try:
        data = request.json
        url = data.get('url', '').strip()
        format_id = data.get('format', 'mp4_best')
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Clean the URL
        url = clean_youtube_url(url)
        
        logger.info(f"Starting download: {url} | Format: {format_id}")
        
        # Reset progress
        with download_lock:
            download_progress.clear()
            download_progress['status'] = 'starting'
        
        # Create directory
        download_dir = os.path.join(DOWNLOAD_FOLDER, datetime.now().strftime('%Y-%m-%d'))
        os.makedirs(download_dir, exist_ok=True)
        
        # Format options
        format_specs = {
            'mp4_best': 'best[ext=mp4]/best',
            'mp4_720p': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
            'mp4_480p': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
            'mp4_360p': 'bestvideo[height<=360]+bestaudio/best[height<=360]',
            'mp4_audio': 'bestaudio[ext=m4a]/bestaudio',
            'mp3': 'bestaudio/best',
        }
        
        format_spec = format_specs.get(format_id, 'best')
        
        ydl_opts = {
            'format': format_spec,
            'outtmpl': os.path.join(download_dir, '%(title)s.%(ext)s'),
            'progress_hooks': [progress_hook],
            'quiet': False,
            'no_warnings': False,
            'socket_timeout': 30,
            'retries': 5,
            'fragment_retries': 5,
        }
        
        # Add post-processor for MP3
        if format_id == 'mp3' and ffmpeg_available:
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }]
        
        def download_task():
            try:
                logger.info(f"YDL options: format={format_spec}")
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    logger.info("Downloading...")
                    info = ydl.extract_info(url, download=True)
                    filename = ydl.prepare_filename(info)
                    logger.info(f"✓ Download complete: {filename}")
                    
                    with download_lock:
                        download_progress['status'] = 'completed'
                        download_progress['percentage'] = 100
                        download_progress['filename'] = os.path.basename(filename)
                        
            except Exception as e:
                error = str(e)
                logger.error(f"✗ Download failed: {error}")
                with download_lock:
                    download_progress['status'] = 'error'
                    download_progress['error'] = error
        
        # Start background thread
        thread = threading.Thread(target=download_task, daemon=True)
        thread.start()
        
        return jsonify({'message': 'Download started', 'status': 'started'}), 200
        
    except Exception as e:
        error = str(e)
        logger.error(f"Error starting download: {error}")
        return jsonify({'error': error}), 500

@app.route('/api/progress', methods=['GET'])
def get_progress():
    """Get download progress"""
    with download_lock:
        return jsonify(dict(download_progress)), 200

@app.route('/api/system-info', methods=['GET'])
def system_info():
    """Get system information"""
    try:
        yt_dlp_version = "Unknown"
        try:
            import pkg_resources
            yt_dlp_version = pkg_resources.get_distribution("yt-dlp").version
        except:
            pass
        
        return jsonify({
            'ffmpeg_available': ffmpeg_available,
            'download_folder': DOWNLOAD_FOLDER,
            'python_version': sys.version.split()[0],
            'yt_dlp_version': yt_dlp_version,
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("YouTube Downloader - Starting Server")
    logger.info(f"FFmpeg: {'✓ Available' if ffmpeg_available else '✗ Not found'}")
    logger.info(f"Download Folder: {DOWNLOAD_FOLDER}")
    logger.info(f"Access: http://localhost:5000")
    logger.info("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)
