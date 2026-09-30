import sys
import os
import json
import base64
import requests
import httpx
import asyncio
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
import fastapi
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv
import uvicorn

load_dotenv()



app = FastAPI(title="Maanak Gateway (Input/Output Domain)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FrontendRequest(BaseModel):
    input_type: str
    data: str
    source_lang: str
    session_id: str
    transcript: str = ""

class TTSRequest(BaseModel):
    text: str
    target_lang: str

def bhashini_asr(audio_base64: str, source_lang: str) -> str:
    """
    Multilingual ASR:
    1. Tries Bhashini if BHASHINI_API_KEY is configured.
    2. Tries Hugging Face Multilingual Whisper (whisper-large-v3-turbo).
    """
    if not audio_base64:
        return ""
        
    import base64
    import os
    import requests
    
    try:
        audio_bytes = base64.b64decode(audio_base64)
    except Exception as e:
        print(f"[ASR] Base64 decode error: {e}")
        return ""

    # 1. Bhashini ASR (if configured)
    bhashini_key = os.getenv("BHASHINI_API_KEY", "")
    if bhashini_key:
        try:
            pass
        except Exception as e:
            print(f"[Bhashini ASR] Error: {e}")

    # 2. Hugging Face Multilingual Whisper API
    hf_token = os.getenv("HF_TOKEN", "")
    if hf_token:
        try:
            url = "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo"
            headers = {
                "Authorization": f"Bearer {hf_token}",
                "Content-Type": "audio/webm"
            }
            resp = requests.post(url, headers=headers, data=audio_bytes, timeout=15.0)
            if resp.status_code == 200:
                result = resp.json()
                transcribed = result.get("text", "").strip()
                if transcribed:
                    print(f"[Whisper ASR] Successfully transcribed ({source_lang}): {transcribed}")
                    return transcribed
            else:
                print(f"[Whisper ASR] HF status {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"[Whisper ASR] Request failed: {e}")
            
    return ""

def bhashini_translate(text: str, source_lang: str, target_lang: str) -> str:
    """
    Translates text. Fallback logic:
    1. Tries Bhashini if BHASHINI_API_KEY is present.
    2. Falls back to GPT-4o-mini via OpenRouter if Bhashini fails or key is missing.
    """
    if source_lang == target_lang:
        return text
    
    bhashini_key = os.getenv("BHASHINI_API_KEY", "")
    
    # 1. Try Bhashini (if we get the key tomorrow)
    if bhashini_key:
        try:
            # (Stubbed Bhashini Request here for tomorrow)
            pass 
        except Exception as e:
            print(f"[Bhashini NMT] Failed, falling back to GPT-4o-mini: {e}")
            
    # 2. Fallback to GPT-4o-mini
    print(f"[Fallback NMT] Using GPT-4o-mini for {source_lang} -> {target_lang}")
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        return text
    
    try:
        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": f"You are a strict translation API. Translate the following text from {source_lang} to {target_lang}. Return ONLY the translated text, without quotes or conversational filler. CRITICAL: Keep all Indian Standard citations exactly in the format '[IS <number> -> Clause <clause>]' in English/Latin characters verbatim (e.g. keep '[IS 14543 -> Clause 4.1]' or '[IS 302 (Part 1) -> Clause 13.1]' unchanged; DO NOT translate 'IS' or 'Clause' and do not alter the brackets or arrows)."},
                    {"role": "user", "content": text}
                ],
                "temperature": 0.1
            },
            timeout=10.0
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"Translation error: {e}")
        return text

