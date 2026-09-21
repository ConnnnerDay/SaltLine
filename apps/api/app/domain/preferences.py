"""User preferences (sprint 36) -- the `GET`/`PATCH /v1/me/preferences`
pair sprint 25's own docstring already named in the required API surface
and deliberately left unbuilt ("need Better Auth + Postgres, neither
exists yet"). Both now exist (sprint 28, this sprint's own Postgres
wiring), so this is that deferred piece, not new API-surface scope.

Field set is deliberately narrower than `v2/backend/app/models/profile.py`
(gear limitations, accessibility needs, target species, experience level,
theme): `docs/R1_RECONCILIATION_AUDIT.md` names that file as the starting
spec for this sprint but flags it needs re-validation, and
`docs/product-definition.md`'s "V1 capabilities" list is explicit --
"Units, fishing style, wind threshold, surf threshold, default location,
and a small ordered list of saved locations." The list's last item
(saved locations) is sprint 37's own table, not this one's. Anything
broader than this named list would be adding v1 scope indirectly inside
an implementation sprint, which `docs/product-definition.md`'s own
"Explicit non-goals" section says requires a real product decision, not
an agent's guess.

`fishing_style` is a free string, not a fixed enum: the legacy app's own
README only ever gestures at examples ("surf, pier, kayak, etc."), never
a closed vocabulary, and this field isn't consumed by any scoring logic
yet (species/rig scoring is still the deferred "full species experience"
per the roadmap) -- inventing a fixed enum now would be a real, unasked
product decision. `wind_threshold`/`surf_threshold` are always stored in
canonical units (kt/ft, matching `ForecastConditions.wind_range_kt`/
`wave_range_ft`) regardless of the *display* `units` preference, so
threshold comparisons never need a conversion step.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field
from sqlalchemy import CheckConstraint, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.infra.database import Base


class DisplayUnits(str, Enum):
    IMPERIAL = "imperial"
    METRIC = "metric"


class UserPreferences(Base):
    """One row per Better Auth user id. `user_id` is Better Auth's opaque
    stable id (ADR-005) -- this table never stores an email, password, or
    session token; ADR-006 draws that line at the schema/role level too
    (this connection has no grant on `apps/web`'s `auth` schema at all).
    """

    __tablename__ = "user_preferences"
    __table_args__ = (
        # Sprint 46 (database resilience): `PreferencesUpdate.units` is
        # already a closed `DisplayUnits` enum at the API layer, but
        # that only guards requests that go through this router -- a
        # future script or migration writing this table directly has
        # no such guard. A CHECK constraint is defense-in-depth, not a
        # duplicate of the Pydantic validation it mirrors.
        CheckConstraint(
            "units IN ('imperial', 'metric')", name="ck_user_preferences_units"
        ),
    )

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    units: Mapped[str] = mapped_column(String, default=DisplayUnits.IMPERIAL.value)
    fishing_style: Mapped[str | None] = mapped_column(String, nullable=True)
    wind_threshold_kt: Mapped[float | None] = mapped_column(Float, nullable=True)
    surf_threshold_ft: Mapped[float | None] = mapped_column(Float, nullable=True)
    default_location_id: Mapped[str | None] = mapped_column(String, nullable=True)


class PreferencesOut(BaseModel):
    """Response shape. Always returns a full object, even for a user with
    no row yet (sprint 36's endpoint creates one with these same
    defaults on first read) -- a `404` for "no preferences set yet" would
    make every new user's first `GET` an error case for no real reason.
    """

    units: DisplayUnits = DisplayUnits.IMPERIAL
    fishing_style: str | None = None
    wind_threshold_kt: float | None = None
    surf_threshold_ft: float | None = None
    default_location_id: str | None = None


class PreferencesUpdate(BaseModel):
    """`PATCH` body -- every field optional and omitted fields are left
    unchanged (a real partial update, not a `PUT`-style full replace).
    `None` is a meaningful, distinct value from "omitted": it clears a
    previously-set threshold/style/default location, which is why every
    field below is `T | None` rather than plain `T` with an implicit
    can't-unset gap. `exclude_unset=True` at the call site is what
    reads that distinction back out of the request body.
    """

    units: DisplayUnits | None = None
    fishing_style: str | None = None
    wind_threshold_kt: float | None = Field(default=None, ge=0, le=100)
    surf_threshold_ft: float | None = Field(default=None, ge=0, le=60)
    default_location_id: str | None = None
