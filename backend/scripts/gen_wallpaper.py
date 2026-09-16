"""One-off: generate the Await auth wallpaper (dark) with Gemini Nano Banana."""
import asyncio
import base64
import os
import sys

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

PROMPT = (
    "Premium mobile app login wallpaper, portrait 9:19.5, no text, no letters, no logos, no people. "
    "Theme: waiting for things others promised you — refunds, parcels, documents, appointments — getting resolved. "
    "Deep midnight navy background (#07111F to #0E1B2B) with soft depth-of-field bokeh. "
    "Floating translucent glass objects, subtle 3D, low contrast, tastefully faded so UI text stays readable: "
    "an open circular loop ring in electric blue (#168CFF) with a small glowing amber dot (#FFB020) at its end, "
    "a small parcel box, an envelope, a calendar page, a clock face, a check mark badge, gently scattered and blurred. "
    "Thin luminous curved connecting lines. Cinematic, Samsung One UI wallpaper quality, clean, calm, elegant, "
    "very dark overall, most of the frame nearly empty near the bottom third for buttons."
)


async def main(out: str):
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id="await-wallpaper", system_message="You generate images.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    text, images = await chat.send_message_multimodal_response(UserMessage(text=PROMPT))
    if not images:
        print("no image", (text or "")[:200])
        sys.exit(1)
    with open(out, "wb") as f:
        f.write(base64.b64decode(images[0]["data"]))
    print("saved", out, images[0]["mime_type"])


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
