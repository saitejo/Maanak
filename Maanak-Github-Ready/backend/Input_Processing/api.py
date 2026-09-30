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

class TTSRequest(BaseModel):
    text: str
    target_lang: str

def bhashini_asr(audio_base64: str, source_lang: str) -> str:
    """
    TODO: Integrate Bhashini ASR API here.
    Input:  audio_base64 (base64-encoded audio), source_lang (ISO code e.g. 'hi', 'te')
    Output: Transcribed text string in the source language.

    Bhashini API Docs: https://bhashini.gov.in/ulca/apis
    Expected endpoint: POST https://dhruva-api.bhashini.gov.in/services/inference/pipeline
    Auth header: Authorization: <BHASHINI_API_KEY>

    Until integrated, returns empty string so the gateway degrades gracefully.
    """
    print(f"[Bhashini ASR] TODO: integrate Bhashini ASR for lang={source_lang}")
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
                    {"role": "system", "content": f"You are a strict translation API. Translate the following text from {source_lang} to {target_lang}. Return ONLY the translated text, without quotes or conversational filler."},
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

def bhashini_tts(text: str, target_lang: str) -> str:
    """
    TTS Fallback logic:
    1. Tries Bhashini if BHASHINI_API_KEY is present.
    2. Falls back to ElevenLabs if Bhashini fails or key is missing.
    """
    bhashini_key = os.getenv("BHASHINI_API_KEY", "")
    
    # 1. Try Bhashini (tomorrow)
    if bhashini_key:
        try:
            # (Stubbed Bhashini TTS Request here)
            pass 
        except Exception as e:
            print(f"[Bhashini TTS] Failed, falling back to ElevenLabs: {e}")
            
    # 2. Fallback to ElevenLabs
    print(f"[Fallback TTS] Using ElevenLabs for voice...")
    elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "")
    if not elevenlabs_key:
        return ""
        
    try:
        # Default voice ID for ElevenLabs (e.g., Rachel)
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
        print(f"ElevenLabs error: {e}")
        return ""

import httpx

@app.post("/api/gateway/chat/stream")
async def chat_stream_endpoint(req: FrontendRequest, request: Request, background_tasks: BackgroundTasks = None):
    user_role = request.headers.get("x-user-role", "citizen")
    
    native_text = req.data
    if req.input_type == "audio":
        native_text = bhashini_asr(req.data, req.source_lang)
    
    english_query = bhashini_translate(native_text, req.source_lang, 'en')
    
    import sys
    import os
    
    _parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    if _parent_path not in sys.path:
        sys.path.insert(0, _parent_path)

    # --- Layer 0: Deterministic Pre-Checks ---
    from Input_Processing.pre_checks import execute_layer_0
    layer_0_result = execute_layer_0(english_query)
    
    # --- Layer 1 & 2: Intent Classification & Condensation ---
    from RAG_LLM_Processing.query_condenser import condense_and_classify
    # Pass raw english query to prevent injection in condenser
    classification = condense_and_classify(english_query, [], layer_0_result)
    
    action = classification.get("routing_action", "ACTION_FAIL_CLOSED")
    condensed_query = classification.get("condensed_query", english_query)
    
    async def sse_generator():
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
            # For demonstration, generate a deep link
            static_response = "You can find authorized testing laboratories for this standard in our Labs Directory. Please visit: http://localhost:3000/labs"
            
        if static_response:
            # Yield static response if hit
            if req.source_lang != 'en':
                static_response = bhashini_translate(static_response, 'en', req.source_lang)
                if req.input_type == "audio":
                    audio_b64 = bhashini_tts(static_response, req.source_lang)
                    yield f"event: audio\ndata: {json.dumps({'audio': audio_b64})}\n\n"
            
            chunk_size = 20
            for i in range(0, len(static_response), chunk_size):
                yield f"event: token\ndata: {json.dumps({'text': static_response[i:i+chunk_size]})}\n\n"
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
            chunks = await get_relevant_clauses(condensed_query, top_k=3)
            os.chdir(original_cwd)
        except Exception as e:
            print(f"Error getting chunks from RAG guy: {e}")
            if 'original_cwd' in locals():
                os.chdir(original_cwd)
        
        # --- Layer 4: Generation ---
        from RAG_LLM_Processing.generator import generate_strict_response
        
        if req.source_lang == 'en':
            async for token_event in generate_strict_response(condensed_query, chunks, user_role, is_voice=(req.input_type == "audio")):
                if token_event.startswith("event:"):
                    yield token_event
                else:
                    yield f"event: token\ndata: {json.dumps({'text': token_event})}\n\n"
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
                    
            # 4. Translate back
            translated_text = bhashini_translate(full_english_text, 'en', req.source_lang)
            
            words = translated_text.split(" ")
            for word in words:
                await asyncio.sleep(0.05)
                yield "event: token\ndata: " + json.dumps({"text": word + " "}) + "\n\n"
            if citations_metadata:
                yield "event: metadata\ndata: " + json.dumps({"citations": citations_metadata}) + "\n\n"
            yield "event: done\ndata: {}\n\n"
    return StreamingResponse(sse_generator(), media_type="text/event-stream")

