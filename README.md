# 🤖 AI Web Chatbot

A streaming chatbot with markdown rendering, skeleton loading, and dark/light themes. Built with **FastAPI + LangChain (NVIDIA Nemotron)** backend and **vanilla HTML/CSS/JS** frontend.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Streaming Responses** | Real-time token delivery via Server-Sent Events (SSE) |
| **Markdown Rendering** | Tables, code blocks, lists, blockquotes, headers, inline code |
| **Skeleton Loading** | Shimmer animation while waiting for first token |
| **Dark/Light Theme** | Persisted in localStorage, auto-detects system preference |
| **Clean UI** | Avatars (U/A), message bubbles, responsive layout |
| **Single Command Launch** | `python server.py` → auto-opens browser |

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- NVIDIA API key (for Nemotron model)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd Chatbots

# Install dependencies
pip install -r requirements.txt

# Set your NVIDIA API key
echo "NVIDIA_API_KEY=your_key_here" > .env

# Run the server
python server.py
```

The browser will automatically open at **http://localhost:0000**

## 📁 Project Structure

```
Chatbots/
├── main.py              # LangChain chain definition (CLI + importable)
├── server.py            # FastAPI server with SSE streaming + static file serving
├── requirements.txt     # Python dependencies
├── .env                 # Environment variables (NVIDIA_API_KEY)
└── frontend/
    ├── index.html       # Main chat page
    ├── style.css        # Themes, markdown styles, skeleton animation
    └── app.js           # Streaming logic, markdown rendering (marked.js)
```

## 🔧 Configuration

### Environment Variables (`.env`)
```env
NVIDIA_API_KEY=your_nvidia_api_key
```

### Model Settings (in `main.py`)
```python
llm = ChatNVIDIA(
    model="nvidia/nemotron-3-ultra-550b-a55b",
    temperature=0
)
```

## 🎨 UI Preview

### Light Theme
- Clean white background
- Blue user bubbles, gray assistant bubbles
- Syntax-highlighted code blocks

### Dark Theme
- Dark gray background (`#111827`)
- Optimized contrast for all markdown elements
- One-click toggle in header

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `sse-starlette` | Server-Sent Events |
| `langchain` | LLM orchestration |
| `langchain-nvidia-ai-endpoints` | NVIDIA Nemotron integration |
| `python-dotenv` | Environment management |
| `marked.js` (CDN) | Markdown parsing in browser |

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/chat` | Stream chat response (SSE) |
| `GET` | `/health` | Health check |
| `GET` | `/` | Serve frontend HTML |
| `GET` | `/static/*` | Serve CSS/JS assets |

## 💡 Usage Examples

### Compare Two Concepts
> **User:** "Compare REST vs GraphQL in a table"

> **Assistant:** Renders a markdown table with proper formatting

### Code Explanation
> **User:** "Show me a Python decorator example"

> **Assistant:** Renders syntax-highlighted code block

### Structured Explanation
> **User:** "Explain how transformers work with headers and lists"

> **Assistant:** Renders hierarchical markdown with headers, bullets, blockquotes

## 🛠 Development

### Run CLI Version
```bash
python main.py
```

### Run Server Only (no browser auto-open)
```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

### Frontend Development
The frontend is served from `/static` - edit files in `frontend/` and refresh browser.

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [NVIDIA Nemotron](https://www.nvidia.com/en-us/research/nemotron/) for the LLM
- [LangChain](https://langchain.com/) for orchestration
- [FastAPI](https://fastapi.tiangolo.com/) for the web framework
- [marked.js](https://marked.js.org/) for markdown rendering