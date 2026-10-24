#!/usr/bin/env python3
import os
import shutil
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps
import rembg

ARTIFACTS_DIR = Path("/home/sanuel/.gemini/antigravity/brain/98476bbd-cd2b-4100-b60a-0008c8879c08/muestra")
OUTPUT_DIR = Path("imagenes-carpeta/muestra-rmbg")
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SAMPLES = [
    {
        "id": "HImqv7CjrXdu6MEl84ML",
        "nombre": "Colores Norma original",
        "archivo": "imagenes-carpeta/HImqv7CjrXdu6MEl84ML.webp",
    },
    {
        "id": "x2h6fzIDEo1zu4HLhRFp",
        "nombre": "Tijeras de oficina",
        "archivo": "imagenes-carpeta/x2h6fzIDEo1zu4HLhRFp.webp",
    },
    {
        "id": "Sbn8EPbI0EYQ8R9JjraD",
        "nombre": "Liquipeiper",
        "archivo": "imagenes-carpeta/Sbn8EPbI0EYQ8R9JjraD.webp",
    },
    {
        "id": "vNPPv32Btv7HmHaLmswa",
        "nombre": "Pega loka",
        "archivo": "imagenes-carpeta/vNPPv32Btv7HmHaLmswa.webp",
    },
    {
        "id": "D0nr37UQzd1qP195pD1h",
        "nombre": "Cartucheras",
        "archivo": "imagenes-carpeta/D0nr37UQzd1qP195pD1h.webp",
    },
]

def add_studio_shadow_and_background(fg_img, canvas_size=(800, 800), padding=60):
    """
    Coloca el objeto recortado sobre fondo blanco limpio con una sombra
    de contacto suave y realista en la base.
    """
    # 1. Recortar al bounding box de contenido visible
    bbox = fg_img.getbbox()
    if bbox:
        fg_img = fg_img.crop(bbox)

    # 2. Escalar proporcionalmente para caber en canvas_size menos padding
    max_w = canvas_size[0] - (padding * 2)
    max_h = canvas_size[1] - (padding * 2)

    w_ratio = max_w / fg_img.width
    h_ratio = max_h / fg_img.height
    scale = min(w_ratio, h_ratio)

    new_w = int(fg_img.width * scale)
    new_h = int(fg_img.height * scale)
    fg_resized = fg_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # 3. Posicionar el objeto centrado horizontalmente y ligeramente hacia el centro-abajo
    pos_x = (canvas_size[0] - new_w) // 2
    pos_y = (canvas_size[1] - new_h) // 2

    # 4. Crear sombra de contacto difusa
    # Usamos la máscara alpha del producto para crear una sombra en la base
    alpha = fg_resized.split()[3]
    
    # Sombra de piso / contacto: achatamos la silueta verticalmente
    shadow_w = new_w
    shadow_h = max(int(new_h * 0.15), 16)
    shadow_mask = alpha.resize((shadow_w, shadow_h), Image.Resampling.BILINEAR)
    
    # Crear imagen negra con esa máscara y blur suave
    shadow_layer = Image.new("RGBA", (shadow_w, shadow_h), (0, 0, 0, 0))
    # Opacidad máxima ~30%
    shadow_alpha = shadow_mask.point(lambda p: int(p * 0.28) if p > 10 else 0)
    shadow_layer.putalpha(shadow_alpha)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=8))

    # Canvas blanco puro
    canvas = Image.new("RGBA", canvas_size, (255, 255, 255, 255))

    # Pegar sombra justo en la base del producto
    shadow_x = pos_x
    shadow_y = pos_y + new_h - int(shadow_h * 0.55)
    canvas.paste(shadow_layer, (shadow_x, shadow_y), shadow_layer)

    # Pegar el producto encima
    canvas.paste(fg_resized, (pos_x, pos_y), fg_resized)

    # Convertir a RGB sobre fondo blanco
    bg_rgb = Image.new("RGB", canvas_size, (255, 255, 255))
    bg_rgb.paste(canvas, mask=canvas.split()[3])
    return bg_rgb, fg_resized

