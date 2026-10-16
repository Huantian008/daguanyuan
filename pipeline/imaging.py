"""Turn PDF regions and embedded images into web images."""
from io import BytesIO
from pathlib import Path

import fitz
from PIL import Image


def trim_whitespace(img: Image.Image, pad: int = 8, threshold: int = 245) -> Image.Image:
    ink = img.convert("L").point(lambda v: 255 if v < threshold else 0)
    box = ink.getbbox()
    if box is None:
        return img
    x0, y0, x1, y1 = box
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))


def render_clip(page: fitz.Page, rect, zoom: float) -> Image.Image:
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=fitz.Rect(rect), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def _to_pil(pix: fitz.Pixmap) -> Image.Image:
    img = Image.open(BytesIO(pix.tobytes("png")))
    img.load()
    return img


def _on_white(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA", "P", "PA"):
        rgba = img.convert("RGBA")
        img = Image.alpha_composite(Image.new("RGBA", rgba.size, (255, 255, 255, 255)), rgba)
    return img.convert("RGB")


def extract_image(doc: fitz.Document, xref: int) -> Image.Image:
    """An embedded image at its native resolution, with any soft mask flattened onto white."""
    pix = fitz.Pixmap(doc, xref)
    if pix.colorspace is not None and pix.colorspace.n > 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    img = _on_white(_to_pil(pix))
    smask = doc.xref_get_key(xref, "SMask")
    if smask[0] == "xref":
        mask = _to_pil(fitz.Pixmap(doc, int(smask[1].split()[0]))).convert("L")
        if mask.size != img.size:
            mask = mask.resize(img.size)
        img = Image.composite(img, Image.new("RGB", img.size, "white"), mask)
    return img


def is_jpeg(doc: fitz.Document, xref: int) -> bool:
    return "DCTDecode" in doc.xref_get_key(xref, "Filter")[1]


def save_webp(img: Image.Image, path: Path, lossless: bool = True, quality: int = 90) -> tuple[int, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", lossless=lossless, quality=quality, method=4)
    return img.size
