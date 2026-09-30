from gtts import gTTS
import io, base64

text = "Hello world"
tts = gTTS(text=text, lang='en')
fp = io.BytesIO()
tts.write_to_fp(fp)
fp.seek(0)
print(base64.b64encode(fp.read()).decode('utf-8')[:50])
