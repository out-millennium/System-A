FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN addgroup --system app && adduser --system --ingroup app app \
  && chown -R app:app /app
# The entrypoint repairs ownership of an existing named volume, then drops to
# the unprivileged app user before starting Uvicorn.
ENTRYPOINT ["python", "/app/entrypoint.py"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=4).status==200 else 1)"
