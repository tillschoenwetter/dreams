from flask import Flask, render_template, request, redirect, url_for, make_response
import sqlite3
import numpy as np
from sentence_transformers import SentenceTransformer, util
import umap
import random
import os
import json
from datetime import datetime

app = Flask(__name__)
model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')  # Larger, better at paraphrasing
DEFAULT_THRESHOLD = 0.3

def preprocess_dream(text):
    return text.strip()

def init_db():
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS dreams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            timestamp TEXT,
            location TEXT,
            embedding TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def build_constellation(threshold=DEFAULT_THRESHOLD):
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    c.execute("SELECT id, text, embedding FROM dreams")
    rows = c.fetchall()
    conn.close()

    if not rows:
        return "<h2>No dreams yet. Be the first to submit one!</h2>"

    dream_texts = [preprocess_dream(r[1]) for r in rows]
    embeddings = [json.loads(r[2]) for r in rows]

    nodes = [{"id": r[0], "text": r[1]} for r in rows]
    similarity_matrix = util.cos_sim(embeddings, embeddings).cpu().numpy()

    for i, node in enumerate(nodes):
        sum_sim = sum(float(similarity_matrix[i][j]) for j in range(len(rows)) if i != j)
        node["score"] = sum_sim

    reducer = umap.UMAP(
        n_neighbors=15,  # Look at more neighbors
        min_dist=0.1,    # Allow more spacing
        spread=1.0,      # Reduce the spread
        metric='cosine'  # Use same metric as similarity calculation
    )
    coords_2d = reducer.fit_transform(embeddings)

    xs, ys = coords_2d[:, 0], coords_2d[:, 1]
    x_min, x_max = float(xs.min()), float(xs.max())
    y_min, y_max = float(ys.min()), float(ys.max())
    width_range = x_max - x_min
    height_range = y_max - y_min

    scale_factor = 30.0
    for i, node in enumerate(nodes):
        norm_x = (xs[i] - x_min) / width_range
        norm_y = (ys[i] - y_min) / height_range
        node["x"] = float(norm_x * scale_factor) + random.uniform(-0.1, 0.1)
        node["y"] = float(norm_y * scale_factor) + random.uniform(-0.1, 0.1)

    links = []
    threshold = DEFAULT_THRESHOLD
    for i in range(len(rows)):
        for j in range(i+1, len(rows)):
            sim = float(similarity_matrix[i][j])
            if sim >= threshold:
                links.append({
                    "source": rows[i][0],
                    "target": rows[j][0],
                    "similarity": sim
                })

    # Add initial similar dreams data
    first_dream = rows[0]
    first_embedding = json.loads(first_dream[2])
    cosine_scores = util.cos_sim(first_embedding, embeddings)[0]
    top_similar = [
        (rows[i][0], rows[i][1], float(cosine_scores[i]))
        for i in range(len(rows)) if rows[i][0] != first_dream[0]
    ]
    top_similar.sort(key=lambda x: x[2], reverse=True)
    top_similar = top_similar[:4]

    return nodes, links, top_similar




@app.route('/all_dreams')
def all_dreams():
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    c.execute("SELECT id, text, timestamp, location FROM dreams")
    rows = c.fetchall()
    conn.close()

    dream_list = "<h1>All Dreams</h1><ul>"
    for dream_id, dream_text, dream_time, dream_location in rows:
        dream_list += f'''
        <li>
            <strong>ID {dream_id}:</strong> {dream_text}<br>
            <small><em>{dream_time or "?"} from {dream_location or "unknown"}</em></small>
            <form action="/delete_dream/{dream_id}" method="POST" style="display:inline;">
                <button type="submit">Delete</button>
            </form>
        </li>
        '''
    dream_list += "</ul>"
    return dream_list

@app.route('/delete_dream/<int:dream_id>', methods=['POST'])
def delete_dream(dream_id):
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    c.execute("DELETE FROM dreams WHERE id = ?", (dream_id,))
    conn.commit()
    conn.close()
    return redirect(url_for('all_dreams'))

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        user_dream = request.form['dream'].strip()
        user_location = request.form.get('location', 'unknown')
        user_timestamp = datetime.utcnow().isoformat()

        if user_dream:
            new_embedding = model.encode(preprocess_dream(user_dream)).tolist()
            conn = sqlite3.connect("dreams.db")
            c = conn.cursor()
            c.execute("INSERT INTO dreams (text, timestamp, location, embedding) VALUES (?, ?, ?, ?)",
                      (user_dream, user_timestamp, user_location, json.dumps(new_embedding)))
            new_dream_id = c.lastrowid
            conn.commit()
            conn.close()

            return redirect(url_for('submitted', dream_id=new_dream_id))
    
    # Add this line to ensure spinner is hidden on direct visits
    response = make_response(render_template('index.html', user_dream=None))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/submitted/<int:dream_id>')
