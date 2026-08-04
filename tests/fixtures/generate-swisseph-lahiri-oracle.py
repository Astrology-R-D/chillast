r"""Regenerate the offline Lahiri oracle with the independent Python binding.

PowerShell:
  python -m pip install --require-hashes --no-binary=:all: --target "$env:TEMP\pyswisseph-oracle" -r tests/fixtures/pyswisseph-oracle-requirements.txt
  $env:PYTHONPATH="$env:TEMP\pyswisseph-oracle"; python tests/fixtures/generate-swisseph-lahiri-oracle.py
"""

import importlib.metadata
import json
from pathlib import Path

import swisseph as swe


ROOT = Path(__file__).resolve().parents[2]
EPHEMERIS_PATH = ROOT / "assets" / "ephemeris"
FLAGS = swe.FLG_SWIEPH | swe.FLG_SPEED
SIDEREAL_FLAGS = FLAGS | swe.FLG_SIDEREAL


def julian_day(year, month, day, hour=0):
    return swe.julday(year, month, day, hour)


def positions(jd, latitude, longitude, sidereal):
    flags = SIDEREAL_FLAGS if sidereal else FLAGS
    house_flags = swe.FLG_SIDEREAL if sidereal else 0
    angles = swe.houses_ex(jd, latitude, longitude, b"P", house_flags)[1]
    return {
        "sun": swe.calc_ut(jd, swe.SUN, flags)[0][0],
        "moon": swe.calc_ut(jd, swe.MOON, flags)[0][0],
        "ascendant": angles[0],
        "midheaven": angles[1],
    }


swe.set_ephe_path(str(EPHEMERIS_PATH))
swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
instant = julian_day(2000, 1, 1, 12)
latitude = 51.4779
longitude = 0
tropical = positions(instant, latitude, longitude, False)
sidereal = positions(instant, latitude, longitude, True)

fixture = {
    "source": {
        "package": "pyswisseph",
        "packageVersion": importlib.metadata.version("pyswisseph"),
        "swissEphemerisVersion": swe.version,
        "url": "https://pypi.org/project/pyswisseph/2.10.3.2/",
        "sdistSha256": "c54c305e83dbd5d2b71e58d8a69d8ee41de24c4d3328ce09e2af860a3537624d",
        "commands": {
            "install": "python -m pip install --require-hashes --no-binary=:all: --target \"$env:TEMP\\pyswisseph-oracle\" -r tests/fixtures/pyswisseph-oracle-requirements.txt",
            "generate": "$env:PYTHONPATH=\"$env:TEMP\\pyswisseph-oracle\"; python tests/fixtures/generate-swisseph-lahiri-oracle.py",
        },
    },
    "applicationSwissEphemerisVersion": "2.09.03",
    "siderealMode": "SE_SIDM_LAHIRI",
    "instantUtc": "2000-01-01T12:00:00.000Z",
    "coordinates": {"latitude": latitude, "longitude": longitude},
    "maximumAngularError": 0.01,
    "ayanamsha": (tropical["sun"] - sidereal["sun"]) % 360,
    "tropical": tropical,
    "sidereal": sidereal,
    "boundary": {
        "beforeUtc": "2026-04-14T00:00:00.000Z",
        "beforeSun": swe.calc_ut(julian_day(2026, 4, 14), swe.SUN, SIDEREAL_FLAGS)[0][0],
        "afterUtc": "2026-04-15T00:00:00.000Z",
        "afterSun": swe.calc_ut(julian_day(2026, 4, 15), swe.SUN, SIDEREAL_FLAGS)[0][0],
    },
}

print(json.dumps(fixture, indent=2))
