import os
import json
import asyncio
import webbrowser
import threading
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from langchain_core.messages import AIMessage

# Load env before importing main (which loads dotenv)
os.environ.setdefault("PYTHONPATH", os.path.dirname(__file__))

# Import the chain from main.py
from main import chain, history, HumanMessage

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: open browser after a short delay
    def open_browser():
        time.sleep(1.5)  # Wait for server to be ready
        webbrowser.open("http://localhost:8000")

    threading.Thread(target=open_browser, daemon=True).start()
    yield
    # Shutdown (cleanup if needed)


app = FastAPI(title="Chatbot", lifespan=lifespan)

# CORS (not strictly needed since frontend served from same origin, but kept for flexibility)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str


async def generate_stream(message: str):
    """Stream tokens from the chain.

    Each token is sent as JSON ({"t": "<token>"}) because plain SSE data
    drops trailing newlines, which breaks markdown tables and lists.
    """
    history.append(HumanMessage(content=message))
    full_response = ""

    try:
        # astream keeps the event loop free while tokens arrive.
        # If your chain has no async support, LangChain falls back to a thread.
        async for chunk in chain.astream({
            "question": message,
            "history": history,
        }):
            if chunk:
                full_response += chunk
                yield {"data": json.dumps({"t": chunk})}

        history.append(AIMessage(content=full_response))

    except asyncio.CancelledError:
        # User pressed Stop (client disconnected): keep the partial answer
        if full_response:
            history.append(AIMessage(content=full_response))
        else:
            history.pop()  # drop the unanswered question
        raise

    except Exception as e:
        history.pop()  # don't leave an unanswered question in memory
        yield {"event": "error", "data": json.dumps({"t": str(e)})}


@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """Stream chat response via SSE."""
    return EventSourceResponse(generate_stream(request.message))


@app.post("/reset")
async def reset_chat():
    """Clear conversation memory (used by the New chat button)."""
    history.clear()
    return {"status": "ok"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


# Serve frontend static files (JS, CSS, etc.)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def serve_index():
    """Serve the main HTML page."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    print("\nStarting Chatbot Server...")
    print("Opening browser at http://localhost:8000")
    print("Press Ctrl+C to stop\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)