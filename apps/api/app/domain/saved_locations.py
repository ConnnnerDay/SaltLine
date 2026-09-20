"""Saved locations (sprint 37) -- the last item in
`docs/product-definition.md`'s "V1 capabilities" preferences list ("...
and a small ordered list of saved locations"), split out of sprint 36's
table rather than folded into it.

Ownership model per the round-2 product decision on record
(`docs/CANONICAL_ROADMAP.md`): "the most likely ~$1/month lever is
saved-location count: free tier is capped at 1 saved (home) location...
Sprint 37 should build the ownership model so a cap/limit field is
natural to add later, without committing to billing now." Read
literally: this sprint builds the *ownership model* (one row per
user per location, `user_id` indexed, ordered by save time), not the
cap itself -- enforcing a limit now would be inventing a billing-
adjacent product decision (what happens at the cap? an error? a
paywall prompt?) nothing on record actually answers yet. `MAX_FREE_TIER_LOCATIONS`
is kept as a named constant precisely so that a future sprint can wire
an actual enforcement point to it without re-discovering the number.

"Ordered" is insertion order (`saved_at`), not a user-reorderable
position field: the acceptance bar names "ordered favorites,
ownership, duplicates, deletion, empty state" -- nothing about drag-
reorder, which would be a real, separate UI feature to design, not an
implementation detail of this one.

Duplicates: a unique constraint on (user_id, location_id) makes
`POST`ing the same location twice a real, enforced 409, not just a
client-side nicety.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infra.database import Base

# Informative only -- see module docstring. Not enforced anywhere yet.
MAX_FREE_TIER_LOCATIONS = 1


class SavedLocation(Base):
    """No foreign key to `UserPreferences`: `user_id` is Better Auth's
    opaque id, the same un-keyed reference `UserPreferences.user_id`
    itself is (ADR-006 -- this service never owns the real `User` row to
    reference). A `UserPreferences` row also isn't guaranteed to exist
    yet for a given user (`GET /v1/me/preferences` returns defaults
    without inserting one) -- a saved location shouldn't be blocked on a
    user having touched preferences first.
    """

    __tablename__ = "saved_location"
    __table_args__ = (UniqueConstraint("user_id", "location_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    location_id: Mapped[str] = mapped_column(String)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SavedLocationOut(BaseModel):
    """`location_id`'s display fields (`name`/`state`/`lat`/`lng`) are
    resolved fresh at read time via the same `resolve_location_id` every
    forecast lookup uses, not stored and left to go stale -- a curated
    location's own name/state never changes, but resolving live keeps
    this one code path instead of two ways to know a location's name.
    """

    id: int
    location_id: str
    name: str
    state: str
    lat: float
    lng: float
    saved_at: datetime
