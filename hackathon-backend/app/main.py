"""FastAPI app factory: wires CORS and all routers together."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALLOWED_ORIGINS
from app.routers import chat, health, pdsolutions, product_basis, pypcs, solutions

app = FastAPI(
    title="Quality Matrix Multi-Module API",
    version="1.0.0",
    description="No-auth GitHub-ready API for STHI, LCBI product basic info and module solutions.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(product_basis.router)
app.include_router(solutions.router)
app.include_router(pdsolutions.router)
app.include_router(pypcs.router)
app.include_router(chat.router)
