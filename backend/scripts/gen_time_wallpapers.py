"""One-time generator for the 4 time-of-day sky wallpapers (morning/afternoon/dusk/night).

Run ONCE. Output is committed as static app assets and cycled at runtime by the app
(no per-day AI calls). Regenerate manually only if you want new art.

    python scripts/gen_time_wallpapers.py
"""
import asyncio
import os
import base64
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

OUT_DIR = "/app/frontend/assets/wallpapers"
MODEL = "gemini-3.1-flash-image-preview"

PROMPTS = {
    "morning": (
        "A crisp photographic vertical phone wallpaper of an early morning sky just after sunrise. "
        "Soft pastel blue and warm peach gradient, gentle golden light near the horizon, a few calm "
        "wispy clouds, fresh and hopeful mood. No text, no people, no buildings. Clean minimal sky, "
        "smooth gradient, high resolution, tall 9:19 portrait aspect ratio."
    ),
    "afternoon": (
        "A crisp photographic vertical phone wallpaper of a bright clear afternoon sky. "
        "Vivid azure blue with soft white cumulus clouds and abundant daylight, cheerful and airy. "
        "No text, no people, no buildings. Clean minimal sky, smooth gradient, high resolution, "
        "tall 9:19 portrait aspect ratio."
    ),
    "dusk": (
        "A crisp photographic vertical phone wallpaper of a dusk sunset sky. "
        "Warm golden-orange fading into deep magenta and indigo, glowing horizon, serene golden-hour "
        "atmosphere with a few silhouetted thin clouds. No text, no people, no buildings. "
        "Smooth gradient, high resolution, tall 9:19 portrait aspect ratio."
    ),
    "night": (
        "A crisp photographic vertical phone wallpaper of a clear night sky. "
        "Deep navy to near-black gradient with a scatter of soft stars and a faint distant glow near "
        "the horizon, calm and restful. No text, no people, no buildings. Smooth gradient, "
        "high resolution, tall 9:19 portrait aspect ratio."
    ),
}


async def gen_one(name: str, prompt: str):
    api_key = os.getenv("EMERGENT_LLM_KEY")
    chat = LlmChat(api_key=api_key, session_id=f"wallpaper-{name}", system_message="You generate clean high-resolution wallpaper images.")
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    _text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not images:
        print(f"[{name}] NO IMAGE returned")
        return False
    img = images[0]
    data = base64.b64decode(img["data"])
    ext = "png" if "png" in img.get("mime_type", "") else "jpg"
    path = os.path.join(OUT_DIR, f"{name}.{ext}")
    with open(path, "wb") as f:
        f.write(data)
    print(f"[{name}] saved {path} ({len(data)} bytes, {img.get('mime_type')})")
    return True


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, prompt in PROMPTS.items():
        try:
            await gen_one(name, prompt)
        except Exception as e:
            print(f"[{name}] ERROR: {e}")


if __name__ == "__main__":
    asyncio.run(main())
