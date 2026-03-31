from flask import Flask, request, jsonify, render_template, send_from_directory
import uuid
import os

app = Flask(__name__)
                                                                                                        # In-memory DB
sermons_db = {}
                                                                                                        # AI processing placeholder
def process_sermon_ai(file_path: str):
    return {
        "transcript": "Generated transcript text...",
        "summary": "Generated summary...",
        "tags": ["faith", "grace", "purpose"]
    }

                                                                                                        # Routes
@app.route("/")
def portal():
    return render_template("Portal Prototype.html")

                                                                                                        # Upload sermon
@app.route("/upload-sermon", methods=["POST"])
def upload_sermon():
    sermon_id = str(uuid.uuid4())

    title = request.form.get("title")
    speaker = request.form.get("speaker")
    series = request.form.get("series")
    date = request.form.get("date")
    video_link = request.form.get("video_link")
    auto_ai = request.form.get("auto_ai", "true").lower() == "true"

    file = request.files.get("file")
    file_path = None

    if file:
        upload_dir = "uploads"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, f"{sermon_id}_{file.filename}")
        file.save(file_path)

    transcript, summary, tags = None, None, []

    if auto_ai and file_path:
        ai_result = process_sermon_ai(file_path)
        transcript = ai_result["transcript"]
        summary = ai_result["summary"]
        tags = ai_result["tags"]

    sermon = {
        "id": sermon_id,
        "title": title,
        "speaker": speaker,
        "series": series,
        "date": date,
        "video_link": video_link,
        "transcript": transcript,
        "summary": summary,
        "tags": tags
    }

    sermons_db[sermon_id] = sermon

    return jsonify({"status": "ok", "sermon": sermon})


                                                                                                        # Get all sermons
@app.route("/sermons", methods=["GET"])
def get_sermons():
    return jsonify(list(sermons_db.values()))


                                                                                                        # Get single sermon
@app.route("/sermon/<sermon_id>", methods=["GET"])
def get_sermon(sermon_id):
    sermon = sermons_db.get(sermon_id)
    if not sermon:
        return jsonify({"error": "Sermon not found"}), 404
    return jsonify(sermon)


                                                                                                        # Delete sermon
@app.route("/sermon/<sermon_id>", methods=["DELETE"])
def delete_sermon(sermon_id):
    if sermon_id in sermons_db:
        del sermons_db[sermon_id]
        return jsonify({"status": "deleted"})
    return jsonify({"error": "Sermon not found"}), 404

if __name__ == "__main__":
    app.run(debug=True)
