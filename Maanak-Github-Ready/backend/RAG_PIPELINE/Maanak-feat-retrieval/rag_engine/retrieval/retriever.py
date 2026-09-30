import os
import pickle
import asyncio
import httpx
from dotenv import load_dotenv
from pinecone import Pinecone

load_dotenv()

pinecone_index = None
sparse_encoder = None

def load_resources():
    global pinecone_index, sparse_encoder
    
    if pinecone_index is None:
        pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        index_name = os.getenv("PINECONE_INDEX_NAME", "bis-maanak-index")
        pinecone_index = pc.Index(index_name)
        
    if sparse_encoder is None:
        encoder_path = os.path.join("data", "metadata", "sparse_encoder.pkl")
        if os.path.exists(encoder_path):
            with open(encoder_path, "rb") as f:
                sparse_encoder = pickle.load(f)

async def get_hf_embedding(text: str) -> list[float]:
    hf_token = os.getenv("HF_TOKEN")
    if not hf_token:
        print("[Error] Missing HF_TOKEN for embeddings!")
        return []
    
    url = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2"
    headers = {"Authorization": f"Bearer {hf_token}"}
    
    def _sync_post():
        import requests
        for attempt in range(3):
            try:
                response = requests.post(url, headers=headers, json={"inputs": text}, timeout=20.0)
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                        return data[0]
                    return data
                elif response.status_code == 503:
                    print(f"[HF API] Model loading (503)... retrying {attempt+1}/3")
                    import time
                    time.sleep(2)
                else:
                    print(f"[HF API] Error {response.status_code}: {response.text}")
                    break
            except Exception as e:
                print(f"[HF API] Network error: {e}")
                break
        return []

    return await asyncio.to_thread(_sync_post)

async def get_relevant_clauses(standalone_query: str, top_k: int = 3, alpha: float = 0.5) -> list[dict]:
    """
    Query the vector database using hybrid search (HuggingFace API + Pinecone).
    `alpha` balances sparse vs dense. 
    """
    await asyncio.to_thread(load_resources)
    
    if sparse_encoder is None:
        print("Sparse encoder not found! Run indexer first.")
        return []

    # 1. Generate Query Vectors via HF API (NO PYTORCH MEMORY USED!)
    dense_vec = await get_hf_embedding(standalone_query)
    
    if not dense_vec:
        print("[Error] Failed to get dense vector from HuggingFace.")
        return []

    try:
        # Generate Sparse Vector locally (Scikit-Learn uses almost 0 memory)
        sparse_matrix = sparse_encoder.transform([standalone_query])
        row = sparse_matrix[0]
        sparse_vec = {
            "indices": row.indices.tolist(),
            "values": row.data.tolist()
        }
    except Exception as e:
        print(f"[Sparse Transform] Error: {e}")
        sparse_vec = {"indices": [], "values": []}
    
    # 2. Hybrid Scaling
    scaled_dense = [v * alpha for v in dense_vec]
    scaled_sparse = {
        "indices": sparse_vec["indices"],
        "values": [v * (1 - alpha) for v in sparse_vec["values"]]
    }
    
    # 3. Pinecone Native Hybrid Query
    if len(scaled_sparse["indices"]) == 0:
        resp = await asyncio.to_thread(
            pinecone_index.query,
            vector=scaled_dense,
            top_k=top_k,
            include_metadata=True
        )
    else:
        resp = await asyncio.to_thread(
            pinecone_index.query,
            vector=scaled_dense,
            sparse_vector=scaled_sparse,
            top_k=top_k,
            include_metadata=True
        )
    
    candidate_metadata_list = [match.metadata for match in resp.matches]
    
    # Bypass the heavy CrossEncoder reranker for Render deployment
    # Pinecone's native hybrid scores are already sorted and highly accurate
    for i, meta in enumerate(candidate_metadata_list):
        meta["relevance_score"] = float(resp.matches[i].score)
        
    return candidate_metadata_list
