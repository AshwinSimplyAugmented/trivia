"""
Generate audio narration for trivia questions using ElevenLabs API
Reads questions from questions_ffa.json and creates MP3 files with Santa's voice
"""

import json
import os
from pathlib import Path
from elevenlabs import ElevenLabs
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
SANTA_VOICE_ID = "ncsgABEEnuQrLrlvQqua"
INPUT_FILE = "questions_ffa.json"
OUTPUT_DIR = "question_audio"

# Initialize ElevenLabs client
client = ElevenLabs(api_key=os.getenv("ELEVEN_LABS_API_KEY"))

def create_output_directory():
    """Create output directory if it doesn't exist"""
    output_path = Path(OUTPUT_DIR)
    output_path.mkdir(exist_ok=True)
    print(f"✓ Output directory ready: {OUTPUT_DIR}/")
    return output_path

def load_questions():
    """Load questions from JSON file"""
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    questions = data.get('questions', [])
    print(f"✓ Loaded {len(questions)} questions from {INPUT_FILE}")
    return questions

def generate_audio(question_text, question_id, output_path):
    """Generate audio for a single question using ElevenLabs API"""
    filename = output_path / f"question-{question_id}.mp3"

    try:
        print(f"  Generating audio for Question {question_id}...")

        # Generate audio from text
        audio = client.text_to_speech.convert(
            text=question_text,
            voice_id=SANTA_VOICE_ID,
            model_id="eleven_multilingual_v2",  # Higher quality
            output_format="mp3_44100_128"
        )

        # Save to file
        with open(filename, "wb") as f:
            for chunk in audio:
                if chunk:
                    f.write(chunk)

        print(f"  ✓ Saved: {filename}")
        return True

    except Exception as e:
        print(f"  ✗ Error generating audio for Question {question_id}: {e}")
        return False

def main():
    """Main execution function"""
    print("\n" + "="*60)
    print("  Santa's Trivia Question Audio Generator")
    print("="*60 + "\n")

    # Create output directory
    output_path = create_output_directory()

    # Load questions
    questions = load_questions()

    if not questions:
        print("✗ No questions found in JSON file!")
        return

    # Generate audio for each question
    print(f"\nGenerating audio for {len(questions)} questions...\n")

    success_count = 0
    fail_count = 0

    for question_data in questions:
        question_id = question_data.get('id')
        question_text = question_data.get('question')

        if question_id and question_text:
            if generate_audio(question_text, question_id, output_path):
                success_count += 1
            else:
                fail_count += 1
        else:
            print(f"  ✗ Skipping invalid question: {question_data}")
            fail_count += 1

    # Summary
    print("\n" + "="*60)
    print(f"  Generation Complete!")
    print("="*60)
    print(f"  ✓ Success: {success_count} files")
    if fail_count > 0:
        print(f"  ✗ Failed: {fail_count} files")
    print(f"  → Output location: {output_path.absolute()}")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()
