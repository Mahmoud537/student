from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageDraw

source = Path("attached_assets/طولى_1792450710629.pdf")
output = Path(".agents/outputs/attached-pdf")
output.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
thumbnails = []

for page_number, page in enumerate(document, start=1):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.7, 1.7), alpha=False)
    image_path = output / f"page-{page_number:02}.png"
    pixmap.save(image_path)
    image = Image.open(image_path).convert("RGB")
    image.thumbnail((380, 540))
    tile = Image.new("RGB", (400, 580), "white")
    tile.paste(image, ((400 - image.width) // 2, 25))
    ImageDraw.Draw(tile).text((12, 6), f"Page {page_number}", fill="#1b443d")
    thumbnails.append(tile)

columns = 2
rows = (len(thumbnails) + columns - 1) // columns
sheet = Image.new("RGB", (columns * 400, rows * 580), "#e9eee9")
for index, thumbnail in enumerate(thumbnails):
    sheet.paste(thumbnail, ((index % columns) * 400, (index // columns) * 580))
sheet.save(output / "contact-sheet.jpg", quality=88)

header_pages = [1, 2, 9, 10]
header_tiles = []
for page_number in header_pages:
    page = document[page_number - 1]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
    full = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    crop = full.crop((0, 0, full.width, int(full.height * 0.26)))
    crop.thumbnail((1800, 560))
    tile = Image.new("RGB", (1840, 600), "white")
    tile.paste(crop, ((1840 - crop.width) // 2, 28))
    ImageDraw.Draw(tile).text((14, 7), f"Page {page_number} header", fill="#1b443d")
    header_tiles.append(tile)

headers = Image.new("RGB", (3680, 1200), "#e9eee9")
for index, tile in enumerate(header_tiles):
    headers.paste(tile, ((index % 2) * 1840, (index // 2) * 600))
headers.save(output / "header-details.jpg", quality=92)

print(f"Rendered {len(document)} pages to {output}")
print(f"Contact sheet: {output / 'contact-sheet.jpg'}")
print(f"Header detail: {output / 'header-details.jpg'}")
