from datetime import date

from app.providers.inaturalist import parse_sightings

COUNTS = {
    "total_results": 2,
    "results": [
        {
            "count": 4,
            "taxon": {
                "id": 49557,
                "name": "Lagodon rhomboides",
                "preferred_common_name": "Pinfish",
                "default_photo": {
                    "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg",
                    "license_code": "cc-by-nc",
                    "attribution": "(c) Someone, some rights reserved (CC BY-NC)",
                },
            },
        },
        {
            "count": 2,
            "taxon": {
                "id": 47912,
                "name": "Synodus foetens",
                "preferred_common_name": "Inshore Lizardfish",
                "default_photo": {
                    "url": "https://x/photos/2/square.jpg",
                    "license_code": None,
                },
            },
        },
    ],
}

OBSERVATIONS = {
    "results": [
        {
            "id": 414963814,
            "uri": "https://www.inaturalist.org/observations/414963814",
            "observed_on": "2026-11-15",
            "location": "34.3506,-77.6449",
            "place_guess": "Topsail Beach, NC, US",
            "taxon": {
                "name": "Sciaenops ocellatus",
                "preferred_common_name": "Red Drum",
            },
            "photos": [
                {
                    "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/9/square.jpg",
                    "license_code": "cc-by",
                    "attribution": "(c) Jenn, some rights reserved (CC BY)",
                }
            ],
        },
        {"id": 1, "observed_on": None, "location": "bad", "taxon": {}},
    ]
}


def test_parse_sightings_keeps_only_licensed_photos_and_measures_distance() -> None:
    result = parse_sightings(COUNTS, OBSERVATIONS, 34.21, -77.80)
    assert result.total_species == 2 and result.days == 60
    pinfish, lizardfish = result.species
    assert (pinfish.name, pinfish.count) == ("Pinfish", 4)
    assert pinfish.photo_url and pinfish.photo_url.endswith("/small.jpg")
    assert pinfish.photo_credit and "CC BY-NC" in pinfish.photo_credit
    # All rights reserved: no photo shown.
    assert (lizardfish.photo_url, lizardfish.photo_credit) == (None, None)
    # The malformed observation is skipped, not guessed.
    (drum,) = result.recent
    assert (drum.name, drum.observed_on, drum.place) == (
        "Red Drum",
        date(2026, 11, 15),
        "Topsail Beach, NC, US",
    )
    assert 10 < drum.distance_miles < 14
