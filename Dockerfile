# 网站镜像：只含网站代码和知识点 Markdown。
# 题库图片（content/）和学习数据（data/）通过卷挂载，见 docker-compose.yml。
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Asia/Shanghai \
    DGY_CONTENT_DIR=/app/content \
    DGY_DATA_DIR=/app/data \
    DGY_KNOWLEDGE_DIR=/app/knowledge-md

WORKDIR /app
COPY requirements-web.txt .
RUN pip install --no-cache-dir -r requirements-web.txt

COPY dgy ./dgy
COPY knowledge-md ./knowledge-md

EXPOSE 8000
CMD ["python", "-m", "dgy", "--host", "0.0.0.0", "--port", "8000"]