def fallback_gtts(text: str, target_lang: str) -> str:
    try:
        import base64
        import urllib.parse
        import httpx
        import re

        clean_text = re.sub(r'\[.*?\]', '', text)
        clean_text = re.sub(r'[*_#`~>]+', ' ', clean_text)
        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
        if not clean_text:
            return ""

        sentences = re.split(r'([.?!,;\n]+)', clean_text)
        chunks = []
        current = ""
        for s in sentences:
            if len(current) + len(s) < 100:
                current += s
            else:
                if current.strip():
                    chunks.append(current.strip())
                current = s
        if current.strip():
            chunks.append(current.strip())

        lang = (target_lang or "en")[:2].lower()
        combined_bytes = bytearray()
        with httpx.Client(timeout=10.0) as client:
            for chunk in chunks:
                if not chunk.strip():
                    continue
                url = f"https://translate.google.com/translate_tts?ie=UTF-8&q={urllib.parse.quote(chunk)}&tl={lang}&client=tw-ob"
                resp = client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
                if resp.status_code == 200:
                    combined_bytes.extend(resp.content)

        if not combined_bytes:
            return ""

        return base64.b64encode(combined_bytes).decode("utf-8")
    except Exception as e:
        print(f"[Native TTS] Error: {e}")
        return ""

def bhashini_tts(text: str, target_lang: str) -> str:
    """
    TTS Fallback logic:
    1. Tries Bhashini if BHASHINI_API_KEY is present.
    2. Falls back to ElevenLabs.
    3. Falls back to Google TTS (gTTS) if others fail/missing.
    """
    # 1. Try Bhashini
    bhashini_key = os.getenv("BHASHINI_API_KEY", "")
    if bhashini_key:
        try:
            # (Stubbed Bhashini TTS Request here)
            pass 
        except Exception as e:
            print(f"[Bhashini TTS] Failed, falling back to ElevenLabs: {e}")
            
    # 2. Try ElevenLabs
    elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "")
    if elevenlabs_key:
        try:
            print(f"[TTS] Trying ElevenLabs...")
            voice_id = "21m00Tcm4TlvDq8ikWAM" 
            response = httpx.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={"xi-api-key": elevenlabs_key, "Content-Type": "application/json"},
                json={"text": text, "model_id": "eleven_multilingual_v2"},
                timeout=15.0
            )
            response.raise_for_status()
            import base64
            return base64.b64encode(response.content).decode("utf-8")
        except Exception as e:
            print(f"[ElevenLabs TTS] Failed ({e}), falling back to Google TTS.")

    # 3. Fallback to Google TTS
    print(f"[TTS] Using Google TTS (gTTS) fallback...")
    return fallback_gtts(text, target_lang)

import httpx

