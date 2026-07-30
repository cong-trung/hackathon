FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG FTP_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG ftp_proxy
ARG no_proxy

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV FTP_PROXY=${FTP_PROXY}
ENV NO_PROXY=${NO_PROXY}
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
ENV ftp_proxy=${ftp_proxy}
ENV no_proxy=${no_proxy}

ENV UV_NO_DEV=1
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    bash \
    build-essential \
    unixodbc \
    unixodbc-dev \
    openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt

RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -r requirements.txt

COPY . /app

EXPOSE 8004

# Run the application
CMD ["uvicorn", "main:app", "--port", "8004", "--host", "0.0.0.0", "--workers", "4"]
