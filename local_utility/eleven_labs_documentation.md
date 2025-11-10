## Simple ElevenLabs Text-to-Speech Implementation Guide

Here's a straightforward guide to send text to the ElevenLabs API and get back audio using your Santa voice.

### 1. Installation

```bash
pip install elevenlabs
pip install python-dotenv  # Optional, for environment variables
```

### 2. Basic Setup

```python
from elevenlabs import ElevenLabs

# Initialize the client with your API key
client = ElevenLabs(
    api_key="YOUR_API_KEY_HERE"  # Get from ElevenLabs dashboard
)

# Your Santa voice ID
SANTA_VOICE_ID = "ncsgABEEnuQrLrlvQqua"
```

### 3. Convert Text to Audio and Save

```python
# Generate audio from text
audio = client.text_to_speech.convert(
    text="Ho ho ho! Welcome to Santa's workshop!",
    voice_id=SANTA_VOICE_ID,
    model_id="eleven_monolingual_v1",  # or "eleven_multilingual_v2" for better quality
    output_format="mp3_44100_128"  # MP3 format
)

# Save to file
with open("santa_message.mp3", "wb") as f:
    for chunk in audio:
        if chunk:
            f.write(chunk)
```

### 4. Play Audio Directly (Optional)

```python
from elevenlabs import play

audio = client.text_to_speech.convert(
    text="Ho ho ho! Merry Christmas!",
    voice_id=SANTA_VOICE_ID,
    model_id="eleven_monolingual_v1"
)

play(audio)  # Plays through speakers (requires ffmpeg/mpv)
```

### 5. Streaming for Real-time Audio

```python
from elevenlabs import stream

# Stream audio as it's generated (lower latency)
audio_stream = client.text_to_speech.stream(
    text="Ho ho ho! Welcome to my trivia game!",
    voice_id=SANTA_VOICE_ID,
    model_id="eleven_monolingual_v1"
)

stream(audio_stream)  # Plays while generating
```

### 6. Complete Example for Your Trivia Game

```python
from elevenlabs import ElevenLabs
import os

# Setup
client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
SANTA_VOICE_ID = "ncsgABEEnuQrLrlvQqua"

def generate_santa_audio(text, filename):
    """Generate Santa audio and save to file"""
    audio = client.text_to_speech.convert(
        text=text,
        voice_id=SANTA_VOICE_ID,
        model_id="eleven_multilingual_v2",  # Higher quality
        output_format="mp3_44100_128"
    )
    
    with open(filename, "wb") as f:
        for chunk in audio:
            if chunk:
                f.write(chunk)
    
    print(f"Audio saved to {filename}")
    return filename

# Generate your trivia intro
intro_text = """Ho ho ho! Welcome to Santa's trivia game, you naughty little 
smarty-pants! It's a free-for-all - answer faster than everyone else to get 
more points! And yes, I'm watching for cheaters... I always am! Ha ha ha! 
Whoever has the most points wins, and the losers? Well... let's just say 
I'm updating my list! Ready to see who's actually been paying attention? 
Ho ho ho!"""

generate_santa_audio(intro_text, "santa_trivia_intro.mp3")
```

### 7. Voice Settings (Optional)

You can adjust voice characteristics:

```python
audio = client.text_to_speech.convert(
    text="Your text here",
    voice_id=SANTA_VOICE_ID,
    model_id="eleven_multilingual_v2",
    voice_settings={
        "stability": 0.5,        # 0-1, higher = more consistent
        "similarity_boost": 0.8,  # 0-1, higher = closer to original voice
        "style": 0.3,            # 0-1, emotional expressiveness
        "use_speaker_boost": True # Enhance voice clarity
    }
)
```

### Key Notes:
- **API Key**: Get from ElevenLabs dashboard → Profile → API Key
- **Models**: `eleven_monolingual_v1` is faster, `eleven_multilingual_v2` has better quality
- **Output Formats**: `mp3_44100_128` is standard, higher quality formats need paid plans
- **Character Usage**: Each API call uses credits based on character count
- **Rate Limits**: Check your plan's limits in the dashboard

That's it! This should get you up and running with your Santa voice for the trivia game.