from sentence_transformers import SentenceTransformer
import sqlite3
import json

def reprocess_embeddings():
    # Use the same model as in app.py
    model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')
    
    # Connect to database
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    
    # Get all dreams
    c.execute("SELECT id, text FROM dreams")
    dreams = c.fetchall()
    
    print(f"Reprocessing {len(dreams)} dreams...")
    
    # Update each dream with new embedding
    for dream_id, text in dreams:
        new_embedding = model.encode(text.strip()).tolist()
        c.execute("UPDATE dreams SET embedding = ? WHERE id = ?",
                 (json.dumps(new_embedding), dream_id))
        print(f"Processed dream {dream_id}")
    
    conn.commit()
    conn.close()
    print("Done!")

if __name__ == "__main__":
    reprocess_embeddings()