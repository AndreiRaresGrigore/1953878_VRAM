FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY db.py .
COPY evaluator.py .
COPY api.py .

# config.yaml is mounted from templates/ at runtime
# data volume for SQLite is mounted at /data

CMD ["python3", "main.py"]
