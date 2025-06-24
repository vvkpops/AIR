import requests, time, json
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

ICAO_CODES = ["CYYZ", "CYUL", "CYHZ"]

def fetch(code, source):
    url = "https://aviationweather.gov/adds/dataserver_current/httpparam"
    params = {
        "dataSource": source,
        "requestType": "retrieve",
        "format": "xml",
        "stationString": code,
        "hoursBeforeNow": 1,
        "mostRecent": "true"
    }
    try:
        res = requests.get(url, params=params, timeout=10)
        return res.text
    except Exception as e:
        print(f"Error fetching {source} for {code}: {e}")
        return ""

def extract_value(xml, tag):
    try:
        root = ET.fromstring(xml)
        return root.find(f".//{tag}").text
    except:
        return "N/A"

def extract_metar_text(xml):
    try:
        root = ET.fromstring(xml)
        return root.find(".//raw_text").text
    except:
        return "N/A"

def classify(text):
    if "OVC" in text or "BKN" in text:
        if any(x in text for x in ["002", "004", "005"]):
            return "LIFR"
        elif "010" in text:
            return "IFR"
        elif "020" in text or "030" in text:
            return "MVFR"
    return "VFR"

def to_zulu(dtstr):
    try:
        dt = datetime.strptime(dtstr, "%Y-%m-%dT%H:%M:%SZ")
        return dt.strftime("%H:%M")
    except:
        return "N/A"

def next_hour(dtstr):
    try:
        dt = datetime.strptime(dtstr, "%Y-%m-%dT%H:%M:%SZ")
        return (dt + timedelta(hours=1)).strftime("%H:%M")
    except:
        return "N/A"

def next_taf_time(dtstr):
    try:
        dt = datetime.strptime(dtstr, "%Y-%m-%dT%H:%M:%SZ")
        hour = ((dt.hour // 6) + 1) * 6 % 24
        next_time = dt.replace(hour=hour, minute=0) + timedelta(hours=(6 if hour <= dt.hour else 0))
        return next_time.strftime("%H:%M")
    except:
        return "N/A"

def update_weather():
    results = {}
    for code in ICAO_CODES:
        metar_xml = fetch(code, "metars")
        taf_xml = fetch(code, "tafs")
        metar_text = extract_metar_text(metar_xml)
        metar_time = extract_value(metar_xml, "issue_time")
        taf_time = extract_value(taf_xml, "issue_time")
        cat = classify(metar_text)
        results[code] = {
            "category": cat,
            "metar": metar_text,
            "metar_time": to_zulu(metar_time),
            "next_metar": next_hour(metar_time),
            "taf_time": to_zulu(taf_time),
            "next_taf": next_taf_time(taf_time)
        }
    with open("data/latest.json", "w") as f:
        json.dump(results, f)
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    while True:
        update_weather()
        time.sleep(60)
