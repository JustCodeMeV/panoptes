# Sleuth tool server: the geo-sleuth scripts with every dependency, models and a browser baked in,
# so a cold start downloads nothing. Built by CI (Cloudflare Containers / any Docker host).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/opt/hf PLAYWRIGHT_BROWSERS_PATH=/opt/pw \
    SLEUTH_WORK_DIR=/tmp/sleuth PORT=8790
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements.txt \
    && python -m playwright install --with-deps chromium
# Model weights used by sat_scan.py (CLIP) and match.py (DINOv2), fetched at build time
RUN python -c "from transformers import CLIPModel, CLIPProcessor, CLIPTokenizer, AutoModel, AutoImageProcessor; \
[f('openai/clip-vit-base-patch32') for f in (CLIPModel.from_pretrained, CLIPProcessor.from_pretrained, CLIPTokenizer.from_pretrained)]; \
[f('facebook/dinov2-small') for f in (AutoModel.from_pretrained, AutoImageProcessor.from_pretrained)]"
ENV HF_HUB_OFFLINE=1

COPY server.py uv-shim ./
COPY geo-sleuth ./geo-sleuth
RUN useradd -m sleuth && mkdir -p /tmp/sleuth && chown sleuth /tmp/sleuth
USER sleuth
EXPOSE 8790
CMD ["python", "server.py"]
