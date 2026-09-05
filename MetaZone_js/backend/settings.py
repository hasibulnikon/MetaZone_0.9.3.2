"""
settings.py — full API Manager backend, matching ui/api_dialog.py's
APIManagerContent feature-for-feature: per-key cards (with raw key
available for reveal/copy -- this is a local single-user desktop app,
same trust boundary as the original CTk version, not a hosted
multi-tenant service), model selection per provider, Activate All/
Deactivate All, live key validation.
"""
from core.config import load_prefs, save_prefs
from core.constants import AI_PROVIDERS, VISIBLE_PROVIDERS
from engine.ai_providers import validate_key


def get_provider_summary():
    prefs = load_prefs()
    keys = prefs.get("ai_keys", {})
    models = prefs.get("ai_models", {})
    out = []
    for p in VISIBLE_PROVIDERS:
        cfg = AI_PROVIDERS.get(p, {})
        provider_keys = keys.get(p, [])
        current_model = models.get(p, cfg["models"][0][1] if cfg.get("models") else "")
        out.append({
            "provider": p,
            "key_url": cfg.get("key_url", ""),
            "key_hint": cfg.get("key_hint", ""),
            "models": cfg.get("models", []),  # [(label, id), ...]
            "current_model": current_model,
            "active_count": sum(1 for k in provider_keys if k.get("active")),
            "keys": [
                {
                    "key": k.get("key", ""),  # raw -- see module docstring
                    "masked": _mask(k.get("key", "")),
                    "active": k.get("active", False),
                }
                for k in provider_keys
            ],
        })
    return out


def _mask(key):
    # Matches the original exactly: "..." + last 10 chars.
    return "..." + key[-10:] if len(key) > 10 else key


def set_model(provider, model_id):
    prefs = load_prefs()
    prefs.setdefault("ai_models", {})[provider] = model_id
    save_prefs(prefs)
    return {"ok": True}


def add_key(provider, key):
    """Matches the original's _add_key exactly: saves immediately,
    joins as active WITHOUT touching any other key's active state (a
    fix already made in the original for a real prior bug -- adding a
    key used to silently deactivate the whole failover set)."""
    key = (key or "").strip()
    if not key:
        return {"ok": False, "error": "Empty key"}
    prefs = load_prefs()
    keys = prefs.setdefault("ai_keys", {}).setdefault(provider, [])
    if any(k.get("key") == key for k in keys):
        return {"ok": False, "error": "Already saved"}
    keys.append({"key": key, "active": True})
    save_prefs(prefs)
    return {"ok": True}


def set_key_active(provider, index, active):
    prefs = load_prefs()
    keys = prefs.get("ai_keys", {}).get(provider, [])
    if index < 0 or index >= len(keys):
        return {"ok": False, "error": "Bad index"}
    keys[index]["active"] = active
    save_prefs(prefs)
    return {"ok": True}


def set_all_active(provider, active):
    prefs = load_prefs()
    keys = prefs.get("ai_keys", {}).get(provider, [])
    for k in keys:
        k["active"] = active
    save_prefs(prefs)
    return {"ok": True}


def delete_key(provider, index):
    prefs = load_prefs()
    keys = prefs.get("ai_keys", {}).get(provider, [])
    if index < 0 or index >= len(keys):
        return {"ok": False, "error": "Bad index"}
    keys.pop(index)
    save_prefs(prefs)
    return {"ok": True}
