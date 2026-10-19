import os
import sys
import urllib.request

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "kokoro")
os.makedirs(MODEL_DIR, exist_ok=True)

FILES = {
    "kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}

def download_file(filename, url):
    dest = os.path.join(MODEL_DIR, filename)
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        print(f"[Kokoro] Already present: {filename} ({os.path.getsize(dest)} bytes)")
        return True

    print(f"[Kokoro] Downloading {filename} from {url}...")
    try:
        def reporthook(count, block_size, total_size):
            if total_size > 0:
                percent = int(count * block_size * 100 / total_size)
                sys.stdout.write(f"\rDownloading {filename}: {percent}% ({count * block_size // 1024 // 1024}MB / {total_size // 1024 // 1024}MB)")
                sys.stdout.flush()

        urllib.request.urlretrieve(url, dest, reporthook)
        print(f"\n[Kokoro] Successfully downloaded: {filename}")
        return True
    except Exception as e:
        print(f"\n[Kokoro] Error downloading {filename}: {e}")
        if os.path.exists(dest):
            try:
                os.remove(dest)
            except:
                pass
        return False

def main():
    print(f"[Kokoro] Model target directory: {MODEL_DIR}")
    all_ok = True
    for fname, url in FILES.items():
        ok = download_file(fname, url)
        if not ok:
            all_ok = False

    if all_ok:
        print("[Kokoro] All Kokoro-82M model files are ready!")
        sys.exit(0)
    else:
        print("[Kokoro] Warning: Failed to download one or more Kokoro model files.")
        sys.exit(1)

if __name__ == "__main__":
    main()

