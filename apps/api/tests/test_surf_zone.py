from app.providers.surf_zone import expand_ugc, parse_surf_zone_product

JAX = """FZUS52 KJAX 171848
SRFJAX

Surf Zone Forecast for Northeast Florida and Southeast Georgia

FLZ138-233-333-180900-
Flagler-St. Johns-
Including the beaches of Palm Coast, Ponte Vedra Beach, Vilano Beach,
and St. Augustine South
148 PM EST Tue Nov 17 2026

...HIGH SURF ADVISORY IN EFFECT UNTIL 7 PM EST FRIDAY...
...HIGH RIP CURRENT RISK IN EFFECT THROUGH FRIDAY EVENING...

.REST OF TODAY...
Rip Current Risk*...........High.
Surf Height.................4 to 6 feet.
Thunderstorm Potential**....None.
UV Index**..................Low.
Water Temperature...........70 to 75.
Weather.....................Cloudy. Showers likely and a slight
                            chance of thunderstorms.
Winds.......................Northeast winds around 15 mph.

.WEDNESDAY...
Rip Current Risk*...........High.
Surf Height.................7 to 8 feet.

.EXTENDED...
.THURSDAY...Surf height 8 to 10 feet. Cloudy, showers.
.FRIDAY...Surf height 7 to 9 feet. Mostly cloudy.

&&

Rip Current Risk Category
* Low Risk - The risk for rip currents is low.

$$

FLZ124>125-180900-
Nassau-Duval-
Including the beaches of Yulee, Fernandina Beach,
and Jacksonville Beach
148 PM EST Tue Nov 17 2026

.REST OF TODAY...
Rip Current Risk*...........Moderate.
Surf Height.................2 to 3 feet.

$$
"""

HFO = """HIZ006-007-009-032>035-181945-
Oahu-
840 AM HST Tue Nov 17 2026

__________________________________________________________________
                       Today                     Wednesday
Shores                  Surf                       Surf
                     AM     PM                  AM     PM
__________________________________________________________________

North Facing        7-10    6-8                 3-5    2-4
West Facing          3-5    2-4                 1-3    1-3
South Facing         1-3    1-3                 1-3    1-3
East Facing          5-7    5-7                 4-6    3-5

$$
"""


def test_expand_ugc_ranges_and_lists() -> None:
    assert expand_ugc("FLZ124>126-233-180900-") == {
        "FLZ124",
        "FLZ125",
        "FLZ126",
        "FLZ233",
    }
    assert expand_ugc("HIZ006-007-009-032>035-181945-") == {
        "HIZ006",
        "HIZ007",
        "HIZ009",
        "HIZ032",
        "HIZ033",
        "HIZ034",
        "HIZ035",
    }


def test_parse_segment_by_zone() -> None:
    srf = parse_surf_zone_product(JAX, "FLZ233", "JAX")
    assert srf is not None
    today, wed = srf.periods
    assert (today.name, today.rip_current_risk, today.surf_height) == (
        "Rest Of Today",
        "High",
        "4 to 6 feet",
    )
    assert (
        today.weather == "Cloudy. Showers likely and a slight chance of thunderstorms"
    )
    assert (today.uv_index, today.water_temperature, today.thunderstorm) == (
        "Low",
        "70 to 75",
        "None",
    )
    assert (wed.name, wed.surf_height) == ("Wednesday", "7 to 8 feet")
    assert [(d.name, d.surf_height) for d in srf.extended] == [
        ("Thursday", "8 to 10 feet"),
        ("Friday", "7 to 9 feet"),
    ]
    assert srf.headlines[0] == "High surf advisory in effect until 7 pm est friday"
    assert (
        srf.beaches
        == "Palm Coast, Ponte Vedra Beach, Vilano Beach, and St. Augustine South"
    )


def test_range_zone_and_name_fallback() -> None:
    by_zone = parse_surf_zone_product(JAX, "FLZ125", "JAX")
    assert by_zone is not None and by_zone.periods[0].rip_current_risk == "Moderate"
    # A spot whose point falls offshore (a marine zone) is matched by name.
    by_name = parse_surf_zone_product(
        JAX, "AMZ452", "JAX", ["Amelia Island / Fernandina Beach"]
    )
    assert by_name is not None and by_name.periods[0].surf_height == "2 to 3 feet"
    assert parse_surf_zone_product(JAX, "AMZ452", "JAX", ["Nowhere"]) is None


def test_hawaii_shore_table() -> None:
    srf = parse_surf_zone_product(HFO, "HIZ033", "HFO")
    assert srf is not None
    (today,) = srf.periods
    assert today.surf_height == (
        "North-facing shores 7-10 ft; West-facing shores 3-5 ft; "
        "South-facing shores 1-3 ft; East-facing shores 5-7 ft"
    )