@app.post("/api/gateway/chat/stream")
async def chat_stream_endpoint(req: FrontendRequest, request: Request, background_tasks: BackgroundTasks = None):
    user_role = request.headers.get("x-user-role", "citizen")
    
    native_text = req.data
    client_transcript = (getattr(req, "transcript", None) or "").strip()
    
    if req.input_type == "audio":
        if client_transcript:
            native_text = client_transcript
            print(f"[Gateway Voice] Using client transcript ({req.source_lang}): {native_text}")
        else:
            native_text = bhashini_asr(req.data, req.source_lang)
            print(f"[Gateway Voice] Server Whisper ASR transcribed ({req.source_lang}): {native_text}")
    
    english_query = bhashini_translate(native_text, req.source_lang, 'en') if native_text else ""
    
    import sys
    import os
    
    _parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    if _parent_path not in sys.path:
        sys.path.insert(0, _parent_path)

    # --- Layer 0: Deterministic Pre-Checks ---
    from Input_Processing.pre_checks import execute_layer_0
    layer_0_result = execute_layer_0(english_query) if english_query else {"processed_text": "", "extracted_codes": [], "needs_clarification_codes": [], "out_of_scope_codes": []}
    
    # --- Layer 1 & 2: Intent Classification & Condensation ---
    from RAG_LLM_Processing.query_condenser import condense_and_classify
    classification = condense_and_classify(english_query, [], layer_0_result) if english_query else {"routing_action": "ACTION_RAG_TECHNICAL_RETRIEVAL", "condensed_query": ""}
    
    action = classification.get("routing_action", "ACTION_FAIL_CLOSED")
    condensed_query = classification.get("condensed_query", english_query)
    
    async def sse_generator():
        # If voice consultation produced empty text, notify user gracefully
        if req.input_type == "audio" and not native_text.strip():
            yield f"event: token\ndata: {json.dumps({'text': 'Could not detect audio clearly. Please hold the mic and speak clearly, or type your question.'})}\n\n"
            yield "event: done\ndata: {}\n\n"
            return

        # If audio, notify client of the transcription
        if req.input_type == "audio" and native_text.strip():
            yield f"event: transcription\ndata: {json.dumps({'transcript': native_text})}\n\n"

        # Action Handlers (Bypassing LLM Generation)
        static_response = None
        
        if action == "ACTION_FAIL_CLOSED":
            static_response = "Could not process request securely. Please try again."
        elif action == "ACTION_REFUSE_OFFTOPIC":
            static_response = "I can only assist with Bureau of Indian Standards (BIS) and product compliance questions."
        elif action == "ACTION_REFUSE_FRAUD":
            static_response = "MAANAK cannot provide instructions for bypassing technical regulations or misusing the BIS Standard Mark under Section 29 of the BIS Act 2016."
        elif action == "ACTION_EMERGENCY_DIRECT":
            static_response = "If you are experiencing an immediate structural collapse or electrical fire emergency, evacuate immediately and contact local emergency services (112)."
        elif action == "ACTION_REFUSE_SCOPE_BOUNDARY":
            static_response = "MAANAK covers BIS specifications only. For other regulatory bodies (FSSAI, CDSCO, etc.) or foreign standards, please visit their respective portals."
        elif action == "ACTION_DIRECT_INSTITUTIONAL":
            static_response = "The Bureau of Indian Standards (BIS) is the National Standards Body of India, operating under the BIS Act 2016. It handles product certification (ISI Mark), hallmarking, and compulsory registration (CRS)."
        elif action == "ACTION_DIRECT_PORTAL_LINK":
            static_response = "To verify a license or report a fake ISI mark, please use the official BIS Care Mobile App or visit the BIS Public Grievance Portal at bis.gov.in."
        elif action == "ACTION_DIRECT_GREETING":
            static_response = "I am MAANAK, your BIS compliance assistant. I am here to help you understand Indian Standards (IS codes), product compliance, and certification requirements. You can ask me technical questions about specific standards, or how to verify certifications."
        elif action == "ACTION_CLARIFY_MENU":
            static_response = "Sure! What would you like to know about this standard?\n- Safety and performance requirements\n- Testing and certification process\n- Marking and labelling\n- A specific clause"
        elif action == "ACTION_DIRECT_LABS":
            extracted_codes = layer_0_result.get("extracted_codes", [])
            matched_labs_info = ""
            if extracted_codes:
                is_code = extracted_codes[0]
                search_digits = "".join([c for c in is_code if c.isdigit()])
                import csv
                csv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'labs_data.csv'))
                found_labs = []
                if os.path.exists(csv_path):
                    with open(csv_path, mode="r", encoding="utf-8") as f:
                        for row in csv.DictReader(f):
                            scopes = row.get("scope", "").split(";")
                            for s in scopes:
                                if search_digits in "".join([c for c in s if c.isdigit()]):
                                    found_labs.append(f"• **{row.get('lab_name', '').strip()}** ({row.get('location', '').strip()})")
                                    break
                if found_labs:
                    matched_labs_info = f"\n\nAuthorized labs testing **{is_code}** include:\n" + "\n".join(found_labs[:5])

            static_response = f"You can view and search all authorized BIS testing laboratories in our Labs Directory at: https://maanak-zeta.vercel.app/labs{matched_labs_info}"
            
        if static_response:
            if req.source_lang != 'en':
                static_response = bhashini_translate(static_response, 'en', req.source_lang)
                if req.input_type == "audio":
                    audio_b64 = bhashini_tts(static_response, req.source_lang)
                    yield f"event: audio\ndata: {json.dumps({'audio': audio_b64})}\n\n"
            
            chunk_size = 20
            for i in range(0, len(static_response), chunk_size):
                yield f"event: token\ndata: {json.dumps({'text': static_response[i:i+chunk_size]})}\n\n"
            yield "event: done\ndata: {}\n\n"
            return
            
        # --- Layer 3: Retrieval (If Technical Query) ---
        chunks = []
        try:
            rag_pipeline_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'RAG_PIPELINE', 'Maanak-feat-retrieval'))
            if rag_pipeline_path not in sys.path:
                sys.path.insert(0, rag_pipeline_path)
            from rag_engine.retrieval.retriever import get_relevant_clauses

            original_cwd = os.getcwd()
            os.chdir(rag_pipeline_path)
            chunks = await get_relevant_clauses(condensed_query, top_k=5)
            os.chdir(original_cwd)
        except Exception as e:
            print(f"Error getting chunks from RAG guy: {e}")
            if 'original_cwd' in locals():
                os.chdir(original_cwd)
        
        # --- Layer 4: Generation ---
        from RAG_LLM_Processing.generator import generate_strict_response
        
        if req.source_lang == 'en':
            full_response_text = ""
            async for token_event in generate_strict_response(condensed_query, chunks, user_role, is_voice=(req.input_type == "audio")):
                if token_event.startswith("event:"):
                    yield token_event
                else:
                    full_response_text += token_event
                    yield f"event: token\ndata: {json.dumps({'text': token_event})}\n\n"
            
            if req.input_type == "audio" and full_response_text.strip():
                try:
                    audio_b64 = bhashini_tts(full_response_text, "en")
                    if audio_b64:
                        yield f"event: audio\ndata: {json.dumps({'audio': audio_b64})}\n\n"
                except Exception as e:
                    print(f"[Gateway Voice Error] {e}")

            yield "event: done\ndata: {}\n\n"
        else:
            print("[Gateway] Collecting English stream for translation...")
            full_english_text = ""
            citations_metadata = []
            
            async for token_event in generate_strict_response(condensed_query, chunks, user_role, is_voice=(req.input_type == "audio")):
                if token_event.startswith("event: metadata"):
                    data_str = token_event.split("data: ")[1].strip()
                    try:
                        citations_metadata = json.loads(data_str).get("citations", [])
                    except: pass
                elif not token_event.startswith("event:"):
                    full_english_text += token_event

            # Yield citations metadata FIRST so citation badges render in the frontend immediately
            if citations_metadata:
                yield "event: metadata\ndata: " + json.dumps({"citations": citations_metadata}) + "\n\n"
                    
            # 4. Translate back
            translated_text = bhashini_translate(full_english_text, 'en', req.source_lang)
            
            words = translated_text.split(" ")
            for word in words:
                await asyncio.sleep(0.04)
                yield "event: token\ndata: " + json.dumps({"text": word + " "}) + "\n\n"
                
            if req.input_type == "audio" and translated_text.strip():
                try:
                    audio_b64 = bhashini_tts(translated_text, req.source_lang)
                    if audio_b64:
                        yield f"event: audio\ndata: {json.dumps({'audio': audio_b64})}\n\n"
                except Exception as e:
                    print(f"[Gateway Voice Error] {e}")

            yield "event: done\ndata: {}\n\n"
    return StreamingResponse(sse_generator(), media_type="text/event-stream")

@app.post("/api/gateway/tts")
async def tts_endpoint(request: TTSRequest):
    audio_base64 = bhashini_tts(request.text, request.target_lang)
    return JSONResponse(content={"audio_base64": audio_base64})

@app.get("/api/v1/labs")
async def get_labs_endpoint(is_code: str = ""):
    import csv
    is_code = is_code.upper().strip()
    search_code = "".join([c for c in is_code if c.isdigit()])
    
    csv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'labs_data.csv'))
    labs = []
    
    if os.path.exists(csv_path):
        with open(csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                scopes = [s.strip() for s in row.get("scope", "").split(";") if s.strip()]
                if search_code:
                    matched = False
                    for s in scopes:
                        if search_code in "".join([c for c in s if c.isdigit()]):
                            matched = True
                            break
                    if not matched:
                        continue
                labs.append({
                    "lab_name": row.get("lab_name", "").strip(),
                    "location": row.get("location", "").strip(),
                    "scope": scopes
                })
    return labs

if __name__ == "__main__":
    print("Starting Gateway Server on http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
