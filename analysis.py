import cv2
import numpy as np


def analyze_mask(mask, probability, min_region_pixels=25):
    binary = (mask > 0).astype(np.uint8)

    component_count, labels, stats, centroids = (
        cv2.connectedComponentsWithStats(binary, connectivity=8)
    )

    regions = []

    for component_id in range(1, component_count):
        area = int(stats[component_id, cv2.CC_STAT_AREA])

        if area < min_region_pixels:
            continue

        component_mask = labels == component_id
        region_probability = probability[component_mask]

        x = int(stats[component_id, cv2.CC_STAT_LEFT])
        y = int(stats[component_id, cv2.CC_STAT_TOP])
        width = int(stats[component_id, cv2.CC_STAT_WIDTH])
        height = int(stats[component_id, cv2.CC_STAT_HEIGHT])

        regions.append(
            {
                "region_id": len(regions) + 1,
                "pixel_count": area,
                "bbox": {
                    "x": x,
                    "y": y,
                    "width": width,
                    "height": height,
                },
                "centroid": {
                    "x": float(centroids[component_id][0]),
                    "y": float(centroids[component_id][1]),
                },
                "mean_probability": float(region_probability.mean()),
                "max_probability": float(region_probability.max()),
            }
        )

    regions.sort(
        key=lambda region: region["pixel_count"],
        reverse=True,
    )

    return regions


def make_alert(regions, oil_pixel_fraction, threshold=0.20):
    if not regions:
        return {
            "alert_level": "none",
            "reason": "No sufficiently large oil-like region detected.",
        }

    largest = regions[0]

    size = largest["pixel_count"]
    confidence = largest["mean_probability"]

    if size >= 1000 and confidence >= 0.70:
        alert_level = "high"
    elif size >= 250 and confidence >= 0.55:
        alert_level = "medium"
    elif size >= 50:
        alert_level = "low"
    else:
        alert_level = "none"

    if alert_level == "none":
        reason = (
            "Candidate region was too small or had insufficient confidence."
        )
    else:
        reason = (
            f"{len(regions)} candidate region(s); "
            f"largest region has {size} pixels "
            f"and mean confidence {confidence:.3f}."
        )

    return {
        "alert_level": alert_level,
        "reason": reason,
        "largest_region": largest,
        "oil_pixel_fraction": oil_pixel_fraction,
        "threshold": threshold,
    }