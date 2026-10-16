FROM python:3.11.11-slim

WORKDIR /app

COPY requirements.lock pyproject.toml README.md ./
COPY grudge ./grudge
COPY scripts ./scripts
COPY tests ./tests

RUN python -m pip install --no-cache-dir -r requirements.lock \
    && python -m pip install --no-cache-dir --no-deps -e .

CMD ["python", "-m", "grudge", "--help"]
