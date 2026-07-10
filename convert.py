import os
from PIL import Image

def convert_png_to_webp(directory):
    for filename in os.listdir(directory):
        if filename.endswith(".png"):
            filepath = os.path.join(directory, filename)
            # Open the image
            img = Image.open(filepath)
            # Ensure image is in RGB mode for WebP conversion
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            
            # Save as webp
            webp_path = os.path.join(directory, filename.replace(".png", ".webp"))
            img.save(webp_path, "WEBP", quality=80)
            print(f"Converted: {filename} -> {os.path.basename(webp_path)}")
            
            # Optionally remove the original PNG to save space
            os.remove(filepath)

if __name__ == "__main__":
    images_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "public", "images"))
    convert_png_to_webp(images_dir)
