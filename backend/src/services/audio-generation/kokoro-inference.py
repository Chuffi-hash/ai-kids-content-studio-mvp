#!/usr/bin/env python3
"""
Kokoro-82M ONNX Inference Worker Script.
Provides isolated, decoupled Text-to-Speech synthesis without blocking the Node.js event loop.
"""

import os
import sys
import json
import argparse
import time

def get_default_model_dir():
    # Relative to this script: backend/src/services/audio-generation -> backend/models/kokoro
    current_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
    return os.path.join(backend_dir, "models", "kokoro")

def check_model_availability(model_dir):
    model_path = os.path.join(model_dir, "kokoro-v1.0.onnx")
    voices_path = os.path.join(model_dir, "voices-v1.0.bin")
    
    model_exists = os.path.isfile(model_path) and os.path.getsize(model_path) > 1000000
    voices_exists = os.path.isfile(voices_path) and os.path.getsize(voices_path) > 100000
    
    return {
        "available": model_exists and voices_exists,
        "modelPath": model_path,
        "voicesPath": voices_path,
        "modelExists": model_exists,
        "voicesExists": voices_exists,
    }

def list_supported_voices():
    # Official Kokoro-82M Voices Catalogue (from VOICES.md)
    return [
        # American English (Female)
        {"id": "af_heart", "name": "Heart (Warm & Expressive)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "A"},
        {"id": "af_bella", "name": "Bella (Gentle & Clear)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "A"},
        {"id": "af_nicole", "name": "Nicole (Whispering / Soft)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "af_aoede", "name": "Aoede (Melodic)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "af_kore", "name": "Kore (Storyteller)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "af_sarah", "name": "Sarah (Friendly Narration)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "af_nova", "name": "Nova (Bright & Cheerful)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "af_sky", "name": "Sky (Playful Youth)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "af_alloy", "name": "Alloy (Clear & Direct)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "af_jessica", "name": "Jessica (Conversational)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "af_river", "name": "River (Calm & Soothing)", "gender": "female", "lang": "en-us", "accent": "American", "grade": "B"},
        # American English (Male)
        {"id": "am_michael", "name": "Michael (Deep & Rich)", "gender": "male", "lang": "en-us", "accent": "American", "grade": "A"},
        {"id": "am_adam", "name": "Adam (Clear & Confident)", "gender": "male", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "am_echo", "name": "Echo (Storybook Male)", "gender": "male", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "am_eric", "name": "Eric (Warm & Friendly)", "gender": "male", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "am_fenrir", "name": "Fenrir (Strong Character)", "gender": "male", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "am_liam", "name": "Liam (Natural Casual)", "gender": "male", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "am_onyx", "name": "Onyx (Resonant)", "gender": "male", "lang": "en-us", "accent": "American", "grade": "B"},
        {"id": "am_puck", "name": "Puck (Playful / Character)", "gender": "male", "lang": "en-us", "accent": "American", "grade": "B"},
        # British English (Female)
        {"id": "bf_emma", "name": "Emma (Classic British Narration)", "gender": "female", "lang": "en-gb", "accent": "British", "grade": "A"},
        {"id": "bf_isabella", "name": "Isabella (Refined British)", "gender": "female", "lang": "en-gb", "accent": "British", "grade": "B"},
        {"id": "bf_alice", "name": "Alice (Fairytale Reader)", "gender": "female", "lang": "en-gb", "accent": "British", "grade": "B"},
        {"id": "bf_lily", "name": "Lily (Bright British Youth)", "gender": "female", "lang": "en-gb", "accent": "British", "grade": "B"},
        # British English (Male)
        {"id": "bm_george", "name": "George (Classic British Storyteller)", "gender": "male", "lang": "en-gb", "accent": "British", "grade": "A"},
        {"id": "bm_fable", "name": "Fable (Grand Narrative)", "gender": "male", "lang": "en-gb", "accent": "British", "grade": "B"},
        {"id": "bm_lewis", "name": "Lewis (Warm British)", "gender": "male", "lang": "en-gb", "accent": "British", "grade": "B"},
        {"id": "bm_daniel", "name": "Daniel (Gentle British)", "gender": "male", "lang": "en-gb", "accent": "British", "grade": "B"},
    ]

def synthesize(text, voice, speed, lang, output_path, model_dir):
    try:
        from kokoro_onnx import Kokoro
        import soundfile as sf
    except ImportError as e:
        return {"success": False, "error": f"Required Python packages missing: {e}"}

    avail = check_model_availability(model_dir)
    if not avail["available"]:
        return {
            "success": False,
            "error": f"Kokoro model files not found in {model_dir}. Please run download-kokoro-model.py first."
        }

    # Validate speed range (0.5 to 2.0)
    safe_speed = max(0.5, min(2.0, float(speed)))

    # Clean and validate voice
    supported_voice_ids = {v["id"] for v in list_supported_voices()}
    selected_voice = voice if voice in supported_voice_ids else "af_heart"

    # Normalize language: e.g. 'en', 'en-us', 'en-gb'
    normalized_lang = "en-gb" if "gb" in lang.lower() or selected_voice.startswith("b") else "en-us"

    try:
        t0 = time.time()
        kokoro = Kokoro(avail["modelPath"], avail["voicesPath"])
        
        # Kokoro ONNX create
        samples, sample_rate = kokoro.create(
            text=text,
            voice=selected_voice,
            speed=safe_speed,
            lang=normalized_lang,
        )

        # Ensure directory for output exists
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        sf.write(output_path, samples, sample_rate)

        duration_sec = len(samples) / float(sample_rate)
        duration_ms = int(round(duration_sec * 1000))
        inference_time_ms = int(round((time.time() - t0) * 1000))

        return {
            "success": True,
            "outputPath": output_path,
            "sampleRate": sample_rate,
            "durationMs": duration_ms,
            "inferenceTimeMs": inference_time_ms,
            "voice": selected_voice,
            "speed": safe_speed,
            "lang": normalized_lang,
        }
    except Exception as ex:
        return {
            "success": False,
            "error": f"Kokoro inference error: {str(ex)}"
        }

def main():
    parser = argparse.ArgumentParser(description="Kokoro-82M ONNX Inference Worker")
    parser.add_argument("--text", type=str, default="", help="Text to speak")
    parser.add_argument("--voice", type=str, default="af_heart", help="Voice style ID")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    parser.add_argument("--lang", type=str, default="en-us", help="Language code")
    parser.add_argument("--output", type=str, default="", help="Output audio file path (.wav)")
    parser.add_argument("--model-dir", type=str, default=get_default_model_dir(), help="Path to kokoro model files")
    parser.add_argument("--check", action="store_true", help="Check if model files are available")
    parser.add_argument("--list-voices", action="store_true", help="List supported voices catalogue")

    args = parser.parse_args()

    if args.check:
        status = check_model_availability(args.model_dir)
        print(json.dumps(status))
        sys.exit(0 if status["available"] else 1)

    if args.list_voices:
        voices = list_supported_voices()
        print(json.dumps(voices))
        sys.exit(0)

    if not args.text or not args.output:
        print(json.dumps({"success": False, "error": "Both --text and --output are required"}))
        sys.exit(2)

    result = synthesize(
        text=args.text,
        voice=args.voice,
        speed=args.speed,
        lang=args.lang,
        output_path=args.output,
        model_dir=args.model_dir,
    )

    print(json.dumps(result))
    if not result.get("success"):
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    main()
