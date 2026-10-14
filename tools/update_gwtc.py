import json
import os
import urllib.request
from datetime import date

URL = "https://gwosc.org/eventapi/json/GWTC/"
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "data", "gwtc.json")

# (short key, GWOSC field, keep asymmetric errors?)
FIELDS = [
    ("m1", "mass_1_source", True), ("m2", "mass_2_source", True),
    ("mc", "chirp_mass_source", True), ("mt", "total_mass_source", True),
    ("mf", "final_mass_source", True), ("chi", "chi_eff", True),
    ("dl", "luminosity_distance", True), ("z", "redshift", True),
    ("snr", "network_matched_filter_snr", False), ("far", "far", False),
    ("pa", "p_astro", False),
]


def compact(v):
    row = {"n": v["commonName"], "gps": v["GPS"], "cat": v["catalog.shortName"],
           "url": v["jsonurl"].replace("/eventapi/json/", "/eventapi/html/")}
    for key, field, errs in FIELDS:
        row[key] = v.get(field)
        if errs and v.get(field) is not None:
            row[key + "_lo"] = v.get(field + "_lower")
            row[key + "_hi"] = v.get(field + "_upper")
    return row


def main():
    with urllib.request.urlopen(URL, timeout=60) as r:
        events = json.load(r)["events"]
    rows = sorted((compact(v) for v in events.values()), key=lambda x: x["gps"])
    out = {"source": URL, "fetched": date.today().isoformat(), "events": rows}
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {len(rows)} events to {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
