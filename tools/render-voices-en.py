"""
Renders the English hype-announcer voice lines with a Microsoft neural voice (edge-tts).
Runs OFFLINE, once (needs internet only while rendering): the game only plays the resulting files.

  python -m pip install --user edge-tts miniaudio
  python tools/render-voices-en.py            # -> tools/voice-src/<category>_<n>_<variant>.wav
  node tools/build-audio.js                   # trims, adds the arena-announcer treatment, writes assets/audio/voice/

Each phrase is rendered in several deliveries (faster / higher = more excited) for variety.
Replace with real recordings any time - see README "Voice and crowd samples".
"""
import asyncio, os, sys, wave
import edge_tts, miniaudio

VOICE = sys.argv[1] if len(sys.argv) > 1 else 'en-US-GuyNeural'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voice-src')

# category -> lines (same categories the game already uses)
PHRASES = {
    'perfect':   ['Perfect!', 'Yesss!', 'Incredible!', 'Beautiful!', 'Flawless!'],
    'good':      ['Nice!', 'Great!', 'Good one!', "That's it!"],
    'miss':      ['Ohhh no!', 'Whoa!', 'Missed it!', 'Nooo!', 'Careful!'],
    'streak':    ['Unstoppable!', "He's on fire!", 'Legendary!', 'What a combo!'],
    'celebrate': ['Magnificent performance!', 'The sea bows to you!', 'Bravo, Prince!'],
    'worried':   ["She's coming!", 'Watch out!', 'Run, Prince, run!'],
}
DELIVERIES = [
    {'rate': '+12%', 'pitch': '+6Hz'},
    {'rate': '+24%', 'pitch': '+16Hz'},
    {'rate': '+4%',  'pitch': '+0Hz'},
]


async def render(text, d, path):
    mp3 = b''
    async for chunk in edge_tts.Communicate(text, VOICE, rate=d['rate'], pitch=d['pitch'], volume='+40%').stream():
        if chunk['type'] == 'audio':
            mp3 += chunk['data']
    pcm = miniaudio.decode(mp3, output_format=miniaudio.SampleFormat.SIGNED16, nchannels=1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(pcm.sample_rate)
        w.writeframes(pcm.samples.tobytes())


async def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):                      # old renders (e.g. the earlier Thai lines)
        if f.endswith('.wav'):
            os.remove(os.path.join(OUT, f))
    n = 0
    for cat, lines in PHRASES.items():
        for i, text in enumerate(lines):
            for v, d in enumerate(DELIVERIES):
                await render(text, d, os.path.join(OUT, f'{cat}_{i}_{v}.wav'))
                n += 1
    print(f'Rendered {n} clips with {VOICE} to {OUT}')

asyncio.run(main())
