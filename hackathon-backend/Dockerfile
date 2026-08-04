FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG FTP_PROXY
ARG NO_PROXY=.intel.com,intel.com,localhost,127.0.0.1
ARG http_proxy
ARG https_proxy
ARG ftp_proxy
ARG no_proxy=.intel.com,intel.com,localhost,127.0.0.1

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

# Place intel-ca.crt in build context (copy from /etc/ssl/certs/ca-certificates.crt on dev machine)
COPY intel-ca.crt /usr/local/share/ca-certificates/intel-ca.crt
RUN update-ca-certificates

COPY requirements.txt /app/requirements.txt

RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -r requirements.txt

RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --native-tls nyra-services --index-url https://devpi.intel.com/general/nyra/+simple/

COPY . /app

EXPOSE 8004

# Run the application
CMD ["uvicorn", "main:app", "--port", "8004", "--host", "0.0.0.0", "--workers", "4", "--env-file", ".env.production"]