@app.post("/api/gateway/tts")
async def tts_endpoint(request: TTSRequest):
    audio_base64 = bhashini_tts(request.text, request.target_lang)
    return JSONResponse(content={"audio_base64": audio_base64})

@app.get("/api/v1/labs")
async def get_labs_endpoint(is_code: str = ""):
    is_code = is_code.upper().strip()
    search_code = "".join([c for c in is_code if c.isdigit()])
    
    database_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Maanak_database'))
    
    if not os.path.exists(database_dir):
        # Mock labs for Render deployment (since PDFs are gitignored)
        return [
            {"lab_name": "BIS Central Laboratory", "location": "Sahibabad", "scope": ["IS 1293", "IS 302", "IS 16046"]},
            {"lab_name": "ERTL (North)", "location": "New Delhi", "scope": ["IS 1293", "IS 13252"]},
            {"lab_name": "National Test House", "location": "Kolkata", "scope": ["IS 1293"]}
        ]
        
    lab_map = {}
    for filename in os.listdir(database_dir):
        if not filename.endswith(".pdf") or "LABS" in filename or "LIMS" in filename:
            continue
            
        parts = filename.replace(".pdf", "").split("_")
        if len(parts) >= 2:
            lab_name_raw = parts[0]
            code_part = parts[1]
            if code_part.startswith("PART") or code_part == "scope":
                continue
                
            if lab_name_raw not in lab_map:
                lab_map[lab_name_raw] = set()
            lab_map[lab_name_raw].add(code_part)
            
    labs = []
    for lab_name_raw, scopes in lab_map.items():
        if search_code and search_code not in scopes:
            continue
            
        formatted_name = lab_name_raw.replace("Laboratory(", " Laboratory (")
        formatted_name = formatted_name.replace("Branch", " Branch ").replace("Central", "Central ").replace("Regional", " Regional ")
        formatted_name = formatted_name.replace("  ", " ").strip()
        
        location = "India"
        if "Bengaluru" in formatted_name: location = "Bengaluru"
        elif "Central" in formatted_name: location = "Sahibabad"
        elif "Eastern" in formatted_name: location = "Kolkata"
        elif "Northern" in formatted_name: location = "Mohali"
        elif "Southern" in formatted_name: location = "Chennai"
        elif "Western" in formatted_name: location = "Mumbai"
        elif "Patna" in formatted_name: location = "Patna"
        elif "Hyderabad" in formatted_name: location = "Hyderabad"
        elif "Jammu" in formatted_name: location = "Jammu & Kashmir"
        
        labs.append({
            "lab_name": formatted_name,
            "location": location,
            "scope": [f"IS {code}" for code in sorted(list(scopes))]
        })
        
    return labs

if __name__ == "__main__":
    print("Starting Gateway Server on http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
