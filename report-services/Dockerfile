FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Diubah ke 8000 agar sinkron dengan port jalannya Flask di app.py
EXPOSE 8000

CMD ["python", "app.py"]