import os

import requests

DEFAULT_OLLAMA_MODEL = "llama3.2:3b"


DEFAULT_NUM_CTX = 8192


class LLMError(RuntimeError):
    """Raised when the model can't be reached or returns something unusable."""

def provider() -> str:
    """Return the configured LLM provider name, lowercased ("ollama" when unset)."""
    return os.getenv("LLM_PROVIDER", "ollama").lower()


def generate(
    prompt: str,
    system: str = "",
    max_tokens: int = 1024,
    json_mode: bool = False,
    context: str = "",
    timeout: float | None = None,
) -> str:
    """Ask the active provider for a completion.

    max_tokens caps the length of the reply on every provider.
    json mode will constrain the reply to valid JSON where the provider supports it. Small local models ignore
    "return JSON only" often enough that this will matter.
    context is a large block that stays the same across calls (such as sermon transcripts). It is sent
    before the prompt, and Anthropic caches it so repeated calls with the same context cost less.
    timeout, in seconds, bounds one call; None keeps each provider's default."""

    name = provider()
    if name == "ollama":
        if context:
            prompt = f"{context}\n\n{prompt}"
        return _ollama(prompt, system, json_mode, max_tokens, timeout)
    if name == "anthropic":
        return _anthropic(prompt, system, max_tokens, context, timeout)
    raise LLMError(f"Unsupported LLM provider: {name!r} (use 'ollama' or 'anthropic')")


def _ollama(
    prompt: str,
    system: str = "",
    json_mode: bool = False,
    max_tokens: int = 1024,
    timeout: float | None = None,
) -> str:
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
        # num_predict is Ollama's output token cap, so max_tokens limits both providers.
        "options": {"num_ctx": num_ctx, "num_predict": max_tokens},
    }
    if json_mode:
        payload["format"] = "json"
    try:
        r = requests.post(f"{url}/api/chat", json=payload, timeout=timeout or 300)
        r.raise_for_status()
        content = r.json()["message"]["content"]
    except requests.RequestException as e:
        raise LLMError(f"Ollama request failed ({url}, model {model}): {e}") from e
    except (KeyError, TypeError) as e:
        # A proxy error page or an API change can return JSON without message.content.
        # Callers only handle LLMError, so a bare KeyError would read as a code bug.
        raise LLMError(f"Ollama returned an unexpected reply (model {model})") from e
    if not isinstance(content, str):
        raise LLMError(f"Ollama returned an unexpected reply (model {model})")
    return content.strip()


def _anthropic(
    prompt: str, system: str, max_tokens: int, context: str = "", timeout: float | None = None
) -> str:
    model = os.getenv("LLM_MODEL")
    if not model:
        raise LLMError("LLM_MODEL must be set when LLM_PROVIDER=anthropic")

    try:
        import anthropic
    except ImportError as e:
        raise LLMError("Run 'poetry add anthropic' to use LLM_PROVIDER=anthropic") from e

    # With a timeout, allow one retry (for a brief overload) so the worst case stays near
    # twice the timeout. Without one, keep the SDK defaults for long background jobs.
    client = (
        anthropic.Anthropic(timeout=timeout, max_retries=1)
        if timeout is not None
        else anthropic.Anthropic()
    )
    content: str | list[dict] = prompt
    if context:
        # The context block ends the cached prefix (system prompt plus context), so later
        # turns that reuse it read it from Anthropic's prompt cache instead of paying full price.
        content = [
            {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": prompt},
        ]
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.APIError as e:
        raise LLMError(f"Anthropic request failed (model {model}): {e}") from e

    if not msg.content:
        raise LLMError("Anthropic returned an empty response")
    # Newer models can send other blocks first, such as a thinking block, so join only the
    # text blocks. A reply with no text at all (for example only a tool_use block) is an error.
    text = "".join(
        getattr(block, "text", "") for block in msg.content if getattr(block, "type", None) == "text"
    ).strip()
    if not text:
        kinds = ", ".join(sorted({getattr(block, "type", "unknown") for block in msg.content}))
        raise LLMError(f"Anthropic returned no text (blocks: {kinds})")
    return text
