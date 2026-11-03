# syntax=docker/dockerfile:1
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
    git \
    build-essential \
    unixodbc \
    unixodbc-dev \
    openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Trust the Intel corporate CA only when intel-ca.crt is present in the build
# context (needed inside Intel networks). On external hosts the file is absent,
# so the install step is skipped and the public CA bundle is used.
RUN --mount=type=bind,target=/build-context \
    if [ -f /build-context/intel-ca.crt ]; then \
      cp /build-context/intel-ca.crt /usr/local/share/ca-certificates/intel-ca.crt \
      && update-ca-certificates; \
    else \
      echo "intel-ca.crt not in build context; skipping corporate CA install"; \
    fi

COPY requirements.txt /app/requirements.txt

RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -r requirements.txt

# Optional internal-only package, installed from the NYRA git repository (the
# devpi index is gone). Leave NYRA_PACKAGE_URL empty on external hosts to skip
# the install; the chat endpoint then returns a clean error until the package
# and NYRA_API_KEY are configured. Private repo: build with --secret id=nyra_git_token.
ARG NYRA_PACKAGE_URL=git+https://mfg-github.mfg.intel.com/intel-manufacturing/applications.manufacturing.intel.common.imi.api.nyra.nyra-services.git@main
RUN --mount=type=secret,id=nyra_git_token,required=false \
    if [ -z "${NYRA_PACKAGE_URL}" ]; then \
      echo "NYRA_PACKAGE_URL is empty; skipping nyra-services install"; \
    elif [ -s /run/secrets/nyra_git_token ]; then \
      NYRA_GIT_TOKEN="$(cat /run/secrets/nyra_git_token)" GIT_TERMINAL_PROMPT=0 \
        GIT_CONFIG_COUNT=1 \
        GIT_CONFIG_KEY_0="credential.https://mfg-github.mfg.intel.com.helper" \
        GIT_CONFIG_VALUE_0='!f() { echo username=x-access-token; echo "password=$NYRA_GIT_TOKEN"; }; f' \
        uv pip install --system --native-tls "${NYRA_PACKAGE_URL}" \
        || echo "WARNING: nyra-services install failed (private repo needs credentials); chat will be disabled. Provide a token via --secret id=nyra_git_token or set NYRA_PACKAGE_URL= to skip."; \
    else \
      GIT_TERMINAL_PROMPT=0 uv pip install --system --native-tls "${NYRA_PACKAGE_URL}" \
        || echo "WARNING: nyra-services install failed (private repo needs credentials); chat will be disabled. Provide a token via --secret id=nyra_git_token or set NYRA_PACKAGE_URL= to skip."; \
    fi

COPY . /app

EXPOSE 8004

# Run the application
CMD ["uvicorn", "main:app", "--port", "8004", "--host", "0.0.0.0", "--workers", "1"]