def submitted(dream_id):
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    c.execute("SELECT id, text, embedding FROM dreams")
    rows = c.fetchall()
    conn.close()

    if not rows:
        return redirect(url_for('index'))

    embeddings = [json.loads(r[2]) for r in rows]
    dream_texts = [preprocess_dream(r[1]) for r in rows]

    new_dream = next((r for r in rows if r[0] == dream_id), None)
    if not new_dream:
        return redirect(url_for('index'))

    new_embedding = json.loads(new_dream[2])

    cosine_scores = util.cos_sim(new_embedding, embeddings)[0]
    similarities = [
        (rows[i][0], rows[i][1], float(cosine_scores[i]))
        for i in range(len(rows)) if rows[i][0] != dream_id
    ]
    similarities.sort(key=lambda x: x[2], reverse=True)
    top_similar = similarities[:4]

    nodes = [{"id": r[0], "text": r[1]} for r in rows]
    similarity_matrix = util.cos_sim(embeddings, embeddings).cpu().numpy()

    for i, node in enumerate(nodes):
        sum_sim = sum(float(similarity_matrix[i][j]) for j in range(len(rows)) if i != j)
        node["score"] = sum_sim

    reducer = umap.UMAP(
        n_neighbors=15,  # Look at more neighbors
        min_dist=0.1,    # Allow more spacing
        spread=1.0,      # Reduce the spread
        metric='cosine'  # Use same metric as similarity calculation
    )
    coords_2d = reducer.fit_transform(embeddings)

    xs, ys = coords_2d[:, 0], coords_2d[:, 1]
    x_min, x_max = float(xs.min()), float(xs.max())
    y_min, y_max = float(ys.min()), float(ys.max())
    width_range = x_max - x_min
    height_range = y_max - y_min

    scale_factor = 30.0
    for i, node in enumerate(nodes):
        norm_x = (xs[i] - x_min) / width_range
        norm_y = (ys[i] - y_min) / height_range
        node["x"] = float(norm_x * scale_factor) + random.uniform(-0.1, 0.1)
        node["y"] = float(norm_y * scale_factor) + random.uniform(-0.1, 0.1)

    links = []
    threshold = DEFAULT_THRESHOLD
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
        user_dream="submitted",
        top_similar=top_similar,
        nodes=nodes,
        links=links,
        new_dream_id=dream_id
    )

# @app.route('/explore')
# def explore():
#     nodes, links, top_similar = build_constellation()
    # conn = sqlite3.connect("dreams.db")
    # c = conn.cursor()
    # c.execute("SELECT id, text, embedding FROM dreams")
    # rows = c.fetchall()
    # conn.close()

    # if not rows:
    #     return "<h2>No dreams yet. Be the first to submit one!</h2>"

    # dream_texts = [preprocess_dream(r[1]) for r in rows]
    # embeddings = [json.loads(r[2]) for r in rows]

    # nodes = [{"id": r[0], "text": r[1]} for r in rows]
    # similarity_matrix = util.cos_sim(embeddings, embeddings).cpu().numpy()

    # for i, node in enumerate(nodes):
    #     sum_sim = sum(float(similarity_matrix[i][j]) for j in range(len(rows)) if i != j)
    #     node["score"] = sum_sim

    # reducer = umap.UMAP(
    #     n_neighbors=15,  # Look at more neighbors
    #     min_dist=0.1,    # Allow more spacing
    #     spread=1.0,      # Reduce the spread
    #     metric='cosine'  # Use same metric as similarity calculation
    # )
    # coords_2d = reducer.fit_transform(embeddings)

    # xs, ys = coords_2d[:, 0], coords_2d[:, 1]
    # x_min, x_max = float(xs.min()), float(xs.max())
    # y_min, y_max = float(ys.min()), float(ys.max())
    # width_range = x_max - x_min
    # height_range = y_max - y_min

    # scale_factor = 30.0
    # for i, node in enumerate(nodes):
    #     norm_x = (xs[i] - x_min) / width_range
    #     norm_y = (ys[i] - y_min) / height_range
    #     node["x"] = float(norm_x * scale_factor) + random.uniform(-0.1, 0.1)
    #     node["y"] = float(norm_y * scale_factor) + random.uniform(-0.1, 0.1)

    # links = []
    # threshold = DEFAULT_THRESHOLD
    # for i in range(len(rows)):
    #     for j in range(i+1, len(rows)):
    #         sim = float(similarity_matrix[i][j])
    #         if sim >= threshold:
    #             links.append({
    #                 "source": rows[i][0],
    #                 "target": rows[j][0],
    #                 "similarity": sim
    #             })

    # # Add initial similar dreams data
    # first_dream = rows[0]
    # first_embedding = json.loads(first_dream[2])
    # cosine_scores = util.cos_sim(first_embedding, embeddings)[0]
    # top_similar = [
    #     (rows[i][0], rows[i][1], float(cosine_scores[i]))
    #     for i in range(len(rows)) if rows[i][0] != first_dream[0]
    # ]
    # top_similar.sort(key=lambda x: x[2], reverse=True)
    # top_similar = top_similar[:4]

@app.route('/explore')
def explore():
    nodes, links, top_similar = build_constellation()
    return render_template(
        'index.html',          # pagina con form/constellazione
        user_dream="explore",  # (serve al template)
        nodes=nodes,
        links=links,
        top_similar=top_similar,
        new_dream_id=None
    )


@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404

@app.route("/telescope")
def telescope():
    nodes, links, top_similar = build_constellation()
    # note: we’re feeding the real data, not empty lists
    return render_template(
        "telescope.html",
        nodes=nodes,
        links=links,
        new_dream_id=None,
        top_similar=[]
    )


if __name__ == '__main__':
    app.run(debug=True)
