from flask import Flask, render_template, request, redirect, url_for, make_response, jsonify
import sqlite3
import numpy as np
from sentence_transformers import SentenceTransformer, util
import umap
import random
import os
import json
from datetime import datetime
import openai  # Add this import
import qrcode
import io
import base64

# DEBUG REMINDER, IF NOTHING WORKS CHECK THE END OF THE SCRIPT

app = Flask(__name__)
model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')  # Larger, better at paraphrasing
DEFAULT_THRESHOLD = 0.5

# Add OpenAI configuration
openai.api_key = "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"

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
        'index.html',          # page with form/constellazione
        user_dream="explore",  # (its' necessary for the template)
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

@app.route("/about")
def about():
    return render_template('about.html')

@app.route("/live")
def live():
    """Real-time view of new dreams as they are submitted"""
    return render_template('live.html')

def analyze_dreams_with_llm():
    """Analyze the latest dream in context of all other dreams using OpenAI's API"""
    try:
        # Get all dreams from database
        conn = sqlite3.connect("dreams.db")
        c = conn.cursor()
        c.execute("SELECT text FROM dreams ORDER BY id DESC")  # Get ALL dreams, newest first
        dreams = c.fetchall()
        conn.close()
        
        if not dreams:
            return "No dreams to analyze yet."
        
        if len(dreams) == 1:
            return f"This is the first dream in the collection. More dreams from other dreamers are needed for contextual analysis."
        
        # Separate the latest dream from the rest
        latest_dream = dreams[0][0]  # Most recent dream
        other_dreams = [dream[0] for dream in dreams[1:]]  # All other dreams
        
        # Prepare the dreams text for analysis
        other_dreams_text = "\n\n".join([f"Dream {i+1}: {dream}" for i, dream in enumerate(other_dreams)])
        
        # Check if the text is too long for OpenAI's token limits
        max_chars = 20000  # Leave more room for the latest dream and prompt
        
        if len(other_dreams_text) > max_chars:
            # If too long, take a representative sample from different time periods
            total_other_dreams = len(other_dreams)
            # Take some recent ones, some from middle, and some old ones
            recent = other_dreams[:15]  # Recent dreams (excluding the very latest)
            middle_start = total_other_dreams // 2 - 8
            middle_end = total_other_dreams // 2 + 8
            middle = other_dreams[middle_start:middle_end] if middle_start > 15 and total_other_dreams > 30 else []
            oldest = other_dreams[-8:] if total_other_dreams > 25 else []
            
            # Combine samples
            sampled_dreams = recent + middle + oldest
            other_dreams_text = "\n\n".join([f"Dream {i+1}: {dream}" for i, dream in enumerate(sampled_dreams)])
            other_dreams_text += f"\n\n[Context based on {len(sampled_dreams)} representative dreams from a total of {total_other_dreams} previous dreams from different dreamers]"
        
        # Create the updated prompt focusing on the dreambank nature
        prompt = f"""You are analyzing a dreambank - a collection of dreams submitted anonymously by many different people from around the world. Each dream represents a unique individual's subconscious experience.

LATEST DREAM (submitted by a new dreamer):
{latest_dream}

PREVIOUS DREAMS (from the dreambank, submitted by other dreamers):
{other_dreams_text}

Analyze how this newest dream relates to the collective patterns, themes, and symbols present in the dreambank. Consider what this dream reveals about shared human experiences, common anxieties, or universal symbols that appear across different dreamers. Focus on connections and contrasts between this individual's subconscious and the broader collective unconscious represented in the dreambank."""
        
        # Initialize OpenAI client with the new syntax
        from openai import OpenAI
        client = OpenAI(api_key="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")
        
        # Make API call to OpenAI using new syntax
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are an expert dream analyst specializing in collective dream analysis. You analyze individual dreams in the context of a diverse dreambank containing dreams from many different people worldwide. Identify patterns in the collective unconscious, shared symbols, and how individual dreams connect to universal human experiences. Provide your analysis in exactly 3 sentences."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=250,  # Slightly more tokens for contextual analysis
            temperature=0.7
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        print(f"Error analyzing dreams with LLM: {e}")
        return f"Dream analysis temporarily unavailable. Error: {str(e)}"

@app.route("/api/latest_dream")
def latest_dream():
    """API endpoint to get the latest dream with its similar dreams"""
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    c.execute("SELECT id, text, timestamp, embedding FROM dreams ORDER BY id DESC LIMIT 1")
    latest = c.fetchone()
    
    if not latest:
        conn.close()
        return jsonify({"error": "No dreams found"})
    
    dream_id, dream_text, timestamp, embedding_str = latest
    
    # Get all dreams for similarity calculation
    c.execute("SELECT id, text, embedding FROM dreams")
    all_dreams = c.fetchall()
    conn.close()
    
    if len(all_dreams) < 2:
        return jsonify({
            "id": dream_id,
            "text": dream_text,
            "timestamp": timestamp,
            "similar_dreams": [],
            "llm_analysis": analyze_dreams_with_llm()  # Add LLM analysis
        })
    
    # Calculate similarities
    embeddings = [json.loads(r[2]) for r in all_dreams]
    latest_embedding = json.loads(embedding_str)
    
    cosine_scores = util.cos_sim(latest_embedding, embeddings)[0]
    similarities = [
        {
            "id": all_dreams[i][0], 
            "text": all_dreams[i][1], 
            "similarity": float(cosine_scores[i])
        }
        for i in range(len(all_dreams)) 
        if all_dreams[i][0] != dream_id
    ]
    
    # Sort by similarity and get top 5
    similarities.sort(key=lambda x: x['similarity'], reverse=True)
    top_similar = similarities[:5]
    
    return jsonify({
        "id": dream_id,
        "text": dream_text,
        "timestamp": timestamp,
        "similar_dreams": top_similar,
        "llm_analysis": analyze_dreams_with_llm()  # Add LLM analysis
    })

@app.route("/api/dream_analysis")
def dream_analysis():
    """Dedicated endpoint for getting LLM analysis"""
    return jsonify({"analysis": analyze_dreams_with_llm()})

@app.route("/api/dream_count")
def dream_count():
    """Get total number of dreams for polling comparison"""
    conn = sqlite3.connect("dreams.db")
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM dreams")
    count = c.fetchone()[0]
    conn.close()
    return jsonify({"count": count})

@app.route("/api/live_constellation")
def live_constellation():
    """Get constellation data for live page"""
    nodes, links, top_similar = build_constellation()
    return jsonify({
        "nodes": nodes,
        "links": links
    })

@app.route("/api/qr_code")
def generate_qr_code():
    """Generate QR code for dreamatlas.cloud"""
    try:
        # Create QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data("https://dreamatlas.cloud")
        qr.make(fit=True)
        
        # Create QR code image
        img = qr.make_image(fill_color="white", back_color="transparent")
        
        # Convert to base64 for web display
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        img_str = base64.b64encode(buffer.getvalue()).decode()
        
        return jsonify({
            "qr_code": f"data:image/png;base64,{img_str}"
        })
        
    except Exception as e:
        print(f"Error generating QR code: {e}")
        return jsonify({"error": "QR code generation failed"})

if __name__ == '__main__':
    # app.run(debug=True) # run this for the usual 127.0.0.1:5000
    app.run(host="0.0.0.0", port=5050, debug=True) # run this for local network hosted server (your_IP:5050)

