#!/usr/bin/env python3
"""
Hermes brain sidecar for OpenCluely.

OpenCluely (Electron) delegates all reasoning to Hermes (the brain). This sidecar
instantiates Hermes' AIAgent ONCE (a warm session for low latency) and answers
queries over a line-delimited JSON protocol on stdin/stdout.

Protocol (one JSON object per line):
  IN  : {"type":"ask","id":N,"text":"...","image_path":"/tmp/..png"|null,"mode":"chat|transcription|image"}
  IN  : {"type":"ping","id":N}
  IN  : {"type":"reset"}                # clear meeting conversation continuity
  OUT : {"type":"ready","model":...,"provider":...}
  OUT : {"type":"startup_error","error":"..."}
  OUT : {"type":"token","id":N,"data":"..."}     # streamed text deltas
  OUT : {"type":"final","id":N,"response":"...","metadata":{...}}
  OUT : {"type":"error","id":N,"error":"..."}
  OUT : {"type":"pong","id":N}

IMPORTANT: any library noise on stdout would corrupt the protocol, so we move
sys.stdout to stderr and write the protocol to the saved real stdout fd.

The sidecar keeps the conversation history internally so OpenCluely never has to
ship large (image-bearing) message lists back and forth.

Requirements: Hermes' `run_agent` must be importable (set PYTHONPATH to the
hermes-agent repo via the launcher when needed).
"""

import sys
import os
import re
import json
import base64
import datetime
import traceback

# --- Protect the protocol channel: library prints must not hit real stdout ---
_real_stdout = sys.stdout
sys.stdout = sys.stderr


def emit(obj):
    _real_stdout.write(json.dumps(obj) + "\n")
    _real_stdout.flush()


def _data_url_for_image(image_path):
    with open(image_path, "rb") as f:
        raw = f.read()
    ext = os.path.splitext(image_path)[1].lower()
    mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _resolve_vault_path():
    """Where to write meeting notes. Prefer OBSIDIAN_VAULT_PATH (env), then the
    same var in ~/.hermes/.env (Hermes' Obsidian skill reads it there), else the
    default vault under ~/Documents."""
    v = (os.environ.get("OBSIDIAN_VAULT_PATH") or "").strip()
    if v:
        return os.path.expanduser(v)
    hermes_env = os.path.expanduser("~/.hermes/.env")
    try:
        with open(hermes_env, "r", encoding="utf-8") as f:
            for ln in f:
                ln = ln.strip()
                if ln.startswith("OBSIDIAN_VAULT_PATH"):
                    val = ln.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        return os.path.expanduser(val)
    except Exception:  # noqa: BLE001
        pass
    return os.path.expanduser("~/Documents/Obsidian Vault")


