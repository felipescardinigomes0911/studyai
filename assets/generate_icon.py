#!/usr/bin/env python3
"""Generate a PNG icon for Dybass Estudioso using Pillow."""

try:
    from PIL import Image, ImageDraw, ImageFont
    import math

    size = 512
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background rounded rect
    bg_color = (10, 0, 0, 255)
    acc_color = (139, 0, 0, 255)
    light_acc = (192, 57, 43, 255)

    # Draw background circle
    draw.ellipse([0, 0, size-1, size-1], fill=(18, 0, 0, 255))

    # Draw book left page
    draw.rounded_rectangle([90, 110, 255, 320], radius=14, fill=acc_color)
    # Draw book right page
    draw.rounded_rectangle([257, 110, 422, 320], radius=14, fill=light_acc)

    # Lines on left page
    for y in [155, 180, 205, 230, 255]:
        w = [95, 70, 85, 65, 80][((y-155)//25)]
        draw.rounded_rectangle([110, y, 110+w, y+8], radius=4, fill=(80, 0, 0, 200))

    # Lines on right page
    for y in [155, 180, 205, 230, 255]:
        w = [95, 70, 85, 65, 80][((y-155)//25)]
        draw.rounded_rectangle([272, y, 272+w, y+8], radius=4, fill=(160, 30, 20, 200))

    # Spine
    draw.rounded_rectangle([250, 110, 260, 320], radius=4, fill=(60, 0, 0, 255))

    # Letter D
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 140)
    except:
        font = ImageFont.load_default()

    draw.text((256, 340), 'D', font=font, fill=(255, 255, 255, 230), anchor='mm' if hasattr(font, 'getbbox') else None)

    img.save('icon.png', 'PNG')
    print("icon.png created successfully")

except ImportError:
    print("Pillow not available, using SVG only")
except Exception as e:
    print(f"Error: {e}")
