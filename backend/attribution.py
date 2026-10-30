from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from shapely.geometry import Point, Polygon


def load_ais_tracks():
    # Replace with your real AIS source:
    # CSV, PostgreSQL, TimescaleDB, Kafka consumer, etc.
    df = pd.read_csv("ais_processed_sample.csv")

    required = {
        "mmsi", "vessel_name", "timestamp", "latitude", "longitude",
        "sog", "cog", "ship_type"
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing AIS columns: {missing}")

    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    return df


def bbox_polygon(bbox):
    west, south, east, north = bbox
    return Polygon([
        (west, south),
        (east, south),
        (east, north),
        (west, north),
        (west, south),
    ])


def rank_responsible_vessels(bbox, spill_centroid, detection_time, max_hours=48):
    ais = load_ais_tracks()
    area = bbox_polygon(bbox)

    start = detection_time - timedelta(hours=max_hours)
    end = detection_time + timedelta(hours=6)

    nearby = ais[
        (ais["timestamp"] >= start)
        & (ais["timestamp"] <= end)
    ].copy()

    candidates = []

    for mmsi, group in nearby.groupby("mmsi"):
        group = group.sort_values("timestamp")
        points = [Point(x, y) for x, y in zip(group["longitude"], group["latitude"])]

        entered_area = any(area.buffer(0.02).contains(p) for p in points)

        if not entered_area:
            continue

        distances = []
        for _, row in group.iterrows():
            distance = np.hypot(
                row["longitude"] - spill_centroid[0],
                row["latitude"] - spill_centroid[1],
            )
            distances.append(distance)

        min_distance = min(distances)
        closest_index = int(np.argmin(distances))
        closest_row = group.iloc[closest_index]

        time_gap_hours = abs(
            (closest_row["timestamp"] - detection_time).total_seconds()
        ) / 3600

        # Simple explainable score: closer and more recent = higher suspicion.
        distance_score = np.exp(-min_distance / 0.15)
        time_score = np.exp(-time_gap_hours / 12)
        speed_penalty = 1.0 if closest_row["sog"] > 0.5 else 0.6

        suspicion_score = 100 * distance_score * time_score * speed_penalty

        candidates.append({
            "mmsi": str(mmsi),
            "vessel_name": str(closest_row.get("vessel_name", "Unknown")),
            "ship_type": str(closest_row.get("ship_type", "Unknown")),
            "closest_distance_deg": round(float(min_distance), 5),
            "time_gap_hours": round(float(time_gap_hours), 2),
            "speed_at_closest_approach": float(closest_row["sog"]),
            "suspicion_score": round(float(suspicion_score), 2),
        })

    candidates.sort(key=lambda x: x["suspicion_score"], reverse=True)
    return candidates[:20]