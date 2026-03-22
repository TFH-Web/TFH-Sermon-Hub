from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("meta.html")

@app.route("/about")
def about():
    return "<h1>About Page<>/h1><p>This is simple.</p>"

if __name__ == "__main__":
    app.run(debug=True)