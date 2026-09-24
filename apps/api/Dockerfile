FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Applies pending Alembic migrations against the `forecast` schema (see
# apps/api/README.md's "Local dev" section for the role/schema this
# expects DATABASE_URL to already point at), then starts the app.
# Idempotent: a schema already at head is a no-op.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
