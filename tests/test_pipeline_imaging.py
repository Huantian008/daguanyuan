import fitz
from PIL import Image

from pipeline.imaging import extract_image, trim_whitespace


def test_trim_whitespace_keeps_content_plus_padding():
    img = Image.new("RGB", (200, 100), "white")
    img.paste((0, 0, 0), (50, 20, 70, 30))  # 20x10 black box
    trimmed = trim_whitespace(img, pad=5)
    assert trimmed.size == (30, 20)


def test_trim_whitespace_leaves_blank_image_alone():
    img = Image.new("RGB", (40, 30), "white")
    assert trim_whitespace(img, pad=5).size == (40, 30)


def test_extract_image_flattens_transparency_onto_white(tmp_path):
    rgba = Image.new("RGBA", (20, 10), (0, 0, 0, 0))
    rgba.paste((255, 0, 0, 255), (0, 0, 10, 10))  # left half opaque red, right half transparent
    png = tmp_path / "a.png"
    rgba.save(png)
    doc = fitz.open()
    page = doc.new_page()
    xref = page.insert_image(fitz.Rect(0, 0, 200, 100), filename=str(png))

    img = extract_image(doc, xref)

    assert img.mode == "RGB"
    assert img.getpixel((2, 5)) == (255, 0, 0)
    assert img.getpixel((15, 5)) == (255, 255, 255)