def main():
    print("Inicializando sesión de alta precisión (birefnet-general-lite)...")
    session = rembg.new_session("birefnet-general-lite")
    print("Sesión lista. Procesando 5 muestras...")

    html_rows = []

    for item in SAMPLES:
        p_id = item["id"]
        nombre = item["nombre"]
        ruta_orig = item["archivo"]
        print(f"\n--- Procesando: {nombre} ({ruta_orig}) ---")

        # Cargar original
        orig_img = Image.open(ruta_orig).convert("RGB")
        orig_filename = f"{p_id}_orig.webp"
        
        # Guardar copia de original en artifacts
        shutil.copy2(ruta_orig, ARTIFACTS_DIR / orig_filename)
        shutil.copy2(ruta_orig, OUTPUT_DIR / orig_filename)

        # Quitar fondo con bria-rmbg
        print("  -> Removiendo fondo con RMBG...")
        recortada = rembg.remove(orig_img, session=session)

        # Crear versión estudio
        print("  -> Generando composición de estudio con sombra suave...")
        estudio_img, fg_transparent = add_studio_shadow_and_background(recortada)

        # Guardar resultados
        estudio_filename = f"{p_id}_estudio.webp"
        transparente_filename = f"{p_id}_transparente.png"

        # Guardar en local y en artifacts
        estudio_path_local = OUTPUT_DIR / estudio_filename
        estudio_path_artifact = ARTIFACTS_DIR / estudio_filename
        estudio_img.save(estudio_path_local, "WEBP", quality=88)
        estudio_img.save(estudio_path_artifact, "WEBP", quality=88)

        fg_transparent.save(OUTPUT_DIR / transparente_filename, "PNG")

        tam_orig_kb = os.path.getsize(ruta_orig) / 1024
        tam_estudio_kb = os.path.getsize(estudio_path_local) / 1024

        print(f"  OK: Original ({tam_orig_kb:.1f} KB) -> Estudio ({tam_estudio_kb:.1f} KB)")

        html_rows.append(f"""
        <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
            <h3 style="margin-top: 0; color: #1e293b; font-family: sans-serif;">{nombre}</h3>
            <div style="display: flex; gap: 20px; align-items: center; justify-content: space-around; flex-wrap: wrap;">
                <div style="text-align: center;">
                    <p style="font-weight: 600; color: #64748b; margin-bottom: 8px;">Antes (Original)</p>
                    <img src="{orig_filename}" style="width: 320px; height: 320px; object-fit: contain; background: #f1f5f9; border-radius: 8px; border: 1px solid #cbd5e1;" />
                    <p style="color: #94a3b8; font-size: 13px;">{tam_orig_kb:.1f} KB</p>
                </div>
                <div style="font-size: 28px; color: #6366f1;">➔</div>
                <div style="text-align: center;">
                    <p style="font-weight: 600; color: #16a34a; margin-bottom: 8px;">Después (RMBG + Estudio)</p>
                    <img src="{estudio_filename}" style="width: 320px; height: 320px; object-fit: contain; background: white; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);" />
                    <p style="color: #16a34a; font-size: 13px; font-weight: 500;">{tam_estudio_kb:.1f} KB (WebP 800x800)</p>
                </div>
            </div>
        </div>
        """)

    # Generar visor HTML para abrir en navegador
    html_content = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Comparativa RMBG - Mis Detallitos</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; padding: 30px; margin: 0; }}
        .container {{ max-width: 900px; margin: 0 auto; }}
        h1 {{ color: #0f172a; text-align: center; }}
        p.sub {{ text-align: center; color: #64748b; margin-bottom: 40px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Muestra de Recorte y Acabado Profesional</h1>
        <p class="sub">Modelo: BRIA RMBG-1.4 | Fondo blanco puro + Sombra suave de contacto | WebP optimizado</p>
        {"".join(html_rows)}
    </div>
</body>
</html>
"""
    with open(OUTPUT_DIR / "comparacion.html", "w", encoding="utf-8") as f:
        f.write(html_content)
    with open(ARTIFACTS_DIR / "comparacion.html", "w", encoding="utf-8") as f:
        f.write(html_content)

    print("\n¡Listo! Muestra procesada y comparador HTML generado exitosamente.")

if __name__ == "__main__":
    main()
