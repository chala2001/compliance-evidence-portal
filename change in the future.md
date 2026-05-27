# Decision: DOM-Only Agent Mode (`use_vision=False`)

## What Changed

In `backend/app/agent/runner.py`:

```python
# Before
agent = Agent(task=prompt, llm=llm, browser=browser)

# After
agent = Agent(task=prompt, llm=llm, browser=browser, use_vision=False)
```

---

## Why

### How browser-use normally works

At every step, `browser-use` sends the LLM two things:
1. A **screenshot** of the current page (PNG image)
2. The **DOM** — a numbered list of all interactive elements

```
[1] <button> Sign In
[2] <input placeholder="Email">
[3] <a href="/forgot"> Forgot password?
```

The LLM reads both and decides what to do next.

### Why screenshots hurt small models

Screenshots are expensive in context:
- Each image consumes a large chunk of the context window
- Small models (qwen2.5:7b, llama3.x) have weak vision — they can't reliably interpret screenshots
- By Step 3–4, the context is exhausted and the model starts looping or hallucinating

With `use_vision=False`, the LLM receives only the DOM text — far fewer tokens, much easier to reason about.

### When DOM-only is sufficient

The DOM text alone is enough for:
- Standard buttons, forms, links
- Text content on the page
- Navigation through most cloud portal pages (Azure, AWS, ServiceNow)

### When you need vision back

Some situations require the screenshot:
- Canvas elements (charts, graphs rendered visually)
- Images with embedded text (CAPTCHAs, banners)
- CSS-only visual state (highlighted, error colours)
- Shadow DOM / iframes not exposed in the DOM tree
- Confirming a modal is open or a loading spinner has gone

---

## What `use_vision=False` Does Internally

From `browser_use/agent/service.py`:

```python
# Exclude screenshot tool when use_vision is not auto
exclude_actions = ['screenshot'] if use_vision != 'auto' else []
```

With `use_vision=False`:
- The screenshot **is still captured** at every step (for cloud sync / history)
- The screenshot is **not sent to the LLM** — only DOM text is sent
- `history.screenshots()` still works for our post-run screenshot save

---

## LLM Compatibility

| Provider | `use_vision=True` | `use_vision=False` |
|---|---|---|
| Gemini 2.0 Flash | ✅ full support | ✅ works, faster |
| Claude (Anthropic) | ✅ full support | ✅ works, faster |
| qwen2.5:7b (Ollama) | ⚠️ weak vision, often fails | ✅ more reliable |
| llama3.x (Ollama) | ⚠️ weak vision | ✅ more reliable |
| DeepSeek | ❌ not supported | ✅ required |

---

## Reverting

To re-enable vision (e.g. when switching to Gemini/Claude for complex tasks):

```python
agent = Agent(task=prompt, llm=llm, browser=browser, use_vision=True)
```

Or make it config-driven via `.env`:

```python
# backend/app/config.py
AGENT_USE_VISION: bool = False
```

```python
# runner.py
agent = Agent(task=prompt, llm=llm, browser=browser, use_vision=settings.AGENT_USE_VISION)
```

---

## Related

- `backend/app/agent/runner.py` — where the change lives
- `guides/stage-08-ai-agent.md` — full agent layer documentation
- `guides/decision-dom-only-agent.md` — this file
