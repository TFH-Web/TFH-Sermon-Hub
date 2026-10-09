import os

import requests

DEFAULT_OLLAMA_MODEL = "llama3.2:3b"


DEFAULT_NUM_CTX = 8192


class LLMError(RuntimeError):
    """Raised when the model can't be reached or returns something unusable."""

def generate (prompt: str, system: str = "", max_tokens: int = 1024, json_mode: bool = False) -> str:
    """Ask the active provider for a completion. 
    
    json mode will constrain the reply to valid JSON where the provider supports it. Small local models ignore
    "return JSON only" often enough that this will matter."""

    provider = os.getenv("LLM_PROVIDER", "ollama").lower()
    if provider == "ollama":
        return _ollama(prompt, system, json_mode)
    if provider == "anthropic":
        return _anthropic(prompt, system, max_tokens)
    raise LLMError(f"Unsupported LLM provider: {provider!r} (use 'ollama')")


def _ollama(prompt: str, system: str = "", json_mode: bool = False) -> str:
    url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    model = os.getenv("LLM_MODEL", DEFAULT_OLLAMA_MODEL)
    num_ctx = int(os.getenv("OLLAMA_NUM_CTX", DEFAULT_NUM_CTX))
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload = {
        "model": model,
        "stream": False,
        "messages": messages,
        "options": {"num_ctx": num_ctx},
    }
    if json_mode:
        payload["format"] = "json"
    try:
        r = requests.post(f"{url}/api/chat", json=payload, timeout=300)
        r.raise_for_status()
        return r.json()["message"]["content"].strip()
    except requests.RequestException as e:
        raise LLMError(f"Ollama request failed ({url}, model {model}): {e}") from e


def _anthropic(prompt: str, system: str, max_tokens: int) -> str:
    model = os.getenv("LLM_MODEL")
    if not model:
        raise LLMError("LLM_MODEL must be set when LLM_PROVIDER=anthropic")

    try:
        import anthropic
    except ImportError as e:
        raise LLMError("Run 'poetry add anthropic' to use LLM_PROVIDER=anthropic") from e

    client = anthropic.Anthropic()
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError as e:
        raise LLMError(f"Anthropic request failed (model {model}): {e}") from e

    if not msg.content:
        raise LLMError("Anthropic returned an empty response")
    return msg.content[0].text.strip()