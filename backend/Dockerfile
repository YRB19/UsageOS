FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn[standard]==0.32.0 \
    sqlalchemy==2.0.36 \
    alembic==1.13.3 \
    asyncpg==0.29.0 \
    psycopg2-binary==2.9.10 \
    pydantic==2.10.3 \
    pydantic-settings==2.6.1 \
    python-dotenv==1.0.1 \
    httpx==0.28.0 \
    python-multipart==0.0.12

COPY . .

RUN mkdir -p /app/alembic/versions /app/uploads/avatars

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]