from flask import Flask, request, jsonify, send_file
import json
import os

app = Flask(__name__)
DATA_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "data", "latest.json"))

@app.route('/')
def home():
    return send_file("index.html")

@app.route('/weather', methods=['POST'])
def weather():
    try:
        with open(DATA_FILE, "r") as f:
            all_data = json.load(f)
        print("LOADED FROM FILE:", all_data)
    except Exception as e:
        print("Error loading file:", e)
        all_data = {}

    data = request.get_json()
    icaos = data.get("airports", [])
    response = {}
    for icao in icaos:
        response[icao] = all_data.get(icao, {
            "category": "N/A",
            "metar": "N/A",
            "metar_time": "N/A",
            "next_metar": "N/A",
            "taf_time": "N/A",
            "next_taf": "N/A"
        })
    return jsonify(response)

if __name__ == "__main__":
    print("Using JSON file at:", DATA_FILE)
    app.run(debug=True)
