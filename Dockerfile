FROM python:3.14.0-slim

WORKDIR /app

COPY requirements.lock pyproject.toml README.md ./
COPY grudge ./grudge
COPY scripts ./scripts
COPY tests ./tests
COPY examples ./examples
COPY scars ./scars
COPY docs ./docs
COPY Progress.md ./Progress.md

RUN python -m pip install --no-cache-dir -r requirements.lock \
    && python -m pip install --no-cache-dir --no-deps -e .

CMD ["python", "-m", "grudge", "--help"]
