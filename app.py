from flask import Flask, render_template, request, redirect, url_for
import sqlite3
import numpy as np
from sentence_transformers import SentenceTransformer, util
import umap
import random
import os

app = Flask(__name__)

# Load Sentence-BERT model
model = SentenceTransformer('all-MiniLM-L6-v2')

def preprocess_dream(text):
    # Optional: add your preprocessing logic (e.g., remove "I dreamt...", add "[Content Only]")
    return text.strip()

def init_db():
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS dreams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.route('/all_dreams')
def all_dreams():
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    c.execute("SELECT id, text FROM dreams")
    rows = c.fetchall()
    conn.close()
    
    # Build an HTML list
    dream_list = "<h1>All Dreams</h1><ul>"
    for dream_id, dream_text in rows:
        dream_list += f"""
        <li>
            <strong>ID {dream_id}:</strong> {dream_text}
            <form action="/delete_dream/{dream_id}" method="POST" style="display:inline;">
                <button type="submit">Delete</button>
            </form>
        </li>
        """
    dream_list += "</ul>"
    return dream_list



@app.route('/delete_dream/<int:dream_id>', methods=['POST'])
def delete_dream(dream_id):
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    c.execute("DELETE FROM dreams WHERE id = ?", (dream_id,))
    conn.commit()
    conn.close()
    # Redirect to see updated list
    return redirect(url_for('all_dreams'))


@app.route('/', methods=['GET', 'POST'])
def index():
    user_dream = None
    top_similar = []
    nodes = []
    links = []
    new_dream_id = None

    if request.method == 'POST':
        user_dream = request.form['dream'].strip()
        if user_dream:
            # Insert the new dream
            conn = sqlite3.connect("dreams.db")
            c = conn.cursor()
            c.execute("INSERT INTO dreams (text) VALUES (?)", (user_dream,))
            new_dream_id = c.lastrowid
            conn.commit()

            # Retrieve all dreams
            c.execute("SELECT id, text FROM dreams")
            rows = c.fetchall()
            conn.close()

            # Preprocess and embed dreams
            dream_texts = [preprocess_dream(r[1]) for r in rows]
            embeddings = model.encode(dream_texts, convert_to_tensor=False)

            # Embed new dream for top-similar display
            new_embedding = model.encode(preprocess_dream(user_dream), convert_to_tensor=False)
            cosine_scores = util.cos_sim(new_embedding, embeddings)[0]
            # Exclude the new dream itself; get top 4
            similarities = [
                (rows[i][0], rows[i][1], float(cosine_scores[i]))
                for i in range(len(rows)) if rows[i][0] != new_dream_id
            ]
            similarities.sort(key=lambda x: x[2], reverse=True)
            top_similar = similarities[:4]

            # Prepare nodes list
            nodes = [{"id": r[0], "text": r[1]} for r in rows]

            # Build full pairwise similarity matrix
            similarity_matrix = util.cos_sim(embeddings, embeddings).cpu().numpy()

            # Compute each dream's "score" (sum of similarities excluding self)
            for i, node in enumerate(nodes):
                sum_sim = 0.0
                for j in range(len(rows)):
                    if i != j:
                        sum_sim += float(similarity_matrix[i][j])
                node["score"] = sum_sim

            # Use UMAP with aggressive parameters to spread points far apart
            reducer = umap.UMAP(n_neighbors=2, min_dist=1e-5, spread=50.0, random_state=None)
            coords_2d = reducer.fit_transform(embeddings)

            xs = coords_2d[:, 0]
            ys = coords_2d[:, 1]
            x_min, x_max = float(xs.min()), float(xs.max())
            y_min, y_max = float(ys.min()), float(ys.max())
            width_range = x_max - x_min
            height_range = y_max - y_min

            # Normalize to [0,1] then multiply by a large scale factor (30) for a huge layout.
            scale_factor = 30.0
            for i, node in enumerate(nodes):
                norm_x = (xs[i] - x_min) / width_range
                norm_y = (ys[i] - y_min) / height_range
                node["x"] = float(norm_x * scale_factor)
                node["y"] = float(norm_y * scale_factor)
                # Add a slight random offset
                offset = 0.1
                node["x"] += random.uniform(-offset, offset)
                node["y"] += random.uniform(-offset, offset)

            # Build links with a higher threshold (0.75) for fewer connections
            threshold = 0.3
            for i in range(len(rows)):
                for j in range(i+1, len(rows)):
                    sim = float(similarity_matrix[i][j])
                    if sim >= threshold:
                        links.append({
                            "source": rows[i][0],
                            "target": rows[j][0],
                            "similarity": sim
                        })

    return render_template(
        'index.html',
        user_dream=user_dream,
        top_similar=top_similar,
        nodes=nodes,
        links=links,
        new_dream_id=new_dream_id
    )

if __name__ == '__main__':
    app.run(debug=True)