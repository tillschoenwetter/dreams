from flask import Flask

# Create a tiny test app
app = Flask(__name__)

@app.route("/")
def home():
    return "✅ Hello from your Mac! If you see this, the network works!"

@app.route("/ping")
def ping():
    return "📡 Pong! Your phone reached Flask."

if __name__ == "__main__":
    # Run on ALL network interfaces, port 5050 so it doesn’t conflict with anything
    app.run(host="0.0.0.0", port=5050, debug=True)