def _sanitize_filename(name):
    name = (name or "Reunión").strip()
    name = re.sub(r'[\\/:*?"<>|]+', " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name[:80] or "Reunión"


def _format_transcript_md(transcript):
    """transcript: [{label, text, timestamp}] -> diarized markdown lines."""
    lines = []
    for item in transcript or []:
        label = item.get("label") or item.get("speaker") or "?"
        text = (item.get("text") or "").strip()
        if not text:
            continue
        ts = item.get("timestamp") or ""
        hhmm = ""
        try:
            hhmm = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime("%H:%M")
        except Exception:  # noqa: BLE001
            hhmm = ""
        prefix = f"**[{hhmm}] {label}:**" if hhmm else f"**{label}:**"
        lines.append(f"{prefix} {text}")
    return "\n\n".join(lines)


def save_meeting(agent, msg):
    """Write a diarized meeting note (+ Hermes summary) to the Obsidian vault.
    IN: {"type":"save_meeting","id":N,"title":"...","transcript":[{label,text,timestamp}],
         "started_at":iso,"ended_at":iso}
    OUT: {"type":"meeting_saved","id":N,"path":"..."}  or  {"type":"error",...}"""
    transcript = msg.get("transcript") or []
    if not transcript:
        emit({"type": "error", "id": msg.get("id"), "error": "transcripción vacía; nada que guardar"})
        return

    now = datetime.datetime.now()
    title = msg.get("title") or f"Reunión {now.strftime('%Y-%m-%d %H:%M')}"
    transcript_md = _format_transcript_md(transcript)

    # Ask Hermes for a concise summary. Use a throwaway history so meeting
    # continuity (the live chat) is not polluted by the summarization turn.
    summary = ""
    try:
        prompt = (
            "Resume la siguiente transcripción de reunión (hablantes: Yo / Interlocutor). "
            "Devuelve en español: un párrafo de resumen, luego '## Puntos clave' como viñetas, "
            "y '## Tareas / Acción' como viñetas con responsable si se infiere. Sé conciso.\n\n"
            + transcript_md
        )
        result = agent.run_conversation(prompt, conversation_history=[])
        if isinstance(result, dict):
            summary = result.get("final_response") or ""
        else:
            summary = str(result or "")
    except Exception as e:  # noqa: BLE001
        summary = f"(No se pudo generar el resumen automático: {e})"

    started = msg.get("started_at") or ""
    ended = msg.get("ended_at") or now.isoformat()
    front = [
        "---",
        f"title: {title}",
        f"date: {now.strftime('%Y-%m-%d')}",
        f"started: {started}",
        f"ended: {ended}",
        "source: Echo",
        "tags: [reunión, echo]",
        "---",
        "",
        f"# {title}",
        "",
        "## Resumen",
        summary.strip() or "(sin resumen)",
        "",
        "## Transcripción",
        transcript_md or "(sin transcripción)",
        "",
    ]
    content = "\n".join(front)

    try:
        vault = _resolve_vault_path()
        folder = os.path.join(vault, "Echo", "Reuniones")
        os.makedirs(folder, exist_ok=True)
        base = f"{now.strftime('%Y-%m-%d')} - {_sanitize_filename(title)}"
        path = os.path.join(folder, base + ".md")
        if os.path.exists(path):
            path = os.path.join(folder, base + f" {now.strftime('%H%M')}.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        emit({"type": "meeting_saved", "id": msg.get("id"), "path": path})
    except Exception as e:  # noqa: BLE001
        emit({"type": "error", "id": msg.get("id"), "error": f"no se pudo escribir la nota: {e}"})


def build_user_message(text, image_path):
    """Plain string for text-only; OpenAI-style content parts when an image is attached."""
    if image_path and os.path.exists(image_path):
        return [
            {"type": "text", "text": text or "Analiza la imagen adjunta."},
            {"type": "image_url", "image_url": {"url": _data_url_for_image(image_path)}},
        ]
    return text or ""


def main():
    # Construct the Hermes agent once (warm session), resolving the provider/model
    # EXACTLY like the Hermes CLI one-shot path (hermes_cli.oneshot._run_agent) does.
    # A bare AIAgent() does NOT read the configured model/provider — you must resolve
    # the runtime provider and pass base_url/provider/api_mode/credential_pool/model.
    try:
        from run_agent import AIAgent
        from hermes_cli.config import load_config
        from hermes_cli.runtime_provider import resolve_runtime_provider
        from hermes_cli.tools_config import _get_platform_tools
    except Exception as e:  # noqa: BLE001
        emit({"type": "startup_error", "error": f"cannot import Hermes modules: {e}"})
        return

    try:
        cfg = load_config()
        mc = cfg.get("model") or {}
        if isinstance(mc, dict):
            cfg_model = mc.get("default") or mc.get("model") or ""
        else:
            cfg_model = mc or ""

        env_model = (os.environ.get("HERMES_BRIDGE_MODEL") or "").strip()
        effective_model = env_model or cfg_model
        requested_provider = (os.environ.get("HERMES_BRIDGE_PROVIDER") or "").strip() or None

        runtime = resolve_runtime_provider(
            requested=requested_provider,
            target_model=effective_model or None,
        )

        # Optional api_mode override. resolve_runtime_provider() picks
        # codex_responses for direct api.openai.com URLs, but gpt-4o rejects
        # the Responses API ("Encrypted content is not supported"). OpenCluely
        # sets HERMES_BRIDGE_API_MODE=chat_completions so vision works.
        env_api_mode = (os.environ.get("HERMES_BRIDGE_API_MODE") or "").strip()
        effective_api_mode = env_api_mode or runtime.get("api_mode")

        try:
            toolsets_list = sorted(_get_platform_tools(cfg, "cli"))
        except Exception:
            toolsets_list = None

        agent = AIAgent(
            api_key=runtime.get("api_key"),
            base_url=runtime.get("base_url"),
            provider=runtime.get("provider"),
            api_mode=effective_api_mode,
            model=effective_model,
            enabled_toolsets=toolsets_list,
            quiet_mode=True,
            platform="cli",
            credential_pool=runtime.get("credential_pool"),
            save_trajectories=False,
        )
    except Exception as e:  # noqa: BLE001
        emit({"type": "startup_error", "error": f"AIAgent init failed: {e}\n{traceback.format_exc()}"})
        return

    emit({
        "type": "ready",
        "model": effective_model or "config-default",
        "provider": runtime.get("provider") or "config-default",
    })

    # Conversation continuity for the current meeting, owned by the sidecar.
    history = []

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:  # noqa: BLE001
            continue

        mtype = msg.get("type")

        if mtype == "ping":
            emit({"type": "pong", "id": msg.get("id")})
            continue

        if mtype == "reset":
            history = []
            continue

        if mtype == "save_meeting":
            save_meeting(agent, msg)
            continue

        if mtype != "ask":
            continue

        req_id = msg.get("id")
        text = msg.get("text", "")
        image_path = msg.get("image_path")

        try:
            user_message = build_user_message(text, image_path)

            def stream_cb(delta, _id=req_id):
                if delta:
                    emit({"type": "token", "id": _id, "data": delta})

            result = agent.run_conversation(
                user_message,
                conversation_history=history,
                stream_callback=stream_cb,
            )

            # Update internal history for meeting continuity.
            if isinstance(result, dict) and isinstance(result.get("messages"), list):
                history = result["messages"]

            response = ""
            metadata = {}
            if isinstance(result, dict):
                response = result.get("final_response") or ""
                metadata = {
                    "model": result.get("model"),
                    "provider": result.get("provider"),
                    "completed": result.get("completed"),
                    "total_tokens": result.get("total_tokens"),
                    "estimated_cost_usd": result.get("estimated_cost_usd"),
                }
            else:
                response = str(result)

            emit({"type": "final", "id": req_id, "response": response, "metadata": metadata})
        except Exception as e:  # noqa: BLE001
            emit({"type": "error", "id": req_id, "error": f"{e}"})


if __name__ == "__main__":
    main()
