from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "icons"
SCALE = 4


def scaled(value: int) -> int:
    return value * SCALE


def make_icon(size: int) -> None:
    canvas_size = size * SCALE
    image = Image.new("RGB", (canvas_size, canvas_size), "#b52a22")
    draw = ImageDraw.Draw(image)

    def point(value: float) -> int:
        return round(value * canvas_size)

    draw.ellipse(
        (point(0.172), point(0.172), point(0.828), point(0.828)),
        fill="#fff8ea",
    )
    draw.rounded_rectangle(
        (point(0.324), point(0.258), point(0.676), point(0.742)),
        radius=point(0.035),
        fill="#b52a22",
    )
    draw.rounded_rectangle(
        (point(0.387), point(0.332), point(0.613), point(0.668)),
        radius=point(0.014),
        fill="#fff8ea",
    )
    draw.rectangle(
        (point(0.387), point(0.477), point(0.613), point(0.523)),
        fill="#b52a22",
    )

    image = image.resize((size, size), Image.Resampling.LANCZOS)
    image.save(ICON_DIR / f"icon-{size}.png", optimize=True)


if __name__ == "__main__":
    ICON_DIR.mkdir(exist_ok=True)
    for icon_size in (192, 512):
        make_icon(icon_size)
