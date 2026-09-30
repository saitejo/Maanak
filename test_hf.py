from huggingface_hub import InferenceClient
client = InferenceClient(token="") # NO TOKEN just to see if it initializes and attempts a call
try:
    print(client.feature_extraction("led lamp", model="sentence-transformers/all-MiniLM-L6-v2"))
except Exception as e:
    print("ERROR:", e)